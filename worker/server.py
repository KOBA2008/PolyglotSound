"""PolyglotSound : worker GPU (FastAPI, port 9000).

Tous les modèles lourds vivent ici. Chaque modèle est chargé paresseusement au premier
appel puis gardé en cache (avec déchargement LRU si la VRAM manque).
Spécification des routes : docs/CONTRACT.md, section « API worker GPU ».

Lancement : uvicorn server:app --host 0.0.0.0 --port 9000

Variables d'environnement :
  WORKER_TOKEN        si défini, chaque requête doit porter le header X-Worker-Token
  SEEDVC_DIR          dossier du dépôt Seed-VC cloné (défaut : auto-détection)
  SEEDVC_RESERVE_GB   VRAM libre visée avant de lancer Seed-VC (défaut 6)
  SEEDVC_STEPS        pas de diffusion par défaut (défaut 30)
  SEEDVC_TIMEOUT      délai max du sous-processus Seed-VC en s (défaut 1200)
  SEEDVC_MODE         "daemon" (défaut : modèles Seed-VC gardés en mémoire dans un processus fils)
                      ou "subprocess" (un processus par conversion, recharge à chaque fois)
  WATERMARK_DB        fichier JSON de la table message <-> bits (défaut worker/watermark_messages.json)
  WORKER_FP16_NLLB    "0" pour garder NLLB en float32 (défaut : float16 sur GPU)

Règle : aucun import lourd (torch, transformers, librosa...) au niveau du module,
pour que `import server` reste instantané et ne plante pas si un paquet manque.
"""
from __future__ import annotations

import base64
import gc
import glob
import hashlib
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

log = logging.getLogger("polyglotsound.worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s : %(message)s")

WORKER_DIR = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(WORKER_DIR, "seedvc_runner.py")

# --------------------------------------------------------------------------------------
# Langues
# --------------------------------------------------------------------------------------
LANGS = ("fon", "yor", "fra", "eng")
_LANG_ALIASES = {
    "fon": "fon", "fon_latn": "fon", "fongbe": "fon",
    "yor": "yor", "yo": "yor", "yor_latn": "yor", "yoruba": "yor",
    "fra": "fra", "fr": "fra", "fre": "fra", "fra_latn": "fra", "french": "fra",
    "eng": "eng", "en": "eng", "eng_latn": "eng", "english": "eng",
}
NLLB_CODES = {"fon": "fon_Latn", "yor": "yor_Latn", "fra": "fra_Latn", "eng": "eng_Latn"}


def norm_lang(lang: Optional[str]) -> str:
    key = (lang or "").strip().lower()
    if key not in _LANG_ALIASES:
        raise HTTPException(400, f"Langue non prise en charge : '{lang}'. Valeurs possibles : fon, yor, fra, eng.")
    return _LANG_ALIASES[key]


# --------------------------------------------------------------------------------------
# Torch / device (import paresseux)
# --------------------------------------------------------------------------------------
def _torch():
    import torch  # noqa: WPS433
    return torch


_DEVICE: Optional[str] = None


def device() -> str:
    global _DEVICE
    if _DEVICE is None:
        try:
            _DEVICE = "cuda" if _torch().cuda.is_available() else "cpu"
        except Exception:  # torch absent
            _DEVICE = "cpu"
    return _DEVICE


def vram_info() -> Optional[Dict[str, float]]:
    try:
        torch = _torch()
        if not torch.cuda.is_available():
            return None
        free, total = torch.cuda.mem_get_info()
        return {"free_gb": round(free / 1e9, 2), "total_gb": round(total / 1e9, 2),
                "allocated_gb": round(torch.cuda.memory_allocated() / 1e9, 2)}
    except Exception:
        return None


# --------------------------------------------------------------------------------------
# Registre des modèles : chargement paresseux + cache + déchargement LRU
# --------------------------------------------------------------------------------------
# VRAM estimée (Go, poids + marge d'inférence), utilisée pour décider des déchargements.
VRAM_EST_GB = {
    "demucs": 2.5,
    "mms_asr": 4.5,
    "mms_fa": 1.6,
    "nllb": 1.6,
    "audioseal_gen": 0.2,
    "audioseal_det": 0.2,
    "torchcrepe": 0.5,
    "uroman": 0.0,
    "seedvc": 5.0,
}


class ModelRegistry:
    def __init__(self) -> None:
        self._models: Dict[str, Any] = {}
        self._last_used: Dict[str, float] = {}
        self._locks: Dict[str, threading.Lock] = {}
        self._global = threading.Lock()

    def _lock_for(self, name: str) -> threading.Lock:
        with self._global:
            if name not in self._locks:
                self._locks[name] = threading.Lock()
            return self._locks[name]

    def get(self, name: str, loader: Callable[[], Any], est_gb: Optional[float] = None) -> Any:
        if name in self._models:
            self._last_used[name] = time.time()
            return self._models[name]
        with self._lock_for(name):
            if name in self._models:
                return self._models[name]
            need = est_gb if est_gb is not None else VRAM_EST_GB.get(name.split(":")[0], 0.5)
            self.make_room(need, keep=(name,))
            t0 = time.time()
            log.info("Chargement du modèle %s ...", name)
            obj = loader()
            self._models[name] = obj
            self._last_used[name] = time.time()
            log.info("Modèle %s chargé en %.1f s", name, time.time() - t0)
            return obj

    def mark(self, name: str) -> None:
        """Enregistre un « modèle » géré ailleurs (ex. torchcrepe) pour /health."""
        self._models.setdefault(name, True)
        self._last_used[name] = time.time()

    def loaded(self) -> List[str]:
        return sorted(self._models.keys())

    def unload(self, name: str) -> None:
        obj = self._models.pop(name, None)
        self._last_used.pop(name, None)
        if obj is not None:
            close = getattr(obj, "close", None)
            if callable(close):
                try:
                    close()
                except Exception as exc:
                    log.warning("Fermeture de %s : %s", name, exc)
            del obj
            log.info("Modèle %s déchargé", name)
        _free_cuda()

    def unload_all(self, keep: Tuple[str, ...] = ()) -> None:
        for name in list(self._models.keys()):
            if name not in keep:
                self.unload(name)

    def make_room(self, need_gb: float, keep: Tuple[str, ...] = ()) -> None:
        """Décharge les modèles les moins récemment utilisés tant que la VRAM libre < need_gb."""
        info = vram_info()
        if info is None or need_gb <= 0:
            return
        while info["free_gb"] < need_gb:
            candidates = [n for n in self._models if n not in keep and n not in ("uroman", "torchcrepe")]
            if not candidates:
                break
            oldest = min(candidates, key=lambda n: self._last_used.get(n, 0.0))
            log.info("VRAM libre %.2f Go < %.2f Go : déchargement de %s", info["free_gb"], need_gb, oldest)
            self.unload(oldest)
            info = vram_info() or info


def _free_cuda() -> None:
    gc.collect()
    try:
        torch = _torch()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


REG = ModelRegistry()
# Un seul calcul GPU à la fois : évite les OOM quand le backend enchaîne les appels.
GPU_LOCK = threading.RLock()


# --------------------------------------------------------------------------------------
# Audio : lecture, rééchantillonnage, encodage base64 WAV
# --------------------------------------------------------------------------------------
def _save_upload(upload: UploadFile, tmpdir: str, name: str) -> str:
    ext = os.path.splitext(upload.filename or "")[1].lower() or ".wav"
    if len(ext) > 6:
        ext = ".wav"
    path = os.path.join(tmpdir, name + ext)
    with open(path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    if os.path.getsize(path) == 0:
        raise HTTPException(400, f"Fichier audio vide : {upload.filename or name}")
    return path


def read_audio_path(path: str) -> Tuple[np.ndarray, int]:
    """Renvoie (audio float32 de forme (canaux, échantillons), sr)."""
    try:
        import soundfile as sf
        data, sr = sf.read(path, dtype="float32", always_2d=True)
        audio = data.T
    except Exception:
        try:
            import librosa
            audio, sr = librosa.load(path, sr=None, mono=False)
            audio = np.atleast_2d(audio).astype(np.float32)
        except Exception as exc:
            raise HTTPException(400, f"Impossible de lire le fichier audio ({exc}).") from exc
    if audio.size == 0:
        raise HTTPException(400, "Le fichier audio ne contient aucun échantillon.")
    audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)
    return np.ascontiguousarray(audio, dtype=np.float32), int(sr)


