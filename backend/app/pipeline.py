"""Étapes du pipeline. Chaque étape est une coroutine lancée en tâche de fond ;
elle met à jour steps[step] (status, progress, message) dans le store."""
from __future__ import annotations

import asyncio
import logging
import shutil
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import numpy as np

from app import audio, store
from app import worker_client as worker
from app.lyrics_bridge import adapt_line, count_syllables, split_syllables
from app.models import Line, Pitch, Project, Syllable, Variant

log = logging.getLogger("polyglotsound.pipeline")

NLLB = {"fon": "fon_Latn", "yor": "yor_Latn", "fra": "fra_Latn", "eng": "eng_Latn"}
ENERGY_HOP = 0.01
_tasks: set[asyncio.Task[Any]] = set()


class StepError(Exception):
    """Erreur métier : son message (en français) est affiché à l'artiste."""


# ---------------------------------------------------------------- helpers

def _set_step(pid: str, step: str, *, status: str | None = None,
              progress: int | None = None, message: str | None = None) -> None:
    def fn(p: Project) -> None:
        s = p.steps[step]
        if status is not None:
            s.status = status  # type: ignore[assignment]
        if progress is not None:
            s.progress = max(0, min(100, int(progress)))
        if message is not None:
            s.message = message
    store.update(pid, fn)


def _path(pid: str, name: str) -> Path:
    return store.file_path(pid, name)


def _set_file(p: Project, key: str, name: str | None) -> None:
    setattr(p.files, key, store.file_url(p.id, name) if name else None)


def _file_of(p: Project, key: str) -> Path | None:
    url = getattr(p.files, key)
    if not url:
        return None
    path = _path(p.id, url.rsplit("/", 1)[-1])
    return path if path.exists() else None


async def _use_worker(pid: str) -> bool:
    ok = await worker.available()
    store.update(pid, lambda p: setattr(p, "mode", "live" if ok else "demo"))
    return ok


async def _energy(path: Path) -> np.ndarray:
    x = await asyncio.to_thread(audio.read_pcm, path, 16000)
    return audio.rms_energy(x, 16000, hop=ENERGY_HOP)


def _vocals_or_original(p: Project) -> Path:
    v = _file_of(p, "vocals") or _file_of(p, "original")
    if v is None:
        raise StepError("Fichier audio d'origine introuvable.")
    return v


def _uniform_syllables(parts: list[str], start: float, end: float) -> list[tuple[str, float, float]]:
    if not parts:
        return []
    d = max(0.01, end - start) / len(parts)
    return [(t, round(start + i * d, 3), round(start + (i + 1) * d, 3)) for i, t in enumerate(parts)]


def _apply_syllables(line: Line, sylls: list[tuple[str, float, float]],
                     energy: np.ndarray, hop: float) -> None:
    stress = audio.stress_from_energy([(s, e) for _, s, e in sylls], energy, hop)
    line.syllables = [Syllable(text=t, start=s, end=e, stress=i in stress)
                      for i, (t, s, e) in enumerate(sylls)]
    line.n_syllables = len(sylls)
    line.stress_positions = stress


def _lyrics_context(p: Project) -> str:
    return "\n".join(l.text for l in p.lines if l.text.strip())


# ---------------------------------------------------------------- étapes

async def step_separate(pid: str, body: dict[str, Any]) -> str:
    p = store.load(pid)
    orig = _file_of(p, "original")
    if orig is None:
        raise StepError("Fichier audio d'origine introuvable.")
    vocals, instr = _path(pid, "vocals.wav"), _path(pid, "instrumental.wav")
    if await _use_worker(pid):
        _set_step(pid, "separate", progress=20, message="Séparation Demucs sur le worker GPU...")
        v_bytes, i_bytes = await worker.separate(orig)
        await asyncio.to_thread(audio.write_wav_bytes, v_bytes, vocals, 1)
        await asyncio.to_thread(audio.write_wav_bytes, i_bytes, instr, 2)
        msg = "Voix et instrumentale séparées (Demucs)."
    else:
        _set_step(pid, "separate", progress=30, message="Mode démo : séparation simplifiée par ffmpeg...")
        await asyncio.to_thread(audio.to_mono, orig, vocals)
        await asyncio.to_thread(audio.phase_cancel, orig, instr)
        msg = ("Mode démo : la voix est le morceau d'origine en mono, l'instrumentale est obtenue "
               "par annulation de phase (L-R). Branchez le worker GPU pour une vraie séparation.")
        if await asyncio.to_thread(audio.is_silent, instr):
            shutil.copyfile(orig, instr)
            msg = ("Mode démo : morceau mono, l'annulation de phase est impossible. "
                   "L'instrumentale est l'original. Branchez le worker GPU pour une vraie séparation.")

    def fn(pr: Project) -> None:
        _set_file(pr, "vocals", "vocals.wav")
        _set_file(pr, "instrumental", "instrumental.wav")
    store.update(pid, fn)
    return msg


