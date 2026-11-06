"""Persistance JSON par projet : DATA_DIR/<id>/project.json + fichiers audio."""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import threading
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.models import Project

_ID_RE = re.compile(r"^[a-z0-9]{4,32}$")
# Verrou global réentrant : les écritures sont rares et courtes, un seul suffit.
_lock = threading.RLock()


class NotFound(Exception):
    pass


def valid_id(project_id: str) -> bool:
    return bool(_ID_RE.match(project_id))


def project_dir(project_id: str) -> Path:
    if not valid_id(project_id):
        raise NotFound(project_id)
    return settings.data_dir / project_id


def file_path(project_id: str, name: str) -> Path:
    return project_dir(project_id) / name


def file_url(project_id: str, name: str) -> str:
    return f"/files/{project_id}/{name}"


def new_id() -> str:
    while True:
        pid = secrets.token_hex(3)
        if not (settings.data_dir / pid).exists():
            return pid


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _json_path(project_id: str) -> Path:
    return project_dir(project_id) / "project.json"


def save(project: Project) -> Project:
    """Écriture atomique (fichier temporaire puis rename)."""
    with _lock:
        d = project_dir(project.id)
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "project.json.tmp"
        tmp.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        os.replace(tmp, d / "project.json")
    return project


def load(project_id: str) -> Project:
    with _lock:
        try:
            p = _json_path(project_id)
        except NotFound:
            raise
        if not p.exists():
            raise NotFound(project_id)
        return Project.model_validate(json.loads(p.read_text(encoding="utf-8")))


def update(project_id: str, fn: Callable[[Project], None]) -> Project:
    """Lecture, modification, écriture sous verrou."""
    with _lock:
        project = load(project_id)
        fn(project)
        return save(project)


def list_all() -> list[Project]:
    out: list[Project] = []
    with _lock:
        for d in settings.data_dir.iterdir():
            if d.is_dir() and valid_id(d.name) and (d / "project.json").exists():
                try:
                    out.append(load(d.name))
                except Exception:  # projet corrompu : ignoré
                    continue
    out.sort(key=lambda p: p.created_at, reverse=True)
    return out


def delete(project_id: str) -> None:
    with _lock:
        d = project_dir(project_id)
        if not d.exists():
            raise NotFound(project_id)
        shutil.rmtree(d)
