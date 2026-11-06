"""Configuration des tests : DATA_DIR temporaire, mode démo, LLM règle."""
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="polyglotsound-test-")
os.environ["DATA_DIR"] = _TMP
os.environ.pop("WORKER_URL", None)
os.environ["LLM_PROVIDER"] = "rule"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def sine_wav() -> Path:
    """Sinus 3 s stéréo (canaux différents pour que L-R ne soit pas silencieux)."""
    out = Path(_TMP) / "sine.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "aevalsrc='0.5*sin(2*PI*440*t)|0.5*sin(2*PI*660*t)':s=44100:d=3",
                    str(out)], check=True)
    return out


@pytest.fixture(scope="session")
def phrased_wav() -> Path:
    """Deux phrases chantées (sinus modulé) séparées d'un silence : 0-1,5 s, 2,2-4 s."""
    out = Path(_TMP) / "phrased.wav"
    expr = ("(between(t,0,1.5)+between(t,2.2,4))*0.5*sin(2*PI*330*t)*(0.6+0.4*sin(2*PI*3*t))")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"aevalsrc='{expr}|{expr}':s=44100:d=4.5", str(out)], check=True)
    return out