def read_upload(upload: UploadFile, name: str = "input") -> Tuple[np.ndarray, int]:
    tmpdir = tempfile.mkdtemp(prefix="pgs_")
    try:
        return read_audio_path(_save_upload(upload, tmpdir, name))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def to_mono(audio: np.ndarray) -> np.ndarray:
    return audio.mean(axis=0) if audio.ndim == 2 else audio


def resample(y: np.ndarray, sr_from: int, sr_to: int) -> np.ndarray:
    if sr_from == sr_to:
        return y.astype(np.float32, copy=False)
    import librosa
    return librosa.resample(y.astype(np.float32), orig_sr=sr_from, target_sr=sr_to).astype(np.float32)


def fit_length(y: np.ndarray, n: int) -> np.ndarray:
    """Coupe ou complète par des zéros (dernier axe) pour obtenir exactement n échantillons."""
    n = max(0, int(n))
    cur = y.shape[-1]
    if cur == n:
        return y
    if cur > n:
        return y[..., :n]
    pad = [(0, 0)] * (y.ndim - 1) + [(0, n - cur)]
    return np.pad(y, pad)


def wav_bytes(y: np.ndarray, sr: int) -> bytes:
    import soundfile as sf
    y = np.asarray(y, dtype=np.float32)
    if y.ndim == 2:
        y = y.T  # (canaux, n) -> (n, canaux)
    y = np.clip(np.nan_to_num(y), -1.0, 1.0)
    buf = io.BytesIO()
    sf.write(buf, y, int(sr), format="WAV", subtype="PCM_16")
    return buf.getvalue()


def wav_b64(y: np.ndarray, sr: int) -> str:
    return base64.b64encode(wav_bytes(y, sr)).decode("ascii")


def write_wav(path: str, y: np.ndarray, sr: int) -> None:
    with open(path, "wb") as f:
        f.write(wav_bytes(y, sr))


def peak_normalize(y: np.ndarray, peak: float = 0.95) -> np.ndarray:
    m = float(np.max(np.abs(y))) if y.size else 0.0
    return y * (peak / m) if m > 1e-6 else y


# --------------------------------------------------------------------------------------
# App, auth, erreurs
# --------------------------------------------------------------------------------------
app = FastAPI(title="PolyglotSound worker GPU", version="1.0")


def check_token(x_worker_token: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("WORKER_TOKEN", "").strip()
    if expected and x_worker_token != expected:
        raise HTTPException(401, "Jeton X-Worker-Token absent ou invalide.")


AUTH = [Depends(check_token)]


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):  # noqa: D401
    log.error("Erreur sur %s : %s\n%s", request.url.path, exc, traceback.format_exc())
    msg = str(exc)
    if "out of memory" in msg.lower():
        REG.unload_all()
        msg = "Mémoire GPU saturée ; les modèles ont été déchargés, relancez la requête. " + msg
    return JSONResponse(status_code=500, content={"detail": f"Erreur du worker ({type(exc).__name__}) : {msg}"})


def _parse_json_field(raw: str, field: str) -> Any:
    try:
        return json.loads(raw)
    except Exception as exc:
        raise HTTPException(400, f"Champ '{field}' : JSON invalide ({exc}).") from exc


# --------------------------------------------------------------------------------------
# /health
# --------------------------------------------------------------------------------------
@app.get("/health", dependencies=AUTH)
def health():
    info: Dict[str, Any] = {"ok": True, "device": device(), "models_loaded": REG.loaded()}
    try:
        torch = _torch()
        info["torch"] = torch.__version__
        if torch.cuda.is_available():
            info["gpu"] = torch.cuda.get_device_name(0)
    except Exception:
        info["torch"] = None
    info["vram"] = vram_info()
    info["seedvc_dir"] = seedvc_dir()
    return info


# --------------------------------------------------------------------------------------
# /separate : Demucs htdemucs
# --------------------------------------------------------------------------------------
def _load_demucs():
    from demucs.pretrained import get_model
    model = get_model("htdemucs")
    model.to(device())
    model.eval()
    return model


def separate_array(audio: np.ndarray, sr: int) -> Tuple[np.ndarray, np.ndarray, int]:
    torch = _torch()
    from demucs.apply import apply_model

    model = REG.get("demucs", _load_demucs)
    msr = int(model.samplerate)
    ch = int(model.audio_channels)
    if audio.shape[0] == 1 and ch == 2:
        audio = np.repeat(audio, 2, axis=0)
    elif audio.shape[0] > ch:
        audio = audio[:ch] if ch == 2 else audio.mean(axis=0, keepdims=True)
    audio = resample(audio, sr, msr)
    wav = torch.from_numpy(np.ascontiguousarray(audio))
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(model, ((wav - mean) / std)[None], device=device(),
                          shifts=1, split=True, overlap=0.25, progress=False)
    out = (out * std + mean)[0].cpu().numpy()  # (sources, canaux, n)
    sources = list(model.sources)
    vi = sources.index("vocals")
    vocals = out[vi]
    instrumental = np.sum([out[i] for i in range(len(sources)) if i != vi], axis=0)
    return vocals.astype(np.float32), instrumental.astype(np.float32), msr


@app.post("/separate", dependencies=AUTH)
def separate(file: UploadFile = File(...)):
    audio, sr = read_upload(file)
    with GPU_LOCK:
        vocals, instrumental, out_sr = separate_array(audio, sr)
    return {"vocals_b64": wav_b64(vocals, out_sr), "instrumental_b64": wav_b64(instrumental, out_sr),
            "sr": out_sr, "duration": round(vocals.shape[-1] / out_sr, 3)}


# --------------------------------------------------------------------------------------
# /transcribe : MMS-1b-all + découpe par silences
# --------------------------------------------------------------------------------------
MMS_ASR_ID = "facebook/mms-1b-all"
_ASR_STATE = {"lang": None}


def _load_mms_asr():
    from transformers import AutoProcessor, Wav2Vec2ForCTC
    processor = AutoProcessor.from_pretrained(MMS_ASR_ID)
    model = Wav2Vec2ForCTC.from_pretrained(MMS_ASR_ID)
    model.to(device())
    model.eval()
    _ASR_STATE["lang"] = None
    return {"processor": processor, "model": model}


def _asr_for(lang: str):
    bundle = REG.get("mms_asr", _load_mms_asr)
    if _ASR_STATE["lang"] != lang:
        bundle["processor"].tokenizer.set_target_lang(lang)
        bundle["model"].load_adapter(lang)
        _ASR_STATE["lang"] = lang
    return bundle


def split_on_silence(y: np.ndarray, sr: int, top_db: float = 35.0, merge_gap: float = 0.35,
                     min_len: float = 0.25, max_len: float = 12.0) -> List[Tuple[int, int]]:
    import librosa
    if y.size == 0 or float(np.max(np.abs(y))) < 1e-5:
        return []
    intervals = librosa.effects.split(y, top_db=top_db, frame_length=1024, hop_length=256)
    merged: List[List[int]] = []
    for s, e in intervals:
        if merged and (s - merged[-1][1]) < merge_gap * sr and (e - merged[-1][0]) <= max_len * sr:
            merged[-1][1] = int(e)
        else:
            merged.append([int(s), int(e)])
    out: List[Tuple[int, int]] = []
    hop = int(0.01 * sr)
    for s, e in merged:
        if e - s < min_len * sr:
            continue
        # Segment trop long : découpe aux minima d'énergie, morceaux <= max_len
        while e - s > max_len * sr:
            lo, hi = s + int(0.5 * max_len * sr), s + int(max_len * sr)
            seg = y[lo:hi]
            if seg.size > 4 * hop:
                rms = librosa.feature.rms(y=seg, frame_length=4 * hop, hop_length=hop)[0]
                cut = lo + int(np.argmin(rms)) * hop
            else:
                cut = hi
            cut = min(max(cut, s + int(min_len * sr)), e)
            out.append((s, cut))
            s = cut
        if e - s >= min_len * sr:
            out.append((s, e))
    return out


