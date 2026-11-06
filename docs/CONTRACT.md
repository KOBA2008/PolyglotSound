# PolyglotSound : contrat technique commun

Hackathon SIMA x Epitech, 6-7 novembre 2026, Team BLACKYY.
Ce document est la source de vérité partagée par les 4 chantiers. Ne pas le modifier sans prévenir.

## Le produit

Un artiste dépose un morceau (idéalement un refrain de 15-40 s) chanté en fon (ou yorùbá).
PolyglotSound produit une version chantée dans une autre langue (anglais ou français), avec le même
nombre de syllabes par ligne, les accents sur les temps forts, la voix de l'artiste, sur l'instrumentale
d'origine, avec un filigrane audio AudioSeal. L'artiste valide chaque étape.

## Architecture

```
frontend/  React + Vite + TypeScript + Tailwind   port 5173 (proxy /api et /files vers 8000)
backend/   FastAPI, Python 3.12, LÉGER (pas de torch) port 8000
worker/    FastAPI GPU (Colab/Kaggle), tous les modèles lourds, port 9000, exposé par tunnel cloudflared
```

Contraintes machine du développeur : pas de GPU, 6.8 Go RAM, réseau lent, disque presque plein.
Donc : le backend ne doit JAMAIS importer torch/transformers. Tout modèle lourd est dans le worker.
Le backend fonctionne en **mode démo** (`WORKER_URL` absent ou injoignable) avec des solutions de repli
basées sur ffmpeg + numpy, pour que le frontend soit toujours démontrable.

