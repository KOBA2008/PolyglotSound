"""Repli sans worker GPU : transcription par Whisper (Groq) et sens en français par le LLM.

Utilisé uniquement quand le worker est absent et que GROQ_API_KEY est défini.
Whisper ne connaît pas le fon : pour cette langue, on garde la saisie manuelle.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import httpx

from app.lyrics.llm import chat_json

log = logging.getLogger("polyglotsound.groq_fallback")

ASR_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
WHISPER_LANG = {"yor": "yo", "swh": "sw", "fra": "fr", "eng": "en"}
# Amorce générique (pas les paroles d'une chanson) : oriente Whisper vers l'orthographe de la langue
WHISPER_PROMPT = {
    "yor": "Orin Yorùbá. Ẹ kú àárọ̀, ọmọ mi. Ìfẹ́ ni mo ní sí ọ. Ọlọ́run á ṣe é.",
    "swh": "Wimbo wa Kiswahili. Nakupenda sana, mpenzi wangu.",
}
LANG_NAMES = {"yor": "Yoruba", "swh": "Swahili", "fon": "Fon", "eng": "English", "fra": "French"}


class FallbackError(Exception):
    pass


def available(lang: str | None = None) -> bool:
    return bool(os.getenv("GROQ_API_KEY")) and (lang is None or lang in WHISPER_LANG)


async def transcribe(path: Path, lang: str) -> list[dict[str, Any]]:
    """Segments [{text, start, end}] de Whisper large-v3 (Groq)."""
    if not available(lang):
        raise FallbackError("Transcription Groq indisponible pour cette langue.")
    model = os.getenv("GROQ_ASR_MODEL", "whisper-large-v3")
    headers = {"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"}
    data = {"model": model, "language": WHISPER_LANG[lang], "response_format": "verbose_json", "temperature": "0"}
    if lang in WHISPER_PROMPT:
        data["prompt"] = WHISPER_PROMPT[lang]
    try:
        async with httpx.AsyncClient(timeout=120.0) as c:
            with open(path, "rb") as fh:
                r = await c.post(ASR_URL, headers=headers, data=data, files={"file": (path.name, fh, "audio/wav")})
    except httpx.HTTPError as exc:
        raise FallbackError(f"Groq injoignable ({exc.__class__.__name__}).") from exc
    if r.status_code != 200:
        raise FallbackError(f"Groq Whisper a répondu {r.status_code} : {r.text[:200]}")
    segs = []
    for s in r.json().get("segments") or []:
        text = str(s.get("text", "")).strip()
        start, end = float(s.get("start", 0)), float(s.get("end", 0))
        if text and end - start >= 0.3:
            segs.append({"text": text, "start": start, "end": end})
    return segs


async def meanings_fr(texts: list[str], src_lang: str) -> list[str]:
    """Sens en français, une ligne par texte, via le LLM (Groq)."""
    name = LANG_NAMES.get(src_lang, src_lang)
    system = ("You translate song lyrics into French, line by line, keeping the meaning (not the rhythm). "
              'Answer only with JSON: {"lines": ["...", "..."]} with exactly one French line per input line.')
    user = f"Source language: {name}\nLines:\n" + "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
    out = await chat_json(system, user, temperature=0.2)
    lines = out.get("lines") if isinstance(out, dict) else out
    if not isinstance(lines, list) or len(lines) != len(texts):
        raise FallbackError("Réponse du LLM inattendue pour la traduction du sens.")
    return [str(x).strip() for x in lines]