@app.post("/transcribe", dependencies=AUTH)
def transcribe(file: UploadFile = File(...), lang: str = Form("fon")):
    torch = _torch()
    lang = norm_lang(lang)
    audio, sr = read_upload(file)
    y = resample(to_mono(audio), sr, 16000)
    segs = split_on_silence(y, 16000)
    results = []
    with GPU_LOCK:
        bundle = _asr_for(lang)
        processor, model = bundle["processor"], bundle["model"]
        for s, e in segs:
            seg = y[s:e]
            inputs = processor(seg, sampling_rate=16000, return_tensors="pt")
            inputs = {k: v.to(device()) for k, v in inputs.items()}
            with torch.no_grad():
                logits = model(**inputs).logits
            ids = torch.argmax(logits, dim=-1)[0]
            text = processor.decode(ids).strip()
            results.append({"text": text, "start": round(s / 16000, 3), "end": round(e / 16000, 3)})
    return {"segments": results, "lang": lang, "duration": round(len(y) / 16000, 3)}


# --------------------------------------------------------------------------------------
# /align : torchaudio MMS_FA + uroman
# --------------------------------------------------------------------------------------
def _load_uroman():
    import uroman as ur
    return ur.Uroman()


def romanize(text: str, lang: str) -> str:
    import re
    try:
        rom = REG.get("uroman", _load_uroman, est_gb=0).romanize_string(text, lcode=lang)
    except Exception as exc:  # uroman absent : repli sur une simple désaccentuation
        log.warning("uroman indisponible (%s), repli unicodedata", exc)
        import unicodedata
        rom = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    rom = str(rom).lower().replace("’", "'")
    rom = re.sub(r"([^a-z' ])", " ", rom)
    rom = re.sub(r" +", " ", rom)
    return rom.strip()


def _load_mms_fa():
    from torchaudio.pipelines import MMS_FA as bundle
    model = bundle.get_model()
    model.to(device())
    model.eval()
    return {"model": model, "tokenizer": bundle.get_tokenizer(), "aligner": bundle.get_aligner(),
            "sr": int(bundle.sample_rate)}