Variables d'environnement backend :
- `WORKER_URL` (ex: https://xxx.trycloudflare.com) ; absent = mode démo
- `LLM_PROVIDER` = `groq` | `anthropic` | `ollama` | `rule` | `auto` (défaut `auto` : groq si GROQ_API_KEY, sinon anthropic si ANTHROPIC_API_KEY, sinon rule)
- `GROQ_API_KEY`, `GROQ_MODEL` (défaut `llama-3.3-70b-versatile`), `ANTHROPIC_API_KEY`, `OLLAMA_URL`
- `DATA_DIR` (défaut `backend/data`)

## Modèle de données : Project (JSON renvoyé par le backend)

```jsonc
{
  "id": "a1b2c3",
  "title": "Refrain démo",
  "artist": "Nom de l'artiste",
  "source_lang": "fon",          // fon | yor | fra | eng
  "target_lang": "eng",          // eng | fra | fon
  "consent": true,               // l'artiste certifie être le titulaire de la voix
  "created_at": "2026-11-06T10:00:00Z",
  "mode": "demo",                // demo | live (live = worker utilisé)
  "duration": 24.3,
  "files": {                     // URLs relatives servies par le backend, null si absent
    "original": "/files/a1b2c3/original.wav",
    "vocals": null, "instrumental": null, "guide": null,
    "sung": null, "final": null
  },
  "lines": [
    {
      "index": 0,
      "text": "texte en langue source",        // corrigeable par l'artiste
      "meaning": "sens en français",            // corrigeable, prérempli par NLLB si worker
      "start": 1.20, "end": 4.80,               // secondes
      "syllables": [ {"text":"ma","start":1.2,"end":1.5,"stress":true} ],
      "n_syllables": 8,
      "stress_positions": [0, 3, 6],            // indices de syllabes accentuées (0-based)
      "variants": [ {"text":"...", "syllables":8, "split":["Ma","ma","..."], "ok":true} ],
      "chosen": "texte cible choisi ou null"
    }
  ],
  "pitch": { "hop": 0.01, "f0": [0.0, 220.5, ...] },   // courbe de mélodie de la voix (Hz, 0 = silence), optionnel
  "steps": {                     // une entrée par étape
    "separate":   {"status":"pending","message":"","progress":0},
    "transcribe": {"status":"pending","message":"","progress":0},
    "align":      {"status":"pending","message":"","progress":0},
    "translate":  {"status":"pending","message":"","progress":0},
    "sing":       {"status":"pending","message":"","progress":0},
    "finalize":   {"status":"pending","message":"","progress":0}
  },
  "watermark": {"applied": false, "message": null}
}
```
`status` ∈ `pending | running | done | error`. `progress` 0..100.

## API backend (préfixe /api) : consommée par le frontend

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| GET | /api/health | | `{status:"ok", mode:"demo"\|"live", worker:bool, llm:{provider,model}}` |
| GET | /api/projects | | `Project[]` |
| POST | /api/projects | multipart : `file` (audio), `title`, `artist`, `source_lang`, `target_lang`, `consent` ("true") | `Project` (refus 400 si consent != true) |
| GET | /api/projects/{id} | | `Project` |
| DELETE | /api/projects/{id} | | `{ok:true}` |
| POST | /api/projects/{id}/steps/{step} | JSON optionnel (voir ci-dessous) | `Project` (étape lancée en tâche de fond, status=running) |
| PUT | /api/projects/{id}/lines | `{lines:[{index,text,meaning}]}` | `Project` (correction artiste, étape 3) ; recalcule n_syllables |
| PUT | /api/projects/{id}/choices | `{choices:[{index, text}]}` | `Project` (choix artiste, étape 8) |
| POST | /api/projects/{id}/guide | multipart `file` (voix guide chantée) | `Project` |
| POST | /api/adapt | `{text?, meaning, target_lang, n_syllables, stress_positions?:[], n_variants?:3}` | `{variants:[Variant]}` (démo live jury) |
| POST | /api/syllables | `{text, lang}` | `{count, split:[str]}` |
| POST | /api/watermark/detect | multipart `file` | `{detected:bool, confidence:float, message:str\|null, mode}` |
| GET | /files/{id}/{name} | | fichier audio |

Étapes (`{step}`) et corps :
- `separate` : sépare voix / instrumentale. Démo : vocals = original mono, instrumental = annulation de phase (L-R) via ffmpeg.
- `transcribe` : découpe la voix en lignes (silences) + texte. Démo : lignes détectées par énergie, `text` vide (l'artiste tape), message explicite.
- `align` : syllabes horodatées + stress + courbe f0. Démo : syllabes réparties uniformément sur la ligne à partir du texte saisi (moteur de syllabes), stress sur les syllabes de plus forte énergie, f0 absent.
- `translate` : corps `{n_variants?:3}`. Remplit `meaning` via worker NLLB si vide, puis 3 variantes par ligne via le moteur lyrics (LLM + contrainte de syllabes).
- `sing` : corps `{mode:"studio"|"auto"}`. Studio = voix guide + Seed-VC (worker). Auto = TTS + durées + f0 imposés + Seed-VC (worker). Démo : TTS indisponible -> en studio, guide utilisée telle quelle ; en auto, message d'erreur clair "worker GPU requis".
- `finalize` : filigrane AudioSeal (worker) + mixage ffmpeg voix chantée + instrumentale -> `final.wav` (+ `final.mp3`). Démo : mixage seul, `watermark.applied=false`.

Erreurs : HTTP 4xx/5xx avec `{detail: "message en français"}`.

## Moteur lyrics (backend/app/lyrics/) : interface Python

```python
from app.lyrics import count_syllables, split_syllables, adapt_line, llm_info

count_syllables(text: str, lang: str) -> int            # lang: fon|yor|fra|eng
split_syllables(text: str, lang: str) -> list[str]
async def adapt_line(meaning: str, target_lang: str, n_syllables: int,
                     stress_positions: list[int] | None = None, source_text: str = "",
                     n_variants: int = 3, context: str = "") -> list[dict]
    # chaque dict : {"text": str, "syllables": int, "split": list[str], "ok": bool}
    # boucle : génère, compte, régénère les lignes fausses (max ~4 tours), trie ok d'abord
def llm_info() -> dict   # {"provider": str, "model": str|None}
```

## API worker GPU (port 9000) : appelée par le backend

Audio en entrée : multipart `file`. Audio en sortie : JSON avec champ base64 WAV (`*_b64`).
Toutes les routes renvoient `{detail}` en cas d'erreur. Auth optionnelle : header `X-Worker-Token` = env `WORKER_TOKEN`.

| Route | Entrée | Sortie |
|---|---|---|
| GET /health | | `{ok, device, models_loaded:[...]}` |
| POST /separate | file | `{vocals_b64, instrumental_b64, sr}` (Demucs htdemucs) |
| POST /transcribe | file (voix), form `lang` (fon\|yor\|fra\|eng) | `{segments:[{text,start,end}]}` (MMS-1b-all + découpe silences) |
| POST /align | file (voix), form `lines` (JSON `[{text,start,end}]`), form `lang` | `{lines:[{words:[{text,start,end}]}]}` (torchaudio MMS_FA + uroman) |
| POST /analyze | file (voix) | `{hop, f0:[...], onsets:[...], energy:[...]}` (RMVPE ou torchcrepe/pyin) |
| POST /translate | JSON `{texts:[str], src, tgt}` | `{texts:[str]}` (NLLB-200 distilled 600M, codes fon_Latn yor_Latn fra_Latn eng_Latn) |
| POST /tts | JSON `{text, lang}` | `{audio_b64, sr}` (MMS-TTS facebook/mms-tts-{eng,fra,fon,yor}) |
| POST /sing_auto | file `reference` (voix artiste), form `plan` JSON `{lang, lines:[{text, start, end, syllables:[{start,end}]}], hop, f0:[...], total_duration}` | `{audio_b64, sr}` : TTS par ligne, étirement aux durées, f0 imposé (pyworld), puis Seed-VC |
| POST /convert | file `source` (voix guide), file `reference` (voix artiste) | `{audio_b64, sr}` (Seed-VC mode chant, f0 conditionné) |
| POST /watermark/embed | file, form `message` (str court) | `{audio_b64, sr}` (AudioSeal 16 bits) |
| POST /watermark/detect | file | `{detected, confidence, message}` |

## Identité visuelle (frontend)

Reprend le dossier PDF : fond nuit `#0f0b1f`, violet `#6d28d9`, magenta `#d6249f`, orange `#f97316`,
cyan `#0ea5c6`, lime `#a3e635`. Titres Montserrat ExtraBold, texte Inter. Interface en français.
Pas de tirets cadratins dans les textes de l'interface.
