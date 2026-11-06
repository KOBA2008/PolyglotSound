"""Application FastAPI PolyglotSound."""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Erreurs de validation renvoyées au format du contrat : {detail: "message en français"}."""
    parts = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e.get("loc", []) if x not in ("body", "query", "path"))
        parts.append(f"{loc or 'corps'} : {e.get('msg', 'invalide')}")
    return JSONResponse(status_code=422, content={"detail": "Requête invalide (" + "; ".join(parts) + ")."})