def ctc_viterbi_words(logp: np.ndarray, word_tokens: List[List[int]], blank: int = 0
                      ) -> Optional[List[Tuple[int, int]]]:
    """Alignement forcé CTC de secours (numpy). Renvoie [(frame_debut, frame_fin)] par mot."""
    flat = [t for w in word_tokens for t in w]
    L, T = len(flat), logp.shape[0]
    if L == 0:
        return None
    repeats = sum(1 for i in range(1, L) if flat[i] == flat[i - 1])
    if T < L + repeats:
        return None
    ext = [blank]
    for t in flat:
        ext += [t, blank]
    ext_arr = np.array(ext)
    S = len(ext)
    neg = -1e30
    skip_ok = np.zeros(S, dtype=bool)
    for s in range(2, S):
        skip_ok[s] = ext[s] != blank and ext[s] != ext[s - 2]
    dp = np.full(S, neg)
    dp[0] = logp[0, blank]
    dp[1] = logp[0, ext[1]]
    bp = np.zeros((T, S), dtype=np.int8)
    for t in range(1, T):
        m1 = np.concatenate([[neg], dp[:-1]])
        m2 = np.concatenate([[neg, neg], dp[:-2]])
        m2[~skip_ok] = neg
        stack = np.stack([dp, m1, m2])
        arg = stack.argmax(0)
        dp = stack[arg, np.arange(S)] + logp[t, ext_arr]
        bp[t] = arg
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    states = np.zeros(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        states[t] = s
        s -= int(bp[t, s])
        s = max(s, 0)
    # frames par token
    tok_frames: Dict[int, List[int]] = {}
    for t, st in enumerate(states):
        if st % 2 == 1:
            tok_frames.setdefault((st - 1) // 2, []).append(t)
    spans = []
    k = 0
    for w in word_tokens:
        idx = list(range(k, k + len(w)))
        k += len(w)
        frames = [f for i in idx for f in tok_frames.get(i, [])]
        if not frames:
            return None
        spans.append((min(frames), max(frames) + 1))
    return spans


def _uniform_words(words: List[str], start: float, end: float) -> List[Dict[str, Any]]:
    if not words:
        return []
    weights = np.array([max(1, len(w)) for w in words], dtype=float)
    edges = start + np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * max(0.0, end - start)
    return [{"text": w, "start": round(float(edges[i]), 3), "end": round(float(edges[i + 1]), 3), "method": "uniform"}
            for i, w in enumerate(words)]


def align_line(y16: np.ndarray, text: str, start: float, end: float, lang: str, fa: Dict[str, Any]
               ) -> List[Dict[str, Any]]:
    torch = _torch()
    words = [w for w in (text or "").split() if w.strip()]
    if not words:
        return []
    total = len(y16) / 16000
    start = max(0.0, float(start))
    end = min(total, float(end)) if end is not None else total
    if end - start < 0.05:
        return _uniform_words(words, start, max(end, start + 0.05))
    pad = 0.15
    w0, w1 = max(0.0, start - pad), min(total, end + pad)
    seg = y16[int(w0 * 16000):int(w1 * 16000)]
    rom = [romanize(w, lang) for w in words]
    # Un mot romanisé peut contenir des espaces (ou être vide) : on retire les espaces.
    rom = [r.replace(" ", "") for r in rom]
    keep = [i for i, r in enumerate(rom) if r]
    if not keep or seg.size < 1600:
        return _uniform_words(words, start, end)
    transcript = [rom[i] for i in keep]
    wave = torch.from_numpy(np.ascontiguousarray(seg, dtype=np.float32))[None].to(device())
    with torch.inference_mode():
        emission, _ = fa["model"](wave)
    n_frames = emission.size(1)
    ratio = seg.shape[0] / max(1, n_frames) / 16000.0  # secondes par frame
    spans_s: Optional[List[Tuple[int, int]]] = None
    method = "mms_fa"
    try:
        tokens = fa["tokenizer"](transcript)
        token_spans = fa["aligner"](emission[0], tokens)
        spans_s = [(int(sp[0].start), int(sp[-1].end)) for sp in token_spans]
    except Exception as exc:
        log.warning("Aligneur torchaudio indisponible ou en échec (%s) : repli Viterbi numpy", exc)
        try:
            tokens = fa["tokenizer"](transcript)
            spans_s = ctc_viterbi_words(emission[0].float().cpu().numpy(), tokens)
            method = "viterbi"
        except Exception as exc2:
            log.warning("Repli Viterbi en échec : %s", exc2)
            spans_s = None
    if not spans_s:
        return _uniform_words(words, start, end)
    timed: Dict[int, Tuple[float, float]] = {}
    for j, i in enumerate(keep):
        a, b = spans_s[j]
        timed[i] = (w0 + a * ratio, w0 + b * ratio)
    out = []
    for i, w in enumerate(words):
        if i in timed:
            a, b = timed[i]
        else:  # mot non romanisable : on le colle au voisin
            prev = max([k for k in timed if k < i], default=None)
            nxt = min([k for k in timed if k > i], default=None)
            a = timed[prev][1] if prev is not None else start
            b = timed[nxt][0] if nxt is not None else a
            b = max(a, b)
        out.append({"text": w, "start": round(a, 3), "end": round(b, 3), "method": method})
    return out


@app.post("/align", dependencies=AUTH)
def align(file: UploadFile = File(...), lines: str = Form(...), lang: str = Form("fon")):
    lang = norm_lang(lang)
    items = _parse_json_field(lines, "lines")
    if isinstance(items, dict) and "lines" in items:
        items = items["lines"]
    if not isinstance(items, list):
        raise HTTPException(400, "Champ 'lines' : liste JSON [{text,start,end}] attendue.")
    audio, sr = read_upload(file)
    y16 = resample(to_mono(audio), sr, 16000)
    total = len(y16) / 16000
    out = []
    with GPU_LOCK:
        fa = REG.get("mms_fa", _load_mms_fa)
        for idx, ln in enumerate(items):
            ln = ln or {}
            text = str(ln.get("text") or "")
            try:
                s = float(ln.get("start") or 0.0)
                e = float(ln.get("end") if ln.get("end") is not None else total)
            except (TypeError, ValueError):
                s, e = 0.0, total
            try:
                words = align_line(y16, text, s, e, lang, fa)
            except Exception as exc:
                log.warning("Ligne %d : alignement en échec (%s), repli uniforme", idx, exc)
                words = _uniform_words(text.split(), s, e)
            out.append({"index": ln.get("index", idx), "words": words})
    return {"lines": out}


# --------------------------------------------------------------------------------------
# /analyze : f0 (torchcrepe, repli pyin), onsets, énergie RMS ; hop 10 ms
# --------------------------------------------------------------------------------------
ANALYZE_SR = 16000
ANALYZE_HOP = 160  # 10 ms


def estimate_f0(y: np.ndarray, sr: int = ANALYZE_SR, hop: int = ANALYZE_HOP,
                fmin: float = 50.0, fmax: float = 1000.0) -> Tuple[np.ndarray, str]:
    n_frames = len(y) // hop + 1
    try:
        torch = _torch()
        import torchcrepe
        audio = torch.from_numpy(np.ascontiguousarray(y, dtype=np.float32))[None]
        with torch.no_grad():
            pitch, periodicity = torchcrepe.predict(
                audio, sr, hop_length=hop, fmin=fmin, fmax=fmax, model="full",
                decoder=torchcrepe.decode.viterbi, return_periodicity=True,
                batch_size=512, device=device(), pad=True)
        REG.mark("torchcrepe")
        periodicity = torchcrepe.filter.median(periodicity, 3)
        try:
            periodicity = torchcrepe.threshold.Silence(-60.0)(periodicity, audio, sr, hop)
        except Exception:
            pass
        pitch = torchcrepe.threshold.At(0.21)(pitch, periodicity)
        f0 = pitch[0].cpu().numpy().astype(np.float64)
        method = "torchcrepe"
    except Exception as exc:
        log.warning("torchcrepe indisponible (%s) : repli librosa.pyin", exc)
        import librosa
        f0, _, _ = librosa.pyin(y, fmin=max(fmin, 60.0), fmax=fmax, sr=sr, frame_length=2048,
                                hop_length=hop, center=True)
        method = "pyin"
    f0 = np.nan_to_num(np.asarray(f0, dtype=np.float64), nan=0.0)
    f0[(f0 < fmin) | (f0 > fmax)] = 0.0
    return fit_length(f0, n_frames), method


def analyze_array(y: np.ndarray, sr: int) -> Dict[str, Any]:
    import librosa
    y = resample(y, sr, ANALYZE_SR)
    n_frames = len(y) // ANALYZE_HOP + 1
    f0, method = estimate_f0(y)
    energy = librosa.feature.rms(y=y, frame_length=4 * ANALYZE_HOP, hop_length=ANALYZE_HOP, center=True)[0]
    energy = fit_length(energy.astype(np.float64), n_frames)
    try:
        onsets = librosa.onset.onset_detect(y=y, sr=ANALYZE_SR, hop_length=ANALYZE_HOP, units="time", backtrack=False)
    except Exception as exc:
        log.warning("onset_detect en échec : %s", exc)
        onsets = np.array([])
    return {"hop": ANALYZE_HOP / ANALYZE_SR,
            "f0": [round(float(v), 2) for v in f0],
            "onsets": [round(float(v), 3) for v in onsets],
            "energy": [round(float(v), 5) for v in energy],
            "method": method, "duration": round(len(y) / ANALYZE_SR, 3)}


@app.post("/analyze", dependencies=AUTH)
def analyze(file: UploadFile = File(...)):
    audio, sr = read_upload(file)
    with GPU_LOCK:
        return analyze_array(to_mono(audio), sr)


# --------------------------------------------------------------------------------------
# /translate : NLLB-200 distilled 600M
# --------------------------------------------------------------------------------------
NLLB_ID = "facebook/nllb-200-distilled-600M"


def _load_nllb():
    torch = _torch()
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(NLLB_ID, src_lang="fra_Latn")
    use_half = device() == "cuda" and os.environ.get("WORKER_FP16_NLLB", "1") != "0"
    model = AutoModelForSeq2SeqLM.from_pretrained(NLLB_ID, torch_dtype=torch.float16 if use_half else torch.float32)
    model.to(device())
    model.eval()
    return {"tokenizer": tok, "model": model, "by_src": {"fra_Latn": tok}}


class TranslateBody(BaseModel):
    texts: List[str]
    src: str = "fon"
    tgt: str = "fra"
    max_new_tokens: int = 160
    num_beams: int = 4


def translate_texts(texts: List[str], src: str, tgt: str, max_new_tokens: int = 160, num_beams: int = 4) -> List[str]:
    torch = _torch()
    bundle = REG.get("nllb", _load_nllb)
    tok, model = bundle["tokenizer"], bundle["model"]
    src_code, tgt_code = NLLB_CODES[src], NLLB_CODES[tgt]
    out = ["" for _ in texts]
    todo = [(i, t.strip()) for i, t in enumerate(texts) if t and t.strip()]
    if not todo or src == tgt:
        return [t or "" for t in texts] if src == tgt else out
    # Méthode documentée (model card NLLB) : un tokenizer construit avec src_lang.
    if src_code not in bundle["by_src"]:
        from transformers import AutoTokenizer
        bundle["by_src"][src_code] = AutoTokenizer.from_pretrained(NLLB_ID, src_lang=src_code)
    tok = bundle["by_src"][src_code]
    bos = tok.convert_tokens_to_ids(tgt_code)
    for k in range(0, len(todo), 16):
        batch = todo[k:k + 16]
        enc = tok([t for _, t in batch], return_tensors="pt", padding=True, truncation=True, max_length=256)
        enc = {kk: v.to(device()) for kk, v in enc.items()}
        with torch.no_grad():
            gen = model.generate(**enc, forced_bos_token_id=bos, max_new_tokens=max_new_tokens, num_beams=num_beams)
        dec = tok.batch_decode(gen, skip_special_tokens=True)
        for (i, _), d in zip(batch, dec):
            out[i] = d.strip()
    return out


@app.post("/translate", dependencies=AUTH)
def translate(body: TranslateBody):
    src, tgt = norm_lang(body.src), norm_lang(body.tgt)
    with GPU_LOCK:
        texts = translate_texts(body.texts, src, tgt, body.max_new_tokens, body.num_beams)
    return {"texts": texts, "src": NLLB_CODES[src], "tgt": NLLB_CODES[tgt]}


# --------------------------------------------------------------------------------------
# /tts : MMS-TTS (VitsModel) facebook/mms-tts-{eng,fra,fon,yor}
# --------------------------------------------------------------------------------------
def _load_tts(lang: str):
    from transformers import AutoTokenizer, VitsModel
    mid = f"facebook/mms-tts-{lang}"
    tok = AutoTokenizer.from_pretrained(mid)
    model = VitsModel.from_pretrained(mid)
    model.to(device())
    model.eval()
    return {"tokenizer": tok, "model": model, "sr": int(model.config.sampling_rate)}


def tts_array(text: str, lang: str, seed: int = 0) -> Tuple[np.ndarray, int]:
    torch = _torch()
    bundle = REG.get(f"tts:{lang}", lambda: _load_tts(lang), est_gb=0.4)
    tok, model = bundle["tokenizer"], bundle["model"]
    clean = " ".join((text or "").split())
    if getattr(tok, "is_uroman", False):
        clean = romanize(clean, lang)
    inputs = tok(clean, return_tensors="pt")
    if inputs["input_ids"].shape[-1] == 0 or not clean:
        raise HTTPException(400, f"Texte vide ou non prononçable pour mms-tts-{lang} : '{text}'")
    inputs = {k: v.to(device()) for k, v in inputs.items()}
    torch.manual_seed(seed)
    with torch.no_grad():
        wav = model(**inputs).waveform[0].float().cpu().numpy()
    return wav.astype(np.float32), bundle["sr"]


class TTSBody(BaseModel):
    text: str
    lang: str = "eng"


@app.post("/tts", dependencies=AUTH)
def tts(body: TTSBody):
    lang = norm_lang(body.lang)
    with GPU_LOCK:
        wav, sr = tts_array(body.text, lang)
    return {"audio_b64": wav_b64(peak_normalize(wav, 0.9), sr), "sr": sr, "duration": round(len(wav) / sr, 3)}


# --------------------------------------------------------------------------------------
# Seed-VC (mode chant, f0 conditionné, 44.1 kHz) en sous-processus
# --------------------------------------------------------------------------------------
def seedvc_dir() -> Optional[str]:
    cands = [os.environ.get("SEEDVC_DIR", ""), "/content/seed-vc", "/kaggle/working/seed-vc",
             os.path.join(WORKER_DIR, "seed-vc"), os.path.join(os.path.dirname(WORKER_DIR), "seed-vc")]
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "inference.py")):
            return c
    return None