async def step_transcribe(pid: str, body: dict[str, Any]) -> str:
    p = store.load(pid)
    vocals = _vocals_or_original(p)
    if await _use_worker(pid):
        _set_step(pid, "transcribe", progress=20, message="Transcription MMS sur le worker GPU...")
        segs = await worker.transcribe(vocals, p.source_lang)
        lines = [Line(index=i, text=str(s.get("text", "")).strip(), start=round(float(s["start"]), 2),
                      end=round(float(s["end"]), 2)) for i, s in enumerate(segs)]
        if not lines:
            raise StepError("Aucune ligne chantée détectée par le worker.")
        for l in lines:
            l.n_syllables = count_syllables(l.text, p.source_lang) if l.text else 0
        msg = f"{len(lines)} lignes transcrites. Corrigez le texte si besoin."
    else:
        _set_step(pid, "transcribe", progress=30, message="Mode démo : détection des lignes par énergie...")
        energy = await _energy(vocals)
        segs = audio.detect_segments(energy, ENERGY_HOP)
        if not segs:
            raise StepError("Aucune voix détectée dans le fichier.")
        lines = [Line(index=i, start=s, end=e) for i, (s, e) in enumerate(segs)]
        msg = (f"Mode démo : {len(lines)} lignes détectées par l'énergie de la voix. "
               "La transcription automatique demande le worker GPU : tapez le texte de chaque ligne.")

    def fn(pr: Project) -> None:
        pr.lines = lines
        pr.pitch = None
    store.update(pid, fn)
    return msg


async def step_align(pid: str, body: dict[str, Any]) -> str:
    p = store.load(pid)
    vocals = _vocals_or_original(p)
    lang = p.source_lang
    if not any(l.text.strip() for l in p.lines):
        raise StepError("Aucun texte saisi : complétez les paroles des lignes avant l'alignement.")
    lines = [l.model_copy(deep=True) for l in p.lines]
    pitch: Pitch | None = None
    energy, hop = await _energy(vocals), ENERGY_HOP

    if await _use_worker(pid):
        _set_step(pid, "align", progress=15, message="Analyse de la mélodie (f0) sur le worker GPU...")
        try:
            ana = await worker.analyze(vocals)
            if ana.get("f0"):
                pitch = Pitch(hop=float(ana.get("hop", 0.01)), f0=[float(x) for x in ana["f0"]])
            if ana.get("energy"):
                energy = np.asarray(ana["energy"], dtype=np.float32)
                hop = float(ana.get("hop", ENERGY_HOP))
        except worker.WorkerError as exc:
            log.warning("analyze indisponible : %s", exc)
        _set_step(pid, "align", progress=45, message="Alignement forcé MMS sur le worker GPU...")
        todo = [l for l in lines if l.text.strip()]
        res = await worker.align(vocals, [{"text": l.text, "start": l.start, "end": l.end}
                                          for l in todo], lang)
        for l, r in zip(todo, res):
            sylls: list[tuple[str, float, float]] = []
            for w in r.get("words") or []:
                parts = split_syllables(str(w.get("text", "")), lang) or [str(w.get("text", ""))]
                sylls += _uniform_syllables(parts, float(w["start"]), float(w["end"]))
            if not sylls:  # mot non aligné : repli uniforme
                sylls = _uniform_syllables(split_syllables(l.text, lang), l.start, l.end)
            _apply_syllables(l, sylls, energy, hop)
        msg = "Syllabes alignées (MMS) et accents placés sur les temps forts."
        if pitch is None:
            msg += " Courbe de mélodie indisponible."
    else:
        _set_step(pid, "align", progress=40, message="Mode démo : répartition des syllabes...")
        for l in lines:
            if l.text.strip():
                _apply_syllables(l, _uniform_syllables(split_syllables(l.text, lang), l.start, l.end),
                                 energy, hop)
        msg = ("Mode démo : syllabes réparties uniformément sur chaque ligne, accents sur les pics "
               "d'énergie. L'alignement précis et la mélodie demandent le worker GPU.")
    for l in lines:
        if not l.text.strip():
            l.syllables, l.n_syllables, l.stress_positions = [], 0, []

    def fn(pr: Project) -> None:
        pr.lines = lines
        pr.pitch = pitch
    store.update(pid, fn)
    return msg


