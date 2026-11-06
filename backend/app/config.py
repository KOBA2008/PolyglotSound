"""Configuration lue depuis les variables d'environnement."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings:
    def __init__(self) -> None:
        self.worker_url: str | None = (os.getenv("WORKER_URL") or "").strip().rstrip("/") or None
        self.worker_token: str | None = os.getenv("WORKER_TOKEN") or None
        self.worker_timeout: float = float(os.getenv("WORKER_TIMEOUT", "600"))
        self.health_ttl: float = float(os.getenv("WORKER_HEALTH_TTL", "30"))
        self.data_dir: Path = Path(os.getenv("DATA_DIR") or (BACKEND_DIR / "data")).resolve()
        self.ffmpeg: str = os.getenv("FFMPEG", "ffmpeg")
        self.ffprobe: str = os.getenv("FFPROBE", "ffprobe")
        self.sample_rate: int = 44100
        self.data_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
