"""Tests de l'API en mode démo (sans worker GPU)."""
import time

import pytest

STEPS = ("separate", "transcribe", "align", "translate", "sing", "finalize")


def _create(client, wav, consent="true", **extra):
    data = {"title": "Refrain démo", "artist": "Test", "source_lang": "fon",
            "target_lang": "eng", "consent": consent, **extra}
    with open(wav, "rb") as fh:
        return client.post("/api/projects", data=data, files={"file": ("chant.wav", fh, "audio/wav")})


def _wait(client, pid, step, timeout=60.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        p = client.get(f"/api/projects/{pid}").json()
        if p["steps"][step]["status"] in ("done", "error"):
            return p
        time.sleep(0.1)
    raise AssertionError(f"étape {step} jamais terminée")


def _run(client, pid, step, body=None):
    r = client.post(f"/api/projects/{pid}/steps/{step}", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["steps"][step]["status"] in ("running", "done")
    return _wait(client, pid, step)


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["mode"] == "demo" and r["worker"] is False
    assert "provider" in r["llm"]


def test_refus_sans_consentement(client, sine_wav):
    r = _create(client, sine_wav, consent="false")
    assert r.status_code == 400
    assert "Consentement" in r.json()["detail"]


def test_creation_projet(client, sine_wav):
    r = _create(client, sine_wav)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["consent"] is True and p["mode"] == "demo"
    assert abs(p["duration"] - 3.0) < 0.1
    assert p["files"]["original"] == f"/files/{p['id']}/original.wav"
    assert set(p["steps"]) == set(STEPS)
    assert all(s["status"] == "pending" for s in p["steps"].values())
    f = client.get(p["files"]["original"])
    assert f.status_code == 200 and f.headers["content-type"] == "audio/wav"
    assert any(x["id"] == p["id"] for x in client.get("/api/projects").json())


def test_pipeline_demo_complet(client, phrased_wav, sine_wav):
    pid = _create(client, phrased_wav).json()["id"]

    p = _run(client, pid, "separate")
    assert p["steps"]["separate"]["status"] == "done", p["steps"]["separate"]
    assert p["files"]["vocals"] and p["files"]["instrumental"]

    p = _run(client, pid, "transcribe")
    assert p["steps"]["transcribe"]["status"] == "done", p["steps"]["transcribe"]
    assert 1 <= len(p["lines"]) <= 12
    assert all(l["text"] == "" for l in p["lines"])

    # align sans texte : erreur claire
    p = _run(client, pid, "align")
    assert p["steps"]["align"]["status"] == "error"

    lines = [{"index": l["index"], "text": "Mɛ ɖé ɖo wɛ nyi mi", "meaning": "Mon amour est ici"}
             for l in p["lines"]]
    r = client.put(f"/api/projects/{pid}/lines", json={"lines": lines})
    assert r.status_code == 200
    assert all(l["n_syllables"] > 0 for l in r.json()["lines"])

    p = _run(client, pid, "align")
    assert p["steps"]["align"]["status"] == "done", p["steps"]["align"]
    for l in p["lines"]:
        assert l["n_syllables"] == len(l["syllables"]) > 0
        assert 1 <= len(l["stress_positions"]) <= l["n_syllables"]
        assert l["syllables"][0]["start"] == pytest.approx(l["start"], abs=0.01)
        assert l["syllables"][-1]["end"] == pytest.approx(l["end"], abs=0.01)
    assert p["pitch"] is None

    p = _run(client, pid, "translate", {"n_variants": 3})
    assert p["steps"]["translate"]["status"] == "done", p["steps"]["translate"]
    for l in p["lines"]:
        assert l["variants"] and {"text", "syllables", "split", "ok"} <= set(l["variants"][0])

    choices = [{"index": l["index"], "text": l["variants"][0]["text"]} for l in p["lines"]]
    r = client.put(f"/api/projects/{pid}/choices", json={"choices": choices})
    assert r.status_code == 200
    assert all(l["chosen"] for l in r.json()["lines"])

    # sing auto en démo : erreur "worker GPU"
    p = _run(client, pid, "sing", {"mode": "auto"})
    assert p["steps"]["sing"]["status"] == "error"
    assert "worker GPU" in p["steps"]["sing"]["message"]

    # sing studio sans guide : erreur, puis avec guide : ok
    p = _run(client, pid, "sing", {"mode": "studio"})
    assert p["steps"]["sing"]["status"] == "error"
    with open(sine_wav, "rb") as fh:
        r = client.post(f"/api/projects/{pid}/guide", files={"file": ("guide.wav", fh, "audio/wav")})
    assert r.status_code == 200 and r.json()["files"]["guide"]
    p = _run(client, pid, "sing", {"mode": "studio"})
    assert p["steps"]["sing"]["status"] == "done", p["steps"]["sing"]
    assert p["files"]["sung"]

    p = _run(client, pid, "finalize")
    assert p["steps"]["finalize"]["status"] == "done", p["steps"]["finalize"]
    assert p["files"]["final"] == f"/files/{pid}/final.wav"
    assert p["watermark"]["applied"] is False
    assert client.get(f"/files/{pid}/final.mp3").status_code == 200
    assert client.get(f"/files/{pid}/project.json").status_code == 404

    assert client.delete(f"/api/projects/{pid}").json() == {"ok": True}
    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_etape_inconnue(client, sine_wav):
    pid = _create(client, sine_wav).json()["id"]
    assert client.post(f"/api/projects/{pid}/steps/mix").status_code == 404


def test_syllables(client):
    r = client.post("/api/syllables", json={"text": "bonjour mon amour", "lang": "fra"})
    assert r.status_code == 200
    j = r.json()
    assert j["count"] == len(j["split"]) and j["count"] >= 4


def test_adapt(client):
    r = client.post("/api/adapt", json={"meaning": "Mon amour, tu es ma lumière", "target_lang": "eng",
                                         "n_syllables": 6, "stress_positions": [0, 3], "n_variants": 3})
    assert r.status_code == 200, r.text
    v = r.json()["variants"]
    assert 1 <= len(v) <= 3
    assert all({"text", "syllables", "split", "ok"} <= set(x) for x in v)


def test_adapt_invalide(client):
    r = client.post("/api/adapt", json={"meaning": "", "target_lang": "eng", "n_syllables": 6})
    assert r.status_code == 400


def test_watermark_detect_demo(client, sine_wav):
    with open(sine_wav, "rb") as fh:
        r = client.post("/api/watermark/detect", files={"file": ("x.wav", fh, "audio/wav")})
    j = r.json()
    assert j["detected"] is False and j["confidence"] == 0 and j["message"] is None and j["mode"] == "demo"