async def step_translate(pid: str, body: dict[str, Any]) -> str:
    p = store.load(pid)
    n_variants = int(body.get("n_variants") or 3)
    lines = [l.model_copy(deep=True) for l in p.lines]
    todo = [l for l in lines if l.text.strip()]
    if not todo:
        raise StepError("Aucune ligne avec du texte à traduire.")
    notes: list[str] = []

    # 1. Sens en français (NLLB) pour les lignes sans "meaning"
    missing = [l for l in todo if not l.meaning.strip()]
    if missing:
        if p.source_lang == "fra":
            for l in missing:
                l.meaning = l.text
        elif await _use_worker(pid):
            _set_step(pid, "translate", progress=10, message="Traduction du sens (NLLB) sur le worker GPU...")
            try:
                out = await worker.translate([l.text for l in missing], NLLB[p.source_lang], NLLB["fra"])
                for l, t in zip(missing, out):
                    l.meaning = t.strip()
            except worker.WorkerError as exc:
                notes.append(f"Sens non traduit ({exc}).")
        else:
            notes.append("Mode démo : sans worker, le sens n'est pas traduit automatiquement. "
                         "Saisissez le sens en français pour de meilleures variantes.")

    # 2. Variantes chantables, en parallèle (4 lignes à la fois)
    _set_step(pid, "translate", progress=30, message="Écriture des variantes chantables...")
    context = _lyrics_context(p)
    sem = asyncio.Semaphore(4)
    done = 0

    async def one(l: Line) -> None:
        nonlocal done
        n = l.n_syllables or count_syllables(l.text, p.source_lang)
        async with sem:
            raw = await adapt_line(l.meaning or l.text, p.target_lang, max(1, n),
                                   l.stress_positions or None, source_text=l.text,
                                   n_variants=n_variants, context=context)
        l.n_syllables = n
        l.variants = [Variant(**{k: v[k] for k in ("text", "syllables", "split", "ok") if k in v})
                      for v in raw]
        done += 1
        _set_step(pid, "translate", progress=30 + int(65 * done / len(todo)))

    await asyncio.gather(*(one(l) for l in todo))

    def fn(pr: Project) -> None:
        pr.lines = lines
    store.update(pid, fn)
    ok = sum(1 for l in todo if any(v.ok for v in l.variants))
    return " ".join([f"Variantes prêtes : {ok}/{len(todo)} lignes ont au moins une variante au bon "
                     "nombre de syllabes. Choisissez une variante par ligne."] + notes)


def _chosen_text(l: Line) -> str:
    if l.chosen:
        return l.chosen
    return l.variants[0].text if l.variants else ""


async def step_sing(pid: str, body: dict[str, Any]) -> str:
    p = store.load(pid)
    mode = body.get("mode") or "studio"
    if mode not in ("studio", "auto"):
        raise StepError("Mode de chant inconnu : utilisez studio ou auto.")
    reference = _vocals_or_original(p)
    sung = _path(pid, "sung.wav")
    live = await _use_worker(pid)

    if mode == "studio":
        guide = _file_of(p, "guide")
        if guide is None:
            raise StepError("Déposez d'abord une voix guide chantée dans la langue cible.")
        if live:
            _set_step(pid, "sing", progress=20, message="Conversion de voix Seed-VC sur le worker GPU...")
            data = await worker.convert(guide, reference)
            await asyncio.to_thread(audio.write_wav_bytes, data, sung, 1)
            msg = "La voix guide chante maintenant avec le timbre de l'artiste (Seed-VC)."
        else:
            await asyncio.to_thread(shutil.copyfile, guide, sung)
            msg = ("Mode démo : la conversion de voix demande le worker GPU, "
                   "la voix guide est utilisée telle quelle.")
    else:
        if not live:
            raise StepError("Le mode auto (synthèse vocale + conversion) demande le worker GPU, "
                            "indisponible pour l'instant. Utilisez le mode studio avec une voix guide.")
        sung_lines = [l for l in p.lines if _chosen_text(l)]
        if not sung_lines:
            raise StepError("Aucune ligne traduite : lancez la traduction et choisissez les variantes.")
        plan_lines = []
        for l in sung_lines:
            text = _chosen_text(l)
            n_target = count_syllables(text, p.target_lang)
            if l.syllables and len(l.syllables) == n_target:
                spans = [{"start": s.start, "end": s.end} for s in l.syllables]
            else:
                spans = [{"start": s, "end": e}
                         for _, s, e in _uniform_syllables(["x"] * max(1, n_target), l.start, l.end)]
            plan_lines.append({"text": text, "start": l.start, "end": l.end, "syllables": spans})
        plan = {"lang": p.target_lang, "lines": plan_lines,
                "hop": p.pitch.hop if p.pitch else 0.01,
                "f0": p.pitch.f0 if p.pitch else [], "total_duration": p.duration}
        _set_step(pid, "sing", progress=20, message="Synthèse chantée + Seed-VC sur le worker GPU...")
        data = await worker.sing_auto(reference, plan)
        await asyncio.to_thread(audio.write_wav_bytes, data, sung, 1)
        msg = "Voix chantée générée automatiquement avec le timbre de l'artiste."

    store.update(pid, lambda pr: _set_file(pr, "sung", "sung.wav"))
    return msg


