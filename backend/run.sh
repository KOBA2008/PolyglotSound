#!/usr/bin/env bash
# Lance le backend PolyglotSound sur le port 8000 (mode démo si WORKER_URL absent).
set -euo pipefail
cd "$(dirname "$0")"
# Charge backend/.env si présent (GROQ_API_KEY, WORKER_URL, WORKER_TOKEN...)
if [ -f .env ]; then set -a; . ./.env; set +a; fi
exec .venv/bin/python -m uvicorn app.main:app --reload --port "${PORT:-8000}" --host "${HOST:-127.0.0.1}"