def _pick_reference(ref: np.ndarray, sr: int, max_s: float = 24.0) -> np.ndarray:
    """Garde la fenêtre de max_s secondes la plus énergique (Seed-VC tronque à 25 s)."""
    n = int(max_s * sr)
    if len(ref) <= n:
        return ref
    hop = sr // 2
    energy = np.array([float(np.mean(ref[i:i + hop] ** 2)) for i in range(0, len(ref) - hop, hop)])
    win = n // hop
    if len(energy) <= win:
        return ref[:n]
    csum = np.concatenate([[0], np.cumsum(energy)])
    best = int(np.argmax(csum[win:] - csum[:-win]))
    return ref[best * hop:best * hop + n]


class SeedVCDaemon:
    """Processus fils persistant (seedvc_runner.py --daemon) : modèles Seed-VC chargés une fois.

    Évite 30 à 60 s de rechargement par appel (important derrière trycloudflare, qui coupe
    les requêtes au-delà d'environ 100 s)."""

    def __init__(self, sdir: str) -> None:
        import queue
        self.sdir = sdir
        self.log_path = os.path.join(tempfile.gettempdir(), "seedvc_daemon.log")
        env = dict(os.environ)
        env.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")
        env["PYTHONUNBUFFERED"] = "1"
        self._log = open(self.log_path, "a", encoding="utf-8")
        self.proc = subprocess.Popen([sys.executable, RUNNER, sdir, "--daemon"], cwd=sdir, env=env,
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self._log,
                                     text=True, bufsize=1)
        self.q: "queue.Queue[Optional[str]]" = queue.Queue()
        threading.Thread(target=self._reader, daemon=True).start()
        line = self._wait_line(("@@READY",), float(os.environ.get("SEEDVC_LOAD_TIMEOUT", "900")))
        if line is None:
            self.close()
            raise RuntimeError("Le démon Seed-VC n'a pas démarré. Fin du journal :\n" + self.tail())

    def _reader(self) -> None:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            self.q.put(line.rstrip("\n"))
        self.q.put(None)

    def _wait_line(self, prefixes: Tuple[str, ...], timeout: float) -> Optional[str]:
        import queue
        deadline = time.time() + timeout
        while True:
            left = deadline - time.time()
            if left <= 0:
                return None
            try:
                line = self.q.get(timeout=min(left, 5.0))
            except queue.Empty:
                if self.proc.poll() is not None:
                    return None
                continue
            if line is None:
                return None
            if line.startswith(prefixes):
                return line

    def tail(self, n: int = 2500) -> str:
        try:
            with open(self.log_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()[-n:]
        except Exception:
            return ""

    def alive(self) -> bool:
        return self.proc.poll() is None

    def convert(self, req: Dict[str, Any], timeout: float) -> str:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        line = self._wait_line(("@@RESULT",), timeout)
        if line is None:
            self.close()
            raise RuntimeError("Démon Seed-VC sans réponse (arrêté ou délai dépassé). Journal :\n" + self.tail())
        res = json.loads(line[len("@@RESULT"):].strip())
        if not res.get("ok"):
            raise RuntimeError(f"Seed-VC : {res.get('error')}\n{self.tail(1500)}")
        return res["output"]

    def close(self) -> None:
        try:
            if self.proc.poll() is None:
                self.proc.terminate()
                self.proc.wait(10)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass
        try:
            self._log.close()
        except Exception:
            pass


def _seedvc_oneshot(sdir: str, src_path: str, ref_path: str, out_dir: str, steps: int, semi_tone_shift: int,
                    auto_f0_adjust: bool, inference_cfg_rate: float) -> str:
    cmd = [sys.executable, RUNNER, sdir,
           "--source", src_path, "--target", ref_path, "--output", out_dir,
           "--diffusion-steps", str(steps), "--length-adjust", "1.0",
           "--inference-cfg-rate", str(inference_cfg_rate),
           "--f0-condition", "True", "--auto-f0-adjust", "True" if auto_f0_adjust else "False",
           "--semi-tone-shift", str(int(semi_tone_shift)), "--fp16", "True"]
    env = dict(os.environ)
    env.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")
    env.setdefault("PYTHONUNBUFFERED", "1")
    t0 = time.time()
    log.info("Seed-VC (exécution unique) : %s", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=sdir, env=env, capture_output=True, text=True,
                          timeout=int(os.environ.get("SEEDVC_TIMEOUT", "1200")))
    log.info("Seed-VC terminé en %.1f s (code %s)", time.time() - t0, proc.returncode)
    wavs = sorted(glob.glob(os.path.join(out_dir, "*.wav")), key=os.path.getmtime)
    if proc.returncode != 0 or not wavs:
        tail = (proc.stderr or "")[-2500:] + "\n" + (proc.stdout or "")[-800:]
        raise HTTPException(500, f"Seed-VC a échoué (code {proc.returncode}) : {tail.strip()}")
    return wavs[-1]


def run_seedvc(source: np.ndarray, source_sr: int, reference: np.ndarray, ref_sr: int,
               diffusion_steps: Optional[int] = None, semi_tone_shift: int = 0,
               auto_f0_adjust: bool = False, inference_cfg_rate: float = 0.7) -> Tuple[np.ndarray, int]:
    sdir = seedvc_dir()
    if not sdir:
        raise HTTPException(503, "Seed-VC introuvable : clonez https://github.com/Plachtaa/seed-vc et définissez SEEDVC_DIR.")
    steps = int(diffusion_steps or int(os.environ.get("SEEDVC_STEPS", "30")))
    # Seed-VC occupe plusieurs Go dans un autre processus : on libère la VRAM du worker.
    REG.make_room(float(os.environ.get("SEEDVC_RESERVE_GB", "6")), keep=("seedvc",))
    tmp = tempfile.mkdtemp(prefix="pgs_vc_")
    try:
        src_path = os.path.join(tmp, "source.wav")
        ref_path = os.path.join(tmp, "reference.wav")
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir)
        write_wav(src_path, peak_normalize(source, 0.95), source_sr)
        write_wav(ref_path, peak_normalize(_pick_reference(reference, ref_sr), 0.95), ref_sr)
        timeout = float(os.environ.get("SEEDVC_TIMEOUT", "1200"))
        out_path = None
        if os.environ.get("SEEDVC_MODE", "daemon").lower() != "subprocess":
            try:
                d = REG.get("seedvc", lambda: SeedVCDaemon(sdir))
                if not d.alive():
                    REG.unload("seedvc")
                    d = REG.get("seedvc", lambda: SeedVCDaemon(sdir))
                t0 = time.time()
                out_path = d.convert({"source": src_path, "target": ref_path, "output": out_dir,
                                      "diffusion_steps": steps, "semi_tone_shift": int(semi_tone_shift),
                                      "auto_f0_adjust": bool(auto_f0_adjust),
                                      "inference_cfg_rate": float(inference_cfg_rate)}, timeout)
                log.info("Seed-VC (démon) : %.1f s", time.time() - t0)
            except Exception as exc:
                log.warning("Démon Seed-VC en échec (%s) : repli sur une exécution unique", exc)
                REG.unload("seedvc")
                out_path = None
        if out_path is None:
            out_path = _seedvc_oneshot(sdir, src_path, ref_path, out_dir, steps, semi_tone_shift,
                                       auto_f0_adjust, inference_cfg_rate)
        out, sr = read_audio_path(out_path)
        out = to_mono(out)
        # Même durée que la source, pour rester calé sur la timeline de l'instrumentale.
        out = fit_length(out, int(round(len(source) / source_sr * sr)))
        return out.astype(np.float32), sr
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        _free_cuda()


