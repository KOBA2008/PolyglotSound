"""Client HTTP async du worker GPU (voir CONTRACT.md, section API worker)."""
from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from typing import Any

import httpx

from app.config import settings


class WorkerError(Exception):
    pass


_health: dict[str, Any] = {"t": 0.0, "ok": False}


def _headers() -> dict[str, str]:
    return {"X-Worker-Token": settings.worker_token} if settings.worker_token else {}


def configured() -> bool:
    return settings.worker_url is not None


async def available(force: bool = False) -> bool:
    """Health check mis en cache (WORKER_HEALTH_TTL, 30 s par défaut)."""
    if not configured():
        return False
    now = time.monotonic()
    if not force and now - _health["t"] < settings.health_ttl:
        return bool(_health["ok"])
    ok = False
    try:
        async with httpx.AsyncClient(timeout=8.0, headers=_headers()) as c:
            r = await c.get(f"{settings.worker_url}/health")
            ok = r.status_code == 200 and bool(r.json().get("ok", True))
    except (httpx.HTTPError, ValueError):
        ok = False
    _health.update(t=now, ok=ok)
    return ok


def mark_down() -> None:
    _health.update(t=time.monotonic(), ok=False)


async def _post(route: str, *, files: dict[str, Path] | None = None,
                data: dict[str, str] | None = None, json_body: Any = None) -> dict[str, Any]:
    if not configured():
        raise WorkerError("Worker GPU non configuré.")
    url = f"{settings.worker_url}{route}"
    opened = []
    try:
        mp = None
        if files:
            mp = {}
            for k, p in files.items():
                fh = open(p, "rb")
                opened.append(fh)
                mp[k] = (p.name, fh, "audio/wav")
        timeout = httpx.Timeout(settings.worker_timeout, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout, headers=_headers()) as c:
            if json_body is not None:
                r = await c.post(url, json=json_body)
            else:
                r = await c.post(url, files=mp, data=data or {})
    except httpx.TimeoutException as exc:
        raise WorkerError(f"Le worker GPU n'a pas répondu à temps ({route}).") from exc
    except httpx.HTTPError as exc:
        mark_down()
        raise WorkerError(f"Worker GPU injoignable ({route}).") from exc
    finally:
        for fh in opened:
            fh.close()
    try:
        payload = r.json()
    except ValueError:
        payload = {}
    if r.status_code >= 400:
        detail = payload.get("detail") if isinstance(payload, dict) else None
        raise WorkerError(f"Erreur du worker GPU ({route}) : {detail or r.status_code}")
    return payload


def decode_audio(payload: dict[str, Any], key: str = "audio_b64") -> bytes:
    b64 = payload.get(key)
    if not b64:
        raise WorkerError(f"Réponse du worker sans audio ({key}).")
    return base64.b64decode(b64)


async def separate(audio: Path) -> tuple[bytes, bytes]:
    p = await _post("/separate", files={"file": audio})
    return decode_audio(p, "vocals_b64"), decode_audio(p, "instrumental_b64")


async def transcribe(vocals: Path, lang: str) -> list[dict[str, Any]]:
    p = await _post("/transcribe", files={"file": vocals}, data={"lang": lang})
    return list(p.get("segments") or [])


async def align(vocals: Path, lines: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    p = await _post("/align", files={"file": vocals},
                    data={"lines": json.dumps(lines, ensure_ascii=False), "lang": lang})
    return list(p.get("lines") or [])


async def analyze(vocals: Path) -> dict[str, Any]:
    return await _post("/analyze", files={"file": vocals})


async def translate(texts: list[str], src: str, tgt: str) -> list[str]:
    p = await _post("/translate", json_body={"texts": texts, "src": src, "tgt": tgt})
    return [str(t) for t in (p.get("texts") or [])]


async def convert(source: Path, reference: Path, semitones: int = 0) -> bytes:
    return decode_audio(await _post("/convert", files={"source": source, "reference": reference},
                                    data={"semi_tone_shift": str(int(semitones))}))


async def sing_auto(reference: Path, plan: dict[str, Any]) -> bytes:
    p = await _post("/sing_auto", files={"reference": reference},
                    data={"plan": json.dumps(plan, ensure_ascii=False)})
    return decode_audio(p)


async def watermark_embed(audio: Path, message: str) -> bytes:
    return decode_audio(await _post("/watermark/embed", files={"file": audio},
                                    data={"message": message}))


async def watermark_detect(audio: Path) -> dict[str, Any]:
    return await _post("/watermark/detect", files={"file": audio})
