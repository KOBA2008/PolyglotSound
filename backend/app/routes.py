"""Routes /api (voir CONTRACT.md) et /files."""
from __future__ import annotations

import os
import asyncio
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app import audio, pipeline, store
from app import worker_client as worker
from app.config import settings
from app.lyrics_bridge import LYRICS_FALLBACK, adapt_line, count_syllables, llm_info, split_syllables
from app.models import (FILE_KEYS, STEP_NAMES, AdaptBody, ChoicesBody, LinesBody, Project,
                        SyllablesBody, Variant)

api = APIRouter(prefix="/api")
files_router = APIRouter()

MAX_UPLOAD = 100 * 1024 * 1024  # 100 Mo
SOURCE_LANGS = {"fon", "yor", "swh", "fra", "eng"}
TARGET_LANGS = {"eng", "fra", "fon", "yor", "swh"}
AUDIO_TYPES = {".wav": "audio/wav", ".mp3": "audio/mpeg"}


def _load(pid: str) -> Project:
    try:
        return store.load(pid)
    except store.NotFound:
        raise HTTPException(404, "Projet introuvable.")


async def _save_upload(upload: UploadFile, dst: Path) -> None:
    size = 0
    with dst.open("wb") as fh:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD:
                raise HTTPException(413, "Fichier trop volumineux (100 Mo maximum).")
            fh.write(chunk)
    if size == 0:
        raise HTTPException(400, "Fichier audio vide.")


async def _import_audio(upload: UploadFile, dst: Path, channels: int = 2) -> None:
    """Enregistre l'upload puis le convertit en WAV 44,1 kHz."""
    suffix = Path(upload.filename or "audio").suffix or ".bin"
    raw = dst.with_name(dst.stem + ".upload" + suffix)
    try:
        await _save_upload(upload, raw)
        try:
            await asyncio.to_thread(audio.to_wav, raw, dst, channels)
        except audio.AudioError:
            raise HTTPException(400, "Format audio non reconnu. Envoyez un fichier wav, mp3, m4a ou ogg.")
    finally:
        raw.unlink(missing_ok=True)


# ---------------------------------------------------------------- santé

@api.get("/health")
async def health() -> dict[str, Any]:
    ok = await worker.available()
    return {"status": "ok", "mode": "live" if ok else "demo", "worker": ok,
            "llm": llm_info(), "lyrics_fallback": LYRICS_FALLBACK}


# ---------------------------------------------------------------- projets

@api.get("/projects", response_model=list[Project])
async def list_projects() -> list[Project]:
    return store.list_all()


@api.post("/projects", response_model=Project)
async def create_project(file: UploadFile = File(...), title: str = Form(""), artist: str = Form(""),
                         source_lang: str = Form("fon"), target_lang: str = Form("eng"),
                         consent: str = Form("false")) -> Project:
    if consent.strip().lower() != "true":
        raise HTTPException(400, "Consentement requis : l'artiste doit certifier être le titulaire de la voix.")
    if source_lang not in SOURCE_LANGS:
        raise HTTPException(400, "Langue source inconnue (fon, yor, swh, fra ou eng).")
    if target_lang not in TARGET_LANGS:
        raise HTTPException(400, "Langue cible inconnue (eng, fra, fon, yor ou swh).")
    pid = store.new_id()
    d = store.project_dir(pid)
    d.mkdir(parents=True)
    try:
        original = d / "original.wav"
        await _import_audio(file, original, channels=2)
        dur = await asyncio.to_thread(audio.duration, original)
        # Le tunnel Cloudflare coupe les requêtes au-delà d'environ 100 s :
        # on garde un extrait court (refrain) pour que chaque étape GPU tienne.
        max_dur = float(os.getenv("MAX_DURATION", "45"))
        if dur > max_dur:
            trimmed = d / "original.trim.wav"
            await asyncio.to_thread(audio.cut, original, trimmed, 0.0, max_dur)
            trimmed.replace(original)
            dur = await asyncio.to_thread(audio.duration, original)
    except BaseException:
        shutil.rmtree(d, ignore_errors=True)
        raise
    project = Project(id=pid, title=title.strip() or "Sans titre", artist=artist.strip(),
                      source_lang=source_lang, target_lang=target_lang,  # type: ignore[arg-type]
                      consent=True, created_at=store.now_iso(),
                      mode="live" if await worker.available() else "demo", duration=dur)
    project.files.original = store.file_url(pid, "original.wav")
    return store.save(project)


@api.get("/projects/{pid}", response_model=Project)
async def get_project(pid: str) -> Project:
    return _load(pid)