@app.post("/convert", dependencies=AUTH)
def convert(source: UploadFile = File(...), reference: UploadFile = File(...),
            diffusion_steps: Optional[int] = Form(None), semi_tone_shift: int = Form(0),
            auto_f0_adjust: bool = Form(False)):
    src, ssr = read_upload(source, "source")
    ref, rsr = read_upload(reference, "reference")
    with GPU_LOCK:
        out, sr = run_seedvc(to_mono(src), ssr, to_mono(ref), rsr, diffusion_steps, semi_tone_shift, auto_f0_adjust)
    return {"audio_b64": wav_b64(peak_normalize(out, 0.95), sr), "sr": sr, "duration": round(len(out) / sr, 3)}


# --------------------------------------------------------------------------------------
# /sing_auto : TTS par ligne -> syllabes -> durées + f0 imposés (pyworld) -> Seed-VC
# --------------------------------------------------------------------------------------
WORLD_FP = 5.0  # ms


def _smooth(x: np.ndarray, win: int) -> np.ndarray:
    if win <= 1 or x.size < 3:
        return x
    win = min(win, x.size)
    k = np.ones(win) / win
    pad = win // 2
    xp = np.pad(x, (pad, win - 1 - pad), mode="edge")
    return np.convolve(xp, k, mode="valid")


def tts_boundaries(x: np.ndarray, sr: int, target_durs: List[float]) -> List[int]:
    """Découpe grossière du TTS en len(target_durs) syllabes : minima d'énergie + onsets,
    près des positions idéales proportionnelles aux durées cibles. Renvoie K+1 bornes (échantillons)."""
    K = len(target_durs)
    L = len(x)
    if K <= 1 or L == 0:
        return [0, L]
    durs = np.maximum(np.array(target_durs, dtype=float), 1e-3)
    cum = np.cumsum(durs) / durs.sum()
    hop = max(1, int(0.01 * sr))
    try:
        import librosa
        rms = librosa.feature.rms(y=x.astype(np.float32), frame_length=4 * hop, hop_length=hop, center=True)[0]
        try:
            onset_frames = librosa.onset.onset_detect(y=x.astype(np.float32), sr=sr, hop_length=hop, backtrack=True)
        except Exception:
            onset_frames = np.array([], dtype=int)
    except Exception:
        rms = np.sqrt(np.array([np.mean(x[i:i + hop] ** 2) for i in range(0, L, hop)]) + 1e-12)
        onset_frames = np.array([], dtype=int)
    n = len(rms)
    if n < K + 1:
        return [int(round(c * L)) for c in np.concatenate([[0.0], cum])]
    rms = _smooth(rms, 3)
    cost_e = rms / (rms.max() + 1e-9)
    bonus = np.zeros(n)
    for f in onset_frames:
        if 0 <= f < n:
            bonus[max(0, f - 1):f + 2] -= 0.3
    win = max(1, int(0.5 * n / K))
    bounds = [0]
    prev = 0
    for i, c in enumerate(cum[:-1]):
        ideal = c * n
        remaining = K - 1 - i
        lo = max(prev + 1, int(ideal) - win)
        hi = min(n - remaining, int(ideal) + win + 1)
        if lo >= hi:
            pos = int(min(max(int(round(ideal)), prev + 1), n - remaining))
        else:
            rng = np.arange(lo, hi)
            cost = cost_e[lo:hi] + bonus[lo:hi] + 0.5 * np.abs(rng - ideal) / win
            pos = int(rng[int(np.argmin(cost))])
        bounds.append(pos)
        prev = pos
    out = [min(L, b * hop) for b in bounds] + [L]
    for i in range(1, len(out)):  # monotone
        out[i] = max(out[i], out[i - 1])
    return out


def _target_f0_for_line(plan_f0: np.ndarray, plan_hop: float, t_abs: np.ndarray, fallback: np.ndarray,
                        semi_tone_shift: float = 0.0) -> np.ndarray:
    """Courbe f0 de la mélodie d'origine sur les frames de la ligne : trous comblés, lissée, dans la tessiture."""
    if plan_f0.size:
        idx = np.clip(np.round(t_abs / plan_hop).astype(int), 0, plan_f0.size - 1)
        mel = plan_f0[idx].astype(np.float64)
    else:
        mel = np.zeros_like(t_abs)
    mel[(mel < 50) | (mel > 1200)] = 0.0
    voiced = mel > 0
    if voiced.sum() >= 2:
        x = np.arange(mel.size)
        logf = np.interp(x, x[voiced], np.log(mel[voiced]))
    else:
        fb = fallback.copy()
        fv = fb > 0
        if fv.sum() >= 2:
            x = np.arange(fb.size)
            logf = np.interp(x, x[fv], np.log(fb[fv]))
        else:
            logf = np.full(mel.size, np.log(220.0))
    logf = _smooth(logf, 5)  # 25 ms : garde le vibrato, retire le bruit d'estimation
    med = float(np.median(np.exp(logf)))
    shift = semi_tone_shift / 12.0 * np.log(2.0)
    while med * np.exp(shift) < 80.0:
        shift += np.log(2.0)
    while med * np.exp(shift) > 800.0:
        shift -= np.log(2.0)
    return np.exp(logf + shift)


def render_line_world(tts: np.ndarray, sr: int, line_start: float, line_end: float,
                      syllables: List[Tuple[float, float]], plan_f0: np.ndarray, plan_hop: float,
                      semi_tone_shift: float = 0.0) -> np.ndarray:
    import pyworld as pw
    x = tts.astype(np.float64)
    dur = max(0.05, line_end - line_start)
    n_out = int(round(dur * sr))
    f0_src, t_src = pw.harvest(x, sr, f0_floor=60.0, f0_ceil=900.0, frame_period=WORLD_FP)
    sp = pw.cheaptrick(x, f0_src, t_src, sr)
    ap = pw.d4c(x, f0_src, t_src, sr)
    n_src = len(f0_src)
    # Bornes des syllabes dans le TTS et dans la cible (relatives au début de ligne)
    bounds = tts_boundaries(tts, sr, [max(0.01, e - s) for s, e in syllables])
    src_knots = np.array(bounds, dtype=float) / sr
    tgt_knots = np.array([s - line_start for s, _ in syllables] + [syllables[-1][1] - line_start], dtype=float)
    tgt_knots = np.clip(tgt_knots, 0.0, dur)
    tgt_knots[0] = 0.0
    tgt_knots[-1] = dur
    for i in range(1, len(tgt_knots)):  # strictement croissant pour np.interp
        tgt_knots[i] = max(tgt_knots[i], tgt_knots[i - 1] + 1e-4)
    n_t = max(2, int(np.ceil(dur * 1000.0 / WORLD_FP)) + 1)
    tau = np.arange(n_t) * WORLD_FP / 1000.0
    src_t = np.interp(tau, tgt_knots, src_knots)
    src_idx = np.clip(np.round(src_t * 1000.0 / WORLD_FP).astype(int), 0, n_src - 1)
    sp_new = np.ascontiguousarray(sp[src_idx])
    ap_new = np.ascontiguousarray(ap[src_idx])
    voiced = f0_src[src_idx] > 0
    target = _target_f0_for_line(plan_f0, plan_hop, line_start + tau, f0_src[src_idx], semi_tone_shift)
    f0_new = np.ascontiguousarray(np.where(voiced, target, 0.0), dtype=np.float64)
    y = pw.synthesize(f0_new, sp_new, ap_new, sr, frame_period=WORLD_FP)
    return fit_length(np.asarray(y, dtype=np.float32), n_out)


