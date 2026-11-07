#!/usr/bin/env bash
# Lance PolyglotSound en local : backend (8000) + frontend (5173).
# Le worker GPU tourne à part sur Colab (voir worker/README.md) ; son URL va dans backend/.env.
# Arrêt : ./start.sh stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.logs"; mkdir -p "$LOGS"

stop() {
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -f "$ROOT/frontend/node_modules/.bin/vite" 2>/dev/null || true
  pkill -f "vite.*--port 5173" 2>/dev/null || true
  sleep 1
}

if [ "${1:-}" = "stop" ]; then stop; echo "PolyglotSound arrêté."; exit 0; fi
stop

[ -f "$ROOT/backend/.env" ] || cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"

# Projets partagés par l'équipe (demo/projects/<id>/project.json + audios) copiés dans backend/data s'ils manquent
DATA="$ROOT/backend/data"; mkdir -p "$DATA"
for d in "$ROOT"/demo/projects/*/; do
  [ -f "$d/project.json" ] || continue
  id="$(basename "$d")"
  [ -d "$DATA/$id" ] || { cp -r "$d" "$DATA/$id"; echo "Projet partagé importé : $id"; }
done

(cd "$ROOT/backend" && setsid ./run.sh > "$LOGS/backend.log" 2>&1 &)
(cd "$ROOT/frontend" && setsid npm run dev -- --port 5173 > "$LOGS/frontend.log" 2>&1 &)

for _ in $(seq 1 30); do
  curl -s -m 2 http://localhost:8000/api/health >/dev/null && curl -s -m 2 -o /dev/null http://localhost:5173 && break
  sleep 1
done

echo "Backend  : http://localhost:8000/api/health"
curl -s -m 3 http://localhost:8000/api/health || echo "(backend injoignable, voir .logs/backend.log)"
echo
echo "Frontend : http://localhost:5173"
echo "Logs     : $LOGS"
