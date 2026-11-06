"""Chemin live du pipeline avec un worker simulé (fonctions du client remplacées)."""
import io
import subprocess
import time
import wave

import numpy as np
import pytest

from app import worker_client as worker


def _wav_bytes(seconds: float = 4.5, sr: int = 16000) -> bytes:
    t = np.arange(int(seconds * sr)) / sr
    x = (0.3 * np.sin(2 * np.pi * 330 * t) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(x.tobytes())
    return buf.getvalue()


@pytest.fixture
def fake_worker(monkeypatch):
    calls: list[str] = []

    async def available(force=False):
        return True

    async def separate(p):
        calls.append("separate"); return _wav_bytes(), _wav_bytes()

    async def transcribe(p, lang):
        calls.append("transcribe")
        return [{"text": "mɛ ɖé ɖo", "start": 0.0, "end": 1.5}, {"text": "a ni wa", "start": 2.2, "end": 4.0}]

    async def analyze(p):
        calls.append("analyze"); return {"hop": 0.01, "f0": [220.0] * 450, "onsets": [], "energy": []}

    async def align(p, lines, lang):
        calls.append("align")
        out = []
        for l in lines:
            words = l["text"].split(); d = (l["end"] - l["start"]) / len(words)
            out.append({"words": [{"text": w, "start": l["start"] + i * d, "end": l["start"] + (i + 1) * d}
                                  for i, w in enumerate(words)]})
        return out

    async def translate(texts, src, tgt):
        calls.append("translate"); return [f"sens {i}" for i in range(len(texts))]

    async def sing_auto(ref, plan):
        calls.append("sing_auto"); assert plan["lines"] and plan["f0"]; return _wav_bytes()

    async def embed(p, msg):
        calls.append("embed"); return _wav_bytes()

    async def detect(p):
        return {"detected": True, "confidence": 0.97, "message": "PS:abc"}

    for name, fn in [("available", available), ("separate", separate), ("transcribe", transcribe),
                     ("analyze", analyze), ("align", align), ("translate", translate),
                     ("sing_auto", sing_auto), ("watermark_embed", embed), ("watermark_detect", detect)]:
        monkeypatch.setattr(worker, name, fn)
    return calls


def _wait(client, pid, step):
    for _ in range(300):
        p = client.get(f"/api/projects/{pid}").json()
        if p["steps"][step]["status"] in ("done", "error"):
            return p
        time.sleep(0.05)
    raise AssertionError(step)


def test_pipeline_live_simule(client, phrased_wav, fake_worker):
    with open(phrased_wav, "rb") as fh:
        p = client.post("/api/projects", data={"consent": "true", "source_lang": "fon", "target_lang": "eng"},
                        files={"file": ("a.wav", fh, "audio/wav")}).json()
    pid = p["id"]
    assert p["mode"] == "live"
    for step, body in [("separate", None), ("transcribe", None), ("align", None),
                       ("translate", {"n_variants": 2}), ("sing", {"mode": "auto"}), ("finalize", None)]:
        client.post(f"/api/projects/{pid}/steps/{step}", json=body)
        p = _wait(client, pid, step)
        assert p["steps"][step]["status"] == "done", (step, p["steps"][step])
    assert len(p["lines"]) == 2 and p["lines"][0]["text"] == "mɛ ɖé ɖo"
    assert p["lines"][0]["n_syllables"] == 3 and p["lines"][0]["meaning"] == "sens 0"
    assert p["pitch"]["hop"] == 0.01
    assert p["watermark"] == {"applied": True, "message": f"PS:{pid}"}
    assert fake_worker == ["separate", "transcribe", "analyze", "align", "translate", "sing_auto", "embed"]
    with open(phrased_wav, "rb") as fh:
        r = client.post("/api/watermark/detect", files={"file": ("x.wav", fh, "audio/wav")}).json()
    assert r == {"detected": True, "confidence": 0.97, "message": "PS:abc", "mode": "live"}