def render_line_fallback(tts: np.ndarray, sr: int, line_start: float, line_end: float,
                         syllables: List[Tuple[float, float]], plan_f0: np.ndarray, plan_hop: float,
                         semi_tone_shift: float = 0.0) -> np.ndarray:
    """Sans pyworld : étirement librosa par syllabe + transposition globale vers la mélodie."""
    import librosa
    dur = max(0.05, line_end - line_start)
    n_out = int(round(dur * sr))
    bounds = tts_boundaries(tts, sr, [max(0.01, e - s) for s, e in syllables])
    tgt = [s - line_start for s, _ in syllables] + [dur]
    pieces = []
    for i in range(len(syllables)):
        seg = tts[bounds[i]:bounds[i + 1]]
        n_t = max(1, int(round((tgt[i + 1] - tgt[i]) * sr)))
        if seg.size >= 2048:
            rate = max(0.25, min(4.0, seg.size / n_t))
            seg = librosa.effects.time_stretch(seg.astype(np.float32), rate=rate)
        pieces.append(fit_length(seg.astype(np.float32), n_t))
    y = fit_length(np.concatenate(pieces) if pieces else np.zeros(n_out, np.float32), n_out)
    try:
        t_abs = line_start + np.arange(0, dur, 0.01)
        target = _target_f0_for_line(plan_f0, plan_hop, t_abs, np.zeros_like(t_abs), semi_tone_shift)
        f0_tts, _ = estimate_f0(resample(tts, sr, ANALYZE_SR))
        v = f0_tts[f0_tts > 0]
        if v.size:
            steps = 12.0 * np.log2(float(np.median(target)) / float(np.median(v)))
            y = librosa.effects.pitch_shift(y, sr=sr, n_steps=float(np.clip(steps, -24, 24)))
    except Exception as exc:
        log.warning("Transposition de repli en échec : %s", exc)
    return fit_length(y.astype(np.float32), n_out)


