"""Client LLM minimal (httpx async, sans SDK) pour le moteur lyrics.

Variables d'environnement :
  LLM_PROVIDER   groq | anthropic | ollama | rule | auto (défaut auto)
                 auto = groq si GROQ_API_KEY, sinon anthropic si ANTHROPIC_API_KEY, sinon rule
  GROQ_API_KEY, GROQ_MODEL (défaut llama-3.3-70b-versatile)
  ANTHROPIC_API_KEY, ANTHROPIC_MODEL (défaut claude-opus-5-5)
  OLLAMA_URL (défaut http://localhost:11434), OLLAMA_MODEL (défaut llama3.2)
  LLM_TIMEOUT (secondes, défaut 45)
"""

from __future__ import annotations

import re
import asyncio
import json
import os
from typing import Any

import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2026-10-21"
ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_DEFAULT_MODELS = {
    # Groq a retiré ses Llama de chat fin 2026 : gpt-oss-120b est le meilleur modèle ouvert disponible.
    "groq": "openai/gpt-oss-120b",
    "anthropic": "claude-opus-5-5",
    "ollama": "llama3.2",
    "rule": None,
}


class LLMError(RuntimeError):
    pass


def resolve_provider() -> str:
    p = (os.getenv("LLM_PROVIDER") or "auto").strip().lower()
    if p in ("groq", "anthropic", "ollama", "rule"):
        return p
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    return "rule"


def _model_for(provider: str) -> str | None:
    env = {"groq": "GROQ_MODEL", "anthropic": "ANTHROPIC_MODEL", "ollama": "OLLAMA_MODEL"}.get(provider)
    return (os.getenv(env) if env else None) or _DEFAULT_MODELS.get(provider)


def llm_info() -> dict:
    p = resolve_provider()
    return {"provider": p, "model": _model_for(p)}


def _timeout() -> float:
    try:
        return float(os.getenv("LLM_TIMEOUT", "45"))
    except ValueError:
        return 45.0


def extract_json(text: str) -> Any:
    """Parse tolérant : JSON direct, sinon premier objet/tableau JSON valide trouvé dans le texte."""
    if text is None:
        raise ValueError("réponse vide")
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t[:4].lower() == "json":
            t = t[4:]
    try:
        return json.loads(t)
    except Exception:
        pass
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch in "{[":
            try:
                obj, _ = dec.raw_decode(text[i:])
                return obj
            except Exception:
                continue
    raise ValueError("aucun JSON trouvé dans la réponse du LLM")


async def _groq(client: httpx.AsyncClient, system: str, user: str, model: str, temperature: float) -> str:
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise LLMError("GROQ_API_KEY manquant")
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"},
    }
    if "gpt-oss" in model or "qwen3" in model:
        # Modèles à raisonnement : les jetons de réflexion comptent dans max_tokens.
        body["max_tokens"] = 6000
        body["reasoning_effort"] = os.getenv("GROQ_REASONING_EFFORT", "low")
    r = await client.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=body,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


async def _ollama(client: httpx.AsyncClient, system: str, user: str, model: str, temperature: float) -> str:
    base = (os.getenv("OLLAMA_URL") or "http://localhost:11434").rstrip("/")
    r = await client.post(
        f"{base}/api/chat",
        json={
            "model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
            "format": "json",
            "options": {"temperature": temperature},
        },
    )
    r.raise_for_status()
    return r.json()["message"]["content"]


async def _anthropic(client: httpx.AsyncClient, system: str, user: str, model: str, temperature: float) -> str:
    # Messages API en HTTP brut. API 2026-10-21 : pas de temperature/top_p/top_k.
    # Réflexion adaptative par défaut ; effort "low" (tâche courte, latence démo).
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise LLMError("ANTHROPIC_API_KEY manquant")
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": 8000,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"effort": os.getenv("ANTHROPIC_EFFORT", "low")},
        "fallbacks": "default",
    }
    headers = {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_FALLBACK_BETA,
        "content-type": "application/json",
    }
    r = await client.post(ANTHROPIC_URL, headers=headers, json=body)
    if r.status_code == 400 and "fallback" in r.text.lower():
        # compte/plateforme sans repli serveur : on renvoie sans
        body.pop("fallbacks", None)
        headers.pop("anthropic-beta", None)
        r = await client.post(ANTHROPIC_URL, headers=headers, json=body)
    r.raise_for_status()
    data = r.json()
    if data.get("stop_reason") == "refusal":
        raise LLMError(f"requête refusée par le modèle : {data.get('stop_details')}")
    texts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "".join(texts)


_CALLS = {"groq": _groq, "anthropic": _anthropic, "ollama": _ollama}


async def chat_json(system: str, user: str, *, temperature: float = 0.8, provider: str | None = None) -> Any:
    """Appelle le LLM configuré et renvoie le JSON parsé (1 retry en cas d'échec)."""
    p = provider or resolve_provider()
    if p not in _CALLS:
        raise LLMError(f"pas de LLM pour le fournisseur '{p}'")
    models = [_model_for(p)]
    if p == "groq":
        # Palier gratuit Groq : 8000 jetons/min par modèle. En cas de quota, on bascule sur un second modèle.
        alt = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")
        if alt and alt not in models:
            models.append(alt)
    last: Exception | None = None
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        for model in models:
            for attempt in range(3):
                try:
                    raw = await _CALLS[p](client, system, user, model, temperature)
                    return extract_json(raw)
                except Exception as e:  # réseau, HTTP, JSON
                    last = e
                    code = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else None
                    if code in (401, 403):
                        break
                    if code in (400, 404) and attempt > 0:
                        break
                    if code == 429:
                        # Quota : on attend le délai demandé (plafonné) une fois, puis on change de modèle.
                        if attempt > 0:
                            break
                        m = re.search(r"try again in ([0-9.]+)s", e.response.text)
                        await asyncio.sleep(min(float(m.group(1)) if m else 5.0, 20.0) + 0.5)
                        continue
                    await asyncio.sleep(1.0)
    detail = last
    if isinstance(last, httpx.HTTPStatusError):
        detail = f"HTTP {last.response.status_code} : {last.response.text[:300]}"
    raise LLMError(f"échec LLM ({p}) : {detail}")