async def step_finalize(pid: str, body: dict[str, Any]) -> str:
    p = store.load(pid)
    voice = _file_of(p, "sung") or _file_of(p, "guide")
    if voice is None:
        raise StepError("Aucune voix chantée : lancez l'étape chant ou déposez une voix guide.")
    instr = _file_of(p, "instrumental") or _file_of(p, "original")
    if instr is None:
        raise StepError("Instrumentale introuvable.")
    voice_vol = float(body.get("voice_volume", 1.0))
    instr_vol = float(body.get("instrumental_volume", 0.8))
    mixed, final, mp3 = _path(pid, "mix.wav"), _path(pid, "final.wav"), _path(pid, "final.mp3")
    _set_step(pid, "finalize", progress=20, message="Mixage voix + instrumentale...")
    await asyncio.to_thread(audio.mix, voice, instr, mixed, voice_vol, instr_vol)

    wm_msg = f"PS:{pid}"
    applied = False
    note = ""
    if await _use_worker(pid):
        _set_step(pid, "finalize", progress=60, message="Filigrane AudioSeal sur le worker GPU...")
        try:
            data = await worker.watermark_embed(mixed, wm_msg)
            await asyncio.to_thread(audio.write_wav_bytes, data, final, 2)
            applied = True
        except worker.WorkerError as exc:
            note = f" Filigrane non appliqué ({exc})."
    else:
        note = " Mode démo : filigrane AudioSeal non appliqué (worker GPU requis)."
    if not applied:
        await asyncio.to_thread(shutil.copyfile, mixed, final)
    mixed.unlink(missing_ok=True)
    _set_step(pid, "finalize", progress=85, message="Export mp3...")
    await asyncio.to_thread(audio.to_mp3, final, mp3)

    def fn(pr: Project) -> None:
        _set_file(pr, "final", "final.wav")
        pr.watermark.applied = applied
        pr.watermark.message = wm_msg if applied else None
    store.update(pid, fn)
    return ("Morceau final prêt (final.wav et final.mp3)." + (" Filigrane AudioSeal appliqué." if applied else "")
            + note)


STEPS: dict[str, Callable[[str, dict[str, Any]], Awaitable[str]]] = {
    "separate": step_separate, "transcribe": step_transcribe, "align": step_align,
    "translate": step_translate, "sing": step_sing, "finalize": step_finalize,
}


# ---------------------------------------------------------------- lancement

async def _run(pid: str, step: str, body: dict[str, Any]) -> None:
    try:
        msg = await STEPS[step](pid, body)
        _set_step(pid, step, status="done", progress=100, message=msg)
    except store.NotFound:
        return  # projet supprimé pendant l'étape
    except StepError as exc:
        _set_step(pid, step, status="error", message=str(exc))
    except worker.WorkerError as exc:
        _set_step(pid, step, status="error", message=f"{exc} Réessayez ou passez en mode démo.")
    except audio.AudioError as exc:
        _set_step(pid, step, status="error", message=str(exc))
    except Exception as exc:  # garde-fou : jamais de tâche silencieusement morte
        log.exception("Étape %s échouée pour %s", step, pid)
        try:
            _set_step(pid, step, status="error", message=f"Erreur inattendue : {exc}")
        except store.NotFound:
            pass


def start_step(pid: str, step: str, body: dict[str, Any]) -> Project:
    """Passe l'étape en running puis lance la tâche de fond."""
    def fn(p: Project) -> None:
        s = p.steps[step]
        s.status, s.progress, s.message = "running", 0, "Démarrage..."
    project = store.update(pid, fn)
    task = asyncio.create_task(_run(pid, step, body))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return project


def running_tasks() -> int:
    return len(_tasks)
