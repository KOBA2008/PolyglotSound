# PolyglotSound : backend

FastAPI léger (pas de torch), port 8000. Spécification : `../docs/CONTRACT.md`.

## Installation

```bash
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
```
ffmpeg et ffprobe doivent être dans le PATH.

## Lancer

```bash
./run.sh                                   # mode démo (sans worker GPU)
WORKER_URL=https://xxx.trycloudflare.com WORKER_TOKEN=... ./run.sh   # mode live
```
Variables : `WORKER_URL`, `WORKER_TOKEN`, `WORKER_TIMEOUT` (600 s), `WORKER_HEALTH_TTL` (30 s),
`DATA_DIR` (défaut `backend/data`), `LLM_PROVIDER`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_URL`.

## Tests

```bash
.venv/bin/python -m pytest -v
```

## Organisation

- `app/main.py` : application, CORS, gestion des erreurs `{detail}`
- `app/routes.py` : routes `/api` et `/files/{id}/{name}`
- `app/pipeline.py` : une coroutine par étape (separate, transcribe, align, translate, sing, finalize), tâches de fond
- `app/audio.py` : ffmpeg (conversion, phase L-R, mixage, mp3) + énergie RMS numpy, détection des lignes, accents
- `app/worker_client.py` : client httpx du worker GPU, health check en cache
- `app/store.py` : `DATA_DIR/<id>/project.json` + fichiers audio, écriture atomique sous verrou
- `app/lyrics_bridge.py` : importe `app.lyrics`, repli sur `app/lyrics_fallback.py` s'il est absent
