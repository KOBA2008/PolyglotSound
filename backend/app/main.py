"""Application FastAPI PolyglotSound."""
from __future__ import annotations

try:  # certificats du système (Windows, antivirus, proxy d'entreprise) pour les appels HTTPS (Groq)
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

import base64
import logging
import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import store
from app.models import Project
from app.routes import api, files_router

logging.basicConfig(level=logging.INFO)


def _reset_interrupted() -> None:
    """Au démarrage, une étape restée en running a été interrompue par l'arrêt du serveur."""
    for p in store.list_all():
        if any(s.status == "running" for s in p.steps.values()):
            def fn(pr: Project) -> None:
                for s in pr.steps.values():
                    if s.status == "running":
                        s.status, s.message = "error", "Étape interrompue (redémarrage du serveur). Relancez-la."
            store.update(p.id, fn)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _reset_interrupted()
    yield


app = FastAPI(title="PolyglotSound backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(api)
app.include_router(files_router)


@app.middleware("http")
async def _site_password(request: Request, call_next):  # type: ignore[no-untyped-def]
    """En ligne : mot de passe unique (SITE_PASSWORD) pour protéger les crédits API et les fichiers audio."""
    password = os.getenv("SITE_PASSWORD", "")
    if not password or request.url.path == "/api/health" or request.method == "OPTIONS":
        return await call_next(request)
    header = request.headers.get("authorization", "")
    if header.startswith("Basic "):
        try:
            given = base64.b64decode(header[6:]).decode("utf-8").partition(":")[2]
        except ValueError:
            given = ""
        if secrets.compare_digest(given.encode(), password.encode()):
            return await call_next(request)
    return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="PolyglotSound"'})


# Site React compilé servi par la même application (déploiement en un seul service)
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class _Site(StaticFiles):
    """Renvoie index.html pour les routes React (rechargement d'une page profonde)."""

    async def get_response(self, path, scope):  # type: ignore[no-untyped-def]
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or path.startswith(("api/", "files/")):
                raise
            return await super().get_response("index.html", scope)


if _dist.is_dir():
    app.mount("/", _Site(directory=_dist, html=True), name="site")


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Erreurs de validation renvoyées au format du contrat : {detail: "message en français"}."""
    parts = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e.get("loc", []) if x not in ("body", "query", "path"))
        parts.append(f"{loc or 'corps'} : {e.get('msg', 'invalide')}")
    return JSONResponse(status_code=422, content={"detail": "Requête invalide (" + "; ".join(parts) + ")."})