def _fade(y: np.ndarray, sr: int, ms: float = 10.0) -> np.ndarray:
    n = min(len(y) // 2, int(sr * ms / 1000))
    if n > 1:
        r = np.linspace(0.0, 1.0, n, dtype=np.float32)
        y[:n] *= r
        y[-n:] *= r[::-1]
    return y


def _clean_syllables(raw: Any, start: float, end: float) -> List[Tuple[float, float]]:
    sy: List[Tuple[float, float]] = []
    for s in raw or []:
        try:
            a, b = float(s.get("start")), float(s.get("end"))
        except (TypeError, ValueError, AttributeError):
            continue
        a, b = max(start, min(a, end)), max(start, min(b, end))
        if b - a >= 0.01:
            sy.append((a, b))
    sy.sort()
    if not sy:
        return [(start, end)]
    return sy


def build_guide(plan: Dict[str, Any], sr: int = 16000) -> Tuple[np.ndarray, List[str]]:
    lang = norm_lang(plan.get("lang") or "eng")
    plan_hop = float(plan.get("hop") or 0.01)
    plan_f0 = np.nan_to_num(np.asarray(plan.get("f0") or [], dtype=np.float64), nan=0.0)
    semi = float(plan.get("semi_tone_shift") or 0.0)
    lines = plan.get("lines") or []
    warnings: List[str] = []
    ends = [float(l.get("end") or 0) for l in lines if isinstance(l, dict)]
    total = max([float(plan.get("total_duration") or 0.0)] + ends + [0.5])
    timeline = np.zeros(int(np.ceil(total * sr)) + sr // 2, dtype=np.float32)
    try:
        import pyworld  # noqa: F401
        render = render_line_world
    except Exception:
        warnings.append("pyworld indisponible : repli librosa (qualité réduite).")
        render = render_line_fallback
    for i, ln in enumerate(lines):
        if not isinstance(ln, dict):
            continue
        text = str(ln.get("text") or "").strip()
        try:
            start, end = float(ln.get("start") or 0.0), float(ln.get("end") or 0.0)
        except (TypeError, ValueError):
            warnings.append(f"ligne {i} : start/end invalides, ignorée")
            continue
        if not text or end - start < 0.1:
            warnings.append(f"ligne {i} : texte vide ou durée trop courte, ignorée")
            continue
        syl = _clean_syllables(ln.get("syllables"), start, end)
        try:
            wav, tsr = tts_array(text, lang, seed=i)
            wav = resample(wav, tsr, sr)
            try:
                import librosa
                trimmed, idx = librosa.effects.trim(wav, top_db=35)
                if trimmed.size > sr // 10:
                    wav = trimmed
            except Exception:
                pass
            try:
                y = render(wav, sr, start, end, syl, plan_f0, plan_hop, semi)
            except Exception as exc:
                if render is render_line_world:
                    log.warning("WORLD en échec ligne %d (%s) : repli librosa", i, exc)
                    warnings.append(f"ligne {i} : WORLD en échec, repli librosa")
                    y = render_line_fallback(wav, sr, start, end, syl, plan_f0, plan_hop, semi)
                else:
                    raise
            y = np.nan_to_num(y)
            rms = float(np.sqrt(np.mean(y ** 2))) if y.size else 0.0
            if rms > 1e-6:
                y = y * (0.1 / rms)
            y = _fade(np.clip(y, -1.0, 1.0), sr)
            a = int(round(start * sr))
            if a + len(y) > len(timeline):
                timeline = fit_length(timeline, a + len(y))
            timeline[a:a + len(y)] += y
        except HTTPException as exc:
            warnings.append(f"ligne {i} : {exc.detail}")
        except Exception as exc:
            log.warning("Ligne %d non rendue : %s\n%s", i, exc, traceback.format_exc())
            warnings.append(f"ligne {i} : {type(exc).__name__} {exc}")
    timeline = fit_length(timeline, int(round(total * sr)))
    return peak_normalize(timeline, 0.95), warnings


@app.post("/sing_auto", dependencies=AUTH)
def sing_auto(reference: UploadFile = File(...), plan: str = Form(...),
              convert: bool = Form(True), return_guide: bool = Form(False),
              diffusion_steps: Optional[int] = Form(None)):
    plan_obj = _parse_json_field(plan, "plan")
    if not isinstance(plan_obj, dict) or not isinstance(plan_obj.get("lines"), list):
        raise HTTPException(400, "Champ 'plan' : objet JSON {lang, lines:[...], hop, f0, total_duration} attendu.")
    ref, rsr = read_upload(reference, "reference")
    guide_sr = 16000
    with GPU_LOCK:
        guide, warnings = build_guide(plan_obj, guide_sr)
        if not np.any(np.abs(guide) > 1e-4):
            raise HTTPException(400, "Aucune ligne n'a pu être synthétisée (textes vides ?). " + " ; ".join(warnings))
        out, sr = guide, guide_sr
        if convert:
            try:
                out, sr = run_seedvc(guide, guide_sr, to_mono(ref), rsr, diffusion_steps=diffusion_steps)
            except Exception as exc:
                detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                log.warning("Seed-VC en échec, renvoi de la voix guide : %s", detail)
                warnings.append(f"Seed-VC en échec, voix guide TTS renvoyée : {str(detail)[:400]}")
    resp = {"audio_b64": wav_b64(peak_normalize(out, 0.95), sr), "sr": sr,
            "duration": round(len(out) / sr, 3), "warnings": warnings}
    if return_guide:
        resp["guide_b64"] = wav_b64(guide, guide_sr)
        resp["guide_sr"] = guide_sr
    return resp


# --------------------------------------------------------------------------------------
# /watermark : AudioSeal 16 bits
# --------------------------------------------------------------------------------------
WM_DB = os.environ.get("WATERMARK_DB", os.path.join(WORKER_DIR, "watermark_messages.json"))
_WM_LOCK = threading.Lock()
_WM_TABLE: Optional[Dict[str, str]] = None


def _wm_table() -> Dict[str, str]:
    global _WM_TABLE
    if _WM_TABLE is None:
        try:
            with open(WM_DB, "r", encoding="utf-8") as f:
                _WM_TABLE = {str(k): str(v) for k, v in json.load(f).items()}
        except Exception:
            _WM_TABLE = {}
    return _WM_TABLE


def message_to_bits(message: str) -> Tuple[List[int], str]:
    """Hash stable (sha256) -> 16 bits ; mémorise la correspondance (mémoire + JSON)."""
    value = int.from_bytes(hashlib.sha256(message.encode("utf-8")).digest()[:2], "big")
    hexa = f"{value:04x}"
    bits = [(value >> (15 - i)) & 1 for i in range(16)]
    with _WM_LOCK:
        table = _wm_table()
        if table.get(hexa) not in (None, message):
            log.warning("Collision de filigrane : %s remplace '%s' par '%s'", hexa, table[hexa], message)
        table[hexa] = message
        try:
            tmp = WM_DB + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(table, f, ensure_ascii=False, indent=1)
            os.replace(tmp, WM_DB)
        except Exception as exc:
            log.warning("Table de filigrane non sauvegardée : %s", exc)
    return bits, hexa


def bits_to_hex(bits: List[int]) -> str:
    value = 0
    for b in bits[:16]:
        value = (value << 1) | (1 if b else 0)
    return f"{value:04x}"


def _load_wm_gen():
    from audioseal import AudioSeal
    return AudioSeal.load_generator("audioseal_wm_16bits").to(device()).eval()


def _load_wm_det():
    from audioseal import AudioSeal
    return AudioSeal.load_detector("audioseal_detector_16bits").to(device()).eval()


def embed_watermark(audio: np.ndarray, sr: int, message: str) -> Tuple[np.ndarray, str]:
    torch = _torch()
    gen = REG.get("audioseal_gen", _load_wm_gen)
    bits, hexa = message_to_bits(message)
    mono16 = resample(to_mono(audio), sr, 16000)
    x = torch.from_numpy(np.ascontiguousarray(mono16))[None, None].to(device())
    msg = torch.tensor([bits], dtype=torch.long, device=device())
    with torch.no_grad():
        wm = gen.get_watermark(x, sample_rate=16000, message=msg)
    wm16 = wm[0, 0].float().cpu().numpy()
    # Réapplique le signal de filigrane (bande < 8 kHz) à la résolution d'origine.
    wm_full = fit_length(resample(wm16, 16000, sr), audio.shape[-1])
    out = audio + wm_full[None, :]
    return np.clip(out, -1.0, 1.0).astype(np.float32), hexa


def detect_watermark_array(audio: np.ndarray, sr: int) -> Dict[str, Any]:
    torch = _torch()
    det = REG.get("audioseal_det", _load_wm_det)
    mono16 = resample(to_mono(audio), sr, 16000)
    x = torch.from_numpy(np.ascontiguousarray(mono16))[None, None].to(device())
    with torch.no_grad():
        prob, msg = det.detect_watermark(x, sample_rate=16000)
    prob = float(prob.item() if hasattr(prob, "item") else prob)
    bits = [int(b) for b in msg[0].tolist()]
    hexa = bits_to_hex(bits)
    detected = prob >= 0.5
    message = None
    if detected:
        message = _wm_table().get(hexa) or f"0x{hexa}"
    return {"detected": bool(detected), "confidence": round(prob, 4), "message": message, "bits_hex": hexa}


@app.post("/watermark/embed", dependencies=AUTH)
def watermark_embed(file: UploadFile = File(...), message: str = Form("PolyglotSound")):
    audio, sr = read_upload(file)
    message = (message or "PolyglotSound").strip()[:64]
    with GPU_LOCK:
        out, hexa = embed_watermark(audio, sr, message)
    return {"audio_b64": wav_b64(out, sr), "sr": sr, "message": message, "bits_hex": hexa}


@app.post("/watermark/detect", dependencies=AUTH)
def watermark_detect(file: UploadFile = File(...)):
    audio, sr = read_upload(file)
    with GPU_LOCK:
        return detect_watermark_array(audio, sr)


# --------------------------------------------------------------------------------------
# /warmup (hors contrat) : précharge les modèles, télécharge les poids
# --------------------------------------------------------------------------------------
def synthetic_voice(sr: int = 16000, dur: float = 3.0, f0: float = 220.0) -> np.ndarray:
    t = np.arange(int(sr * dur)) / sr
    vib = f0 * (1 + 0.02 * np.sin(2 * np.pi * 5.5 * t))
    phase = 2 * np.pi * np.cumsum(vib) / sr
    y = sum((0.6 / k) * np.sin(k * phase) for k in range(1, 8))
    env = 0.5 * (1 - np.cos(2 * np.pi * 3.0 * t)) ** 1.5  # « syllabes » à 3 Hz
    return (0.3 * y * env / 2).astype(np.float32)


@app.post("/warmup", dependencies=AUTH)
def warmup(models: str = Form("all")):
    wanted = {m.strip() for m in models.split(",") if m.strip()}
    everything = "all" in wanted
    report: Dict[str, Any] = {}
    voice = synthetic_voice()

    def step(name: str, fn: Callable[[], Any]) -> None:
        if not (everything or name in wanted):
            return
        t0 = time.time()
        try:
            fn()
            report[name] = {"ok": True, "s": round(time.time() - t0, 1)}
        except Exception as exc:
            report[name] = {"ok": False, "s": round(time.time() - t0, 1), "error": str(getattr(exc, "detail", exc))[:500]}

    with GPU_LOCK:
        step("separate", lambda: separate_array(np.stack([voice, voice]), 16000))
        step("transcribe", lambda: (_asr_for("fon"), _asr_for("eng")))
        step("align", lambda: align_line(voice, "hello world", 0.2, 2.8, "eng", REG.get("mms_fa", _load_mms_fa)))
        step("analyze", lambda: analyze_array(voice, 16000))
        step("translate", lambda: translate_texts(["Bonjour"], "fra", "eng"))
        step("tts", lambda: [tts_array("hello", l) for l in LANGS])
        step("watermark", lambda: detect_watermark_array(embed_watermark(voice[None], 16000, "warmup")[0], 16000))
        step("seedvc", lambda: run_seedvc(voice, 16000, synthetic_voice(dur=4.0, f0=180.0), 16000, diffusion_steps=5))
    return {"ok": all(v["ok"] for v in report.values()), "report": report, "models_loaded": REG.loaded(),
            "vram": vram_info()}


@app.post("/unload", dependencies=AUTH)
def unload(models: str = Form("all")):
    with GPU_LOCK:
        if models.strip() == "all":
            REG.unload_all()
        else:
            for m in models.split(","):
                REG.unload(m.strip())
    return {"ok": True, "models_loaded": REG.loaded(), "vram": vram_info()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "9000")))
