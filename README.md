# PolyglotSound

> Transcende les langues, conserve l'âme : la musique béninoise et africaine sans frontières.

Projet de la **Team BLACKYY** au Hackathon IA & Musique 2026 (SIMA × Epitech Bénin, 6 et 7 novembre 2026).

PolyglotSound adapte une chanson en fon (ou yorùbá) dans une autre langue **qui se chante** : même nombre de syllabes par ligne, accents sur les temps forts, voix de l'artiste, instrumentale d'origine. L'artiste valide chaque étape et chaque version porte un filigrane audio AudioSeal.

## Architecture

| Dossier | Rôle | Port |
|---|---|---|
| `frontend/` | React + Vite + TypeScript + Tailwind : studio de l'artiste, atelier jury, vérificateur de filigrane | 5173 |
| `backend/` | FastAPI léger : projets, étapes, moteur de syllabes et LLM (gpt-oss via Groq), mixage ffmpeg, mode démo sans GPU | 8000 |
| `worker/` | FastAPI GPU (Colab / Kaggle) : Demucs, MMS, MMS_FA, NLLB-200, MMS-TTS, Seed-VC, AudioSeal | 9000 |
| `docs/CONTRACT.md` | Contrat d'API commun | |

## Démarrage rapide

```bash
# Backend
cd backend
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env   # GROQ_API_KEY, WORKER_URL
./run.sh

# Frontend
cd frontend && npm install && npm run dev
```

Ouvrir http://localhost:5173. Sans `WORKER_URL`, l'application tourne en **mode démo**.

## Worker GPU

Ouvrir `worker/PolyglotSound_Worker.ipynb` dans Google Colab (GPU T4), renseigner `REPO_URL` avec l'URL de ce dépôt, tout exécuter, puis copier l'URL `trycloudflare.com` affichée dans `backend/.env` (`WORKER_URL=...`). Détails dans `worker/README.md`.

## Branches

- `main` : version stable pour la démo
- `dev` : développement en cours

## Équipe

Team BLACKYY : NONDICHAO Nabil, KOBA David, SOULEMANE Khaled, CHITOU Haamdane.