@api.delete("/projects/{pid}")
async def delete_project(pid: str) -> dict[str, bool]:
    try:
        store.delete(pid)
    except store.NotFound:
        raise HTTPException(404, "Projet introuvable.")
    return {"ok": True}


@api.post("/projects/{pid}/steps/{step}", response_model=Project)
async def run_step(pid: str, step: str, body: dict[str, Any] | None = Body(default=None)) -> Project:
    if step not in STEP_NAMES:
        raise HTTPException(404, f"Étape inconnue : {step}.")
    project = _load(pid)
    if project.steps[step].status == "running":
        raise HTTPException(409, "Cette étape est déjà en cours.")
    return pipeline.start_step(pid, step, body or {})


@api.put("/projects/{pid}/lines", response_model=Project)
async def put_lines(pid: str, body: LinesBody) -> Project:
    _load(pid)
    edits = {e.index: e for e in body.lines}

    def fn(p: Project) -> None:
        for line in p.lines:
            e = edits.get(line.index)
            if e is None:
                continue
            if e.text is not None and e.text.strip() != line.text:
                line.text = e.text.strip()
                # le texte a changé : syllabes et variantes à refaire
                line.syllables, line.stress_positions, line.variants, line.chosen = [], [], [], None
            if e.meaning is not None:
                line.meaning = e.meaning.strip()
            line.n_syllables = count_syllables(line.text, p.source_lang) if line.text else 0
    return store.update(pid, fn)


@api.put("/projects/{pid}/choices", response_model=Project)
async def put_choices(pid: str, body: ChoicesBody) -> Project:
    _load(pid)
    choices = {c.index: c.text for c in body.choices}

    def fn(p: Project) -> None:
        for line in p.lines:
            if line.index in choices:
                t = choices[line.index]
                line.chosen = t.strip() if t and t.strip() else None
    return store.update(pid, fn)


@api.post("/projects/{pid}/guide", response_model=Project)
async def upload_guide(pid: str, file: UploadFile = File(...)) -> Project:
    _load(pid)
    await _import_audio(file, store.file_path(pid, "guide.wav"), channels=1)
    return store.update(pid, lambda p: setattr(p.files, "guide", store.file_url(pid, "guide.wav")))


# ---------------------------------------------------------------- outils

@api.post("/adapt")
async def adapt(body: AdaptBody) -> dict[str, list[Variant]]:
    meaning = body.meaning.strip() or (body.text or "").strip()
    if not meaning:
        raise HTTPException(400, "Indiquez le sens ou le texte de la ligne à adapter.")
    try:
        raw = await adapt_line(meaning, body.target_lang, body.n_syllables, body.stress_positions,
                               source_text=body.text or "", n_variants=body.n_variants)
    except Exception as exc:
        raise HTTPException(502, f"Le moteur de paroles a échoué : {exc}")
    return {"variants": [Variant(**{k: v[k] for k in ("text", "syllables", "split", "ok") if k in v})
                         for v in raw]}


@api.post("/syllables")
async def syllables(body: SyllablesBody) -> dict[str, Any]:
    split = split_syllables(body.text, body.lang)
    return {"count": len(split), "split": split}


@api.post("/watermark/detect")
async def watermark_detect(file: UploadFile = File(...)) -> dict[str, Any]:
    if not await worker.available():
        return {"detected": False, "confidence": 0.0, "message": None, "mode": "demo",
                "explanation": "Mode démo : la détection du filigrane AudioSeal demande le worker GPU."}
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as tmp:
        wav = Path(tmp) / "check.wav"
        await _import_audio(file, wav, channels=1)
        try:
            r = await worker.watermark_detect(wav)
        except worker.WorkerError as exc:
            raise HTTPException(502, str(exc))
    return {"detected": bool(r.get("detected")), "confidence": float(r.get("confidence") or 0.0),
            "message": r.get("message"), "mode": "live"}


# ---------------------------------------------------------------- fichiers

@files_router.get("/files/{pid}/{name}")
async def get_file(pid: str, name: str) -> FileResponse:
    stem, ext = Path(name).stem, Path(name).suffix.lower()
    if ext not in AUDIO_TYPES or stem not in (*FILE_KEYS, "final") or "/" in name:
        raise HTTPException(404, "Fichier introuvable.")
    try:
        path = store.file_path(pid, name)
    except store.NotFound:
        raise HTTPException(404, "Fichier introuvable.")
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable.")
    return FileResponse(path, media_type=AUDIO_TYPES[ext], filename=name,
                        content_disposition_type="inline")
