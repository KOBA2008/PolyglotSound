#!/usr/bin/env python3
"""Teste toutes les routes d'un worker PolyglotSound distant et affiche un rapport.

Bibliothèque standard uniquement (aucune dépendance) : utilisable depuis le PC du développeur,
le backend ou une cellule Colab.

Exemples :
  python3 test_client.py https://xxxx.trycloudflare.com
  python3 test_client.py http://localhost:9000 --audio refrain.wav --reference voix.wav --lang fon
  python3 test_client.py URL --only health,tts,translate --token SECRET --out sorties_test
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import math
import os
import random
import struct
import sys
import time
import urllib.error
import urllib.request
import uuid
import wave
from typing import Any, Dict, List, Optional, Tuple

ROUTES = ["health", "translate", "tts", "separate", "analyze", "transcribe", "align",
          "watermark", "convert", "sing_auto"]


# ----------------------------------------------------------------------------- audio
def synth_song(sr: int = 44100, dur: float = 6.0, stereo: bool = True) -> bytes:
    """« Chant » synthétique (harmoniques + vibrato + syllabes) sur un fond « instrumental »."""
    rnd = random.Random(0)
    n = int(sr * dur)
    notes = [220.0, 246.9, 261.6, 293.7, 261.6, 246.9]
    frames = bytearray()
    phase = 0.0
    for i in range(n):
        t = i / sr
        note = notes[int(t / (dur / len(notes))) % len(notes)]
        f = note * (1 + 0.015 * math.sin(2 * math.pi * 5.5 * t))
        phase += 2 * math.pi * f / sr
        voice = sum((0.5 / k) * math.sin(k * phase) for k in range(1, 6))
        syl = 0.5 * (1 - math.cos(2 * math.pi * 3.0 * t))
        line_gate = 0.0 if (t % 3.0) > 2.6 else 1.0
        v = 0.35 * voice * syl * line_gate
        beat = 0.25 * math.exp(-30 * (t % 0.5)) * math.sin(2 * math.pi * 60 * t)
        hat = 0.03 * rnd.uniform(-1, 1) * math.exp(-80 * ((t + 0.25) % 0.5))
        left = max(-1.0, min(1.0, v + beat + hat))
        right = max(-1.0, min(1.0, v + beat - hat))
        frames += struct.pack("<h", int(left * 32000))
        if stereo:
            frames += struct.pack("<h", int(right * 32000))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(frames))
    return buf.getvalue()


def wav_info(data: bytes) -> str:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return f"{w.getnframes() / w.getframerate():.2f} s, {w.getframerate()} Hz, {w.getnchannels()} canal(aux)"
    except Exception as exc:  # pragma: no cover
        return f"WAV illisible ({exc})"


# ----------------------------------------------------------------------------- HTTP
class Client:
    def __init__(self, base: str, token: Optional[str], timeout: float) -> None:
        self.base = base.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self, extra: Dict[str, str]) -> Dict[str, str]:
        h = {"User-Agent": "polyglotsound-test/1.0", "Accept": "application/json"}
        if self.token:
            h["X-Worker-Token"] = self.token
        h.update(extra)
        return h

    def _send(self, method: str, path: str, body: Optional[bytes], headers: Dict[str, str]) -> Tuple[int, Any]:
        req = urllib.request.Request(self.base + path, data=body, method=method, headers=self._headers(headers))
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                raw = r.read()
                return r.status, json.loads(raw.decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                return e.code, json.loads(raw)
            except Exception:
                return e.code, {"detail": raw[:500]}

    def get(self, path: str) -> Tuple[int, Any]:
        return self._send("GET", path, None, {})

    def post_json(self, path: str, payload: Any) -> Tuple[int, Any]:
        return self._send("POST", path, json.dumps(payload).encode("utf-8"), {"Content-Type": "application/json"})

    def post_form(self, path: str, fields: Dict[str, str], files: Dict[str, Tuple[str, bytes]]) -> Tuple[int, Any]:
        boundary = "----pgs" + uuid.uuid4().hex
        out = io.BytesIO()
        for k, v in fields.items():
            out.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode())
            out.write(str(v).encode("utf-8") + b"\r\n")
        for k, (fname, data) in files.items():
            out.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n"
                      f"Content-Type: application/octet-stream\r\n\r\n".encode())
            out.write(data + b"\r\n")
        out.write(f"--{boundary}--\r\n".encode())
        return self._send("POST", path, out.getvalue(), {"Content-Type": f"multipart/form-data; boundary={boundary}"})


# ----------------------------------------------------------------------------- tests
def main() -> int:
    ap = argparse.ArgumentParser(description="Teste un worker GPU PolyglotSound.")
    ap.add_argument("url", help="URL du worker, ex. https://xxxx.trycloudflare.com ou http://localhost:9000")
    ap.add_argument("--audio", help="morceau à tester (sinon son synthétique)")
    ap.add_argument("--reference", help="voix de référence de l'artiste pour Seed-VC (sinon voix séparée)")
    ap.add_argument("--lang", default="fon", help="langue source (fon|yor|swh|fra|eng)")
    ap.add_argument("--target", default="eng", help="langue cible (eng|fra|fon)")
    ap.add_argument("--token", default=os.environ.get("WORKER_TOKEN"), help="X-Worker-Token")
    ap.add_argument("--only", help="liste de routes séparées par des virgules : " + ",".join(ROUTES))
    ap.add_argument("--skip", default="", help="routes à ignorer")
    ap.add_argument("--out", default="worker_test_out", help="dossier où écrire les WAV renvoyés")
    ap.add_argument("--timeout", type=float, default=900.0)
    args = ap.parse_args()

    wanted = [r for r in (args.only.split(",") if args.only else ROUTES) if r and r not in args.skip.split(",")]
    cli = Client(args.url, args.token, args.timeout)
    os.makedirs(args.out, exist_ok=True)
    song = open(args.audio, "rb").read() if args.audio else synth_song()
    song_name = os.path.basename(args.audio) if args.audio else "synthetique.wav"
    report: List[Tuple[str, str, float, str]] = []
    ctx: Dict[str, Any] = {"vocals": None, "segments": None, "analysis": None}

    def save(name: str, b64: Optional[str]) -> str:
        if not b64:
            return "pas d'audio"
        data = base64.b64decode(b64)
        path = os.path.join(args.out, name)
        with open(path, "wb") as f:
            f.write(data)
        return f"{wav_info(data)} -> {path}"

    def run(name: str, fn) -> None:
        if name not in wanted:
            return
        print(f"\n=== {name} ...", flush=True)
        t0 = time.time()
        try:
            ok, summary = fn()
        except Exception as exc:
            ok, summary = False, f"exception client : {exc}"
        dt = time.time() - t0
        report.append((name, "OK" if ok else "ECHEC", dt, summary))
        print(f"{'OK' if ok else 'ECHEC'} ({dt:.1f} s) {summary}", flush=True)

    def t_health():
        code, r = cli.get("/health")
        return code == 200 and bool(r.get("ok")), json.dumps(r, ensure_ascii=False)[:300]

    def t_translate():
        code, r = cli.post_json("/translate", {"texts": ["Bonjour mon amour", "Je chante pour toi"], "src": "fra", "tgt": args.target})
        code2, r2 = cli.post_json("/translate", {"texts": ["Un ɖo wanyi we"], "src": "fon", "tgt": "fra"})
        ok = code == 200 and len(r.get("texts", [])) == 2
        return ok, f"fra->{args.target}: {r.get('texts', r)} | fon->fra ({code2}): {r2.get('texts', r2)}"

    def t_tts():
        msgs = []
        ok = True
        for lang, text in (("eng", "I sing for you tonight"), ("fra", "Je chante pour toi ce soir"),
                           ("fon", "Un ɖo wanyi we"), ("yor", "Mo nífẹ̀ẹ́ rẹ")):
            code, r = cli.post_json("/tts", {"text": text, "lang": lang})
            ok = ok and code == 200
            msgs.append(f"{lang}: {save(f'tts_{lang}.wav', r.get('audio_b64')) if code == 200 else r.get('detail')}")
        return ok, " | ".join(msgs)

    def t_separate():
        code, r = cli.post_form("/separate", {}, {"file": (song_name, song)})
        if code != 200:
            return False, str(r.get("detail"))
        ctx["vocals"] = base64.b64decode(r["vocals_b64"])
        return True, f"vocals {save('vocals.wav', r['vocals_b64'])} ; instru {save('instrumental.wav', r['instrumental_b64'])}"

    def voice() -> Tuple[str, bytes]:
        return ("vocals.wav", ctx["vocals"]) if ctx["vocals"] else (song_name, song)

    def t_analyze():
        code, r = cli.post_form("/analyze", {}, {"file": voice()})
        if code != 200:
            return False, str(r.get("detail"))
        ctx["analysis"] = r
        f0 = [v for v in r["f0"] if v > 0]
        med = sorted(f0)[len(f0) // 2] if f0 else 0
        return True, (f"hop={r['hop']} frames={len(r['f0'])} voisées={len(f0)} f0 médiane={med:.1f} Hz "
                      f"onsets={len(r['onsets'])} méthode={r.get('method')}")

    def t_transcribe():
        code, r = cli.post_form("/transcribe", {"lang": args.lang}, {"file": voice()})
        if code != 200:
            return False, str(r.get("detail"))
        ctx["segments"] = r["segments"]
        return True, f"{len(r['segments'])} segments : " + json.dumps(r["segments"][:4], ensure_ascii=False)[:400]

    def t_align():
        segs = ctx["segments"] or [{"text": "hello world", "start": 0.2, "end": 2.6},
                                   {"text": "sing with me", "start": 3.0, "end": 5.6}]
        lines = [{"text": s["text"] or "la la la", "start": s["start"], "end": s["end"]} for s in segs]
        code, r = cli.post_form("/align", {"lines": json.dumps(lines), "lang": args.lang}, {"file": voice()})
        if code != 200:
            return False, str(r.get("detail"))
        ok = len(r["lines"]) == len(lines)
        return ok, json.dumps(r["lines"][:2], ensure_ascii=False)[:500]

    def t_watermark():
        code, r = cli.post_form("/watermark/embed", {"message": "PolyglotSound-test"}, {"file": (song_name, song)})
        if code != 200:
            return False, f"embed : {r.get('detail')}"
        marked = base64.b64decode(r["audio_b64"])
        save("watermarked.wav", r["audio_b64"])
        code2, d = cli.post_form("/watermark/detect", {}, {"file": ("watermarked.wav", marked)})
        code3, d0 = cli.post_form("/watermark/detect", {}, {"file": (song_name, song)})
        ok = code2 == 200 and d.get("detected") and d.get("message") == "PolyglotSound-test"
        return bool(ok), f"filigrané : {d} | original : {d0}"

    def reference() -> Tuple[str, bytes]:
        if args.reference:
            return os.path.basename(args.reference), open(args.reference, "rb").read()
        return voice()

    def t_convert():
        code, r = cli.post_form("/convert", {"diffusion_steps": "10"}, {"source": voice(), "reference": reference()})
        if code != 200:
            return False, str(r.get("detail"))[:800]
        return True, save("convert.wav", r["audio_b64"])

    def t_sing_auto():
        an = ctx["analysis"] or {"hop": 0.01, "f0": []}
        lines = []
        for k, (s, e) in enumerate([(0.2, 2.6), (3.2, 5.6)]):
            n = 6
            step = (e - s) / n
            lines.append({"text": ["I will sing for you now", "under the bright moon light"][k], "start": s, "end": e,
                          "syllables": [{"start": round(s + i * step, 3), "end": round(s + (i + 1) * step - 0.02, 3)} for i in range(n)]})
        plan = {"lang": args.target, "lines": lines, "hop": an["hop"], "f0": an["f0"], "total_duration": 6.0}
        code, r = cli.post_form("/sing_auto", {"plan": json.dumps(plan), "return_guide": "true", "diffusion_steps": "10"},
                                {"reference": reference()})
        if code != 200:
            return False, str(r.get("detail"))[:800]
        g = save("sing_auto_guide.wav", r.get("guide_b64"))
        return True, f"{save('sing_auto.wav', r['audio_b64'])} ; guide {g} ; avertissements : {r.get('warnings')}"

    for name, fn in (("health", t_health), ("translate", t_translate), ("tts", t_tts), ("separate", t_separate),
                     ("analyze", t_analyze), ("transcribe", t_transcribe), ("align", t_align),
                     ("watermark", t_watermark), ("convert", t_convert), ("sing_auto", t_sing_auto)):
        run(name, fn)

    print("\n" + "=" * 78 + "\nRAPPORT " + args.url + "\n" + "=" * 78)
    for name, status, dt, summary in report:
        print(f"{status:6} {name:11} {dt:7.1f} s  {summary[:160]}")
    n_ok = sum(1 for r in report if r[1] == "OK")
    print(f"\n{n_ok}/{len(report)} routes OK. Sorties audio : {os.path.abspath(args.out)}")
    return 0 if n_ok == len(report) else 1


if __name__ == "__main__":
    sys.exit(main())
