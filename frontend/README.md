# PolyglotSound : frontend

Vite + React 19 + TypeScript + Tailwind v4 + react-router-dom. Interface en français.
Code contre le contrat `docs/CONTRACT.md` (types dans `src/types.ts`, client dans `src/api.ts`).

## Installation

```bash
cd frontend
npm install
```

## Développement

```bash
npm run dev            # http://localhost:5173
```

Le serveur de dev relaie `/api` et `/files` vers le backend sur `http://localhost:8000`
(lancez `backend/run.sh`). Autre port : `BACKEND_URL=http://localhost:8001 npm run dev`.
Backend éteint : une bannière rouge s'affiche en haut de page.

## Build

```bash
npm run build          # vérification TypeScript puis build dans dist/
npm run preview        # sert dist/ (sans proxy : à réserver au contrôle visuel)
```

## Écrans

- `/` accueil, état démo/live et liste des projets
- `/projet/nouveau` puis `/projet/:id?etape=N` studio en 7 étapes (dépôt, séparation, transcription, grille musicale, traduction, chant, final)
- `/atelier` atelier jury : adapter une phrase en direct
- `/verifier` vérificateur de filigrane AudioSeal
