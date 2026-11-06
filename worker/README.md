# PolyglotSound : worker GPU

Serveur FastAPI (port 9000) qui porte tous les modèles lourds. Il tourne sur **Google Colab (T4)**
ou **Kaggle (T4)**, exposé au backend par un tunnel `cloudflared` (URL `https://xxxx.trycloudflare.com`).
Spécification des routes : `docs/CONTRACT.md`, section « API worker GPU ».

| Fichier | Rôle |
|---|---|
| `server.py` | l'API (chargement paresseux de chaque modèle, cache, déchargement LRU si la VRAM manque) |
| `seedvc_runner.py` | lance Seed-VC avec des correctifs de compatibilité ; mode démon (modèles gardés en mémoire) ou exécution unique |
| `requirements.txt` | dépendances (sans torch : on garde celui de Colab) |
| `PolyglotSound_Worker.ipynb` | notebook prêt à exécuter de haut en bas |
| `test_client.py` | teste toutes les routes d'un worker distant (bibliothèque standard seulement) |

## Lancer sur Google Colab

1. Ouvrir `PolyglotSound_Worker.ipynb` dans Colab (Fichier > Importer un notebook, ou depuis GitHub).
2. *Exécution > Modifier le type d'exécution > GPU T4*.
3. Cellule 2 : renseigner `REPO_URL` (dépôt GitHub contenant `worker/`) **ou** le laisser vide et
   téléverser `server.py`, `seedvc_runner.py`, `requirements.txt`, `test_client.py` à la cellule 3.
   Optionnel : `WORKER_TOKEN` (même valeur côté backend).
4. Tout exécuter. La cellule 8 affiche en gros `WORKER_URL=https://....trycloudflare.com`.
5. Côté backend : `WORKER_URL=https://....trycloudflare.com` (+ `WORKER_TOKEN`), relancer le backend.
6. Laisser tourner la dernière cellule (maintien en vie). L'URL change à chaque relance du tunnel.

## Lancer sur Kaggle

1. *Create > New Notebook*, puis *File > Import Notebook* avec `PolyglotSound_Worker.ipynb`.
2. *Settings* : **Accelerator = GPU T4 x2** (pas P100 : les torch récents ne gèrent plus cette carte),
   **Internet = On** (vérification du téléphone requise une fois).
3. Code : `REPO_URL` (le plus simple) ou *Add Data > Upload* d'un dataset contenant le dossier `worker/`
   (la cellule 3 copie automatiquement les fichiers trouvés dans `/kaggle/input`).
4. Tout exécuter. Les chemins passent automatiquement de `/content` à `/kaggle/working`.
   Le worker n'utilise qu'un seul GPU (le premier) : le second T4 reste libre.

## En local / autre machine GPU

```bash
pip install -r requirements.txt
pip install --no-deps descript-audiotools==0.7.2 descript-audio-codec==1.0.0
git clone --depth 1 https://github.com/Plachtaa/seed-vc.git ../seed-vc
SEEDVC_DIR=../seed-vc uvicorn server:app --host 0.0.0.0 --port 9000
python3 test_client.py http://localhost:9000
```

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `WORKER_TOKEN` | vide | si défini, header `X-Worker-Token` obligatoire (401 sinon) |
| `SEEDVC_DIR` | auto (`/content/seed-vc`, `/kaggle/working/seed-vc`, `../seed-vc`) | dépôt Seed-VC |
| `SEEDVC_STEPS` | 30 | pas de diffusion (README Seed-VC : 30 à 50 pour le chant ; 10 à 15 pour aller vite) |
| `SEEDVC_RESERVE_GB` | 6 | VRAM libre visée avant Seed-VC (les autres modèles sont déchargés si besoin) |
| `SEEDVC_TIMEOUT` | 1200 | délai max d'une conversion (s) |
| `SEEDVC_MODE` | `daemon` | `daemon` : processus Seed-VC persistant (chargé une fois) ; `subprocess` : un processus par appel |
| `WATERMARK_DB` | `worker/watermark_messages.json` | table message <-> 16 bits |
| `WORKER_FP16_NLLB` | 1 | `0` = NLLB en float32 |

## Routes (rappel) et détails d'implémentation

| Route | Modèle | Notes |
|---|---|---|
| `GET /health` | | `{ok, device, models_loaded, gpu, vram, torch, seedvc_dir}` |
| `POST /separate` | Demucs v4 `htdemucs` | `demucs.pretrained.get_model` + `demucs.apply.apply_model` ; vocals vs somme des 3 autres stems ; stéréo 44.1 kHz |
| `POST /transcribe` | `facebook/mms-1b-all` | 16 kHz mono ; découpe `librosa.effects.split` (top_db 35), fusion si écart < 0.35 s, segments <= 12 s (coupés au minimum d'énergie) ; adaptateur changé seulement si la langue change |
| `POST /align` | `torchaudio.pipelines.MMS_FA` + `uroman` | fenêtre de la ligne +-0.15 s ; romanisation + normalisation du tutoriel torchaudio ; repli Viterbi CTC numpy si `forced_align` manque, puis repli uniforme ; temps absolus ; champ `method` par mot |
| `POST /analyze` | torchcrepe `full` (viterbi) | hop 10 ms, 50 à 1000 Hz, seuil de périodicité 0.21 + silence -60 dB ; repli `librosa.pyin` ; onsets librosa ; RMS |
| `POST /translate` | `facebook/nllb-200-distilled-600M` | `fon/yor/fra/eng` -> `fon_Latn/yor_Latn/fra_Latn/eng_Latn` ; tokenizer créé avec `src_lang`, `forced_bos_token_id` = code cible ; fp16 sur GPU |
| `POST /tts` | `facebook/mms-tts-{eng,fra,fon,yor}` | `VitsModel`, 16 kHz ; graine fixe (sortie reproductible) |
| `POST /convert` | Seed-VC, mode chant | `inference.py --f0-condition True` (modèle `whisper_base_f0_44k`), sortie 44.1 kHz recalée sur la durée de la source ; champs optionnels `diffusion_steps`, `semi_tone_shift`, `auto_f0_adjust` |
| `POST /sing_auto` | MMS-TTS + pyworld + Seed-VC | voir ci-dessous ; champs optionnels `convert` (défaut true), `return_guide`, `diffusion_steps` ; renvoie aussi `warnings` |
| `POST /watermark/embed` | AudioSeal `audioseal_wm_16bits` | message -> 16 bits (sha256 tronqué) ; filigrane calculé à 16 kHz, rééchantillonné et ajouté au signal d'origine (sr et canaux conservés) |
| `POST /watermark/detect` | AudioSeal `audioseal_detector_16bits` | `{detected, confidence, message, bits_hex}` ; `message` = texte si connu, sinon `0x....` |
| `POST /warmup` | tous | hors contrat : charge chaque modèle sur un son synthétique (`models=all` ou liste) |
| `POST /unload` | | hors contrat : libère la VRAM (`models=all` ou liste) |

### Pipeline `/sing_auto` (qualité maquette, robuste)

Pour chaque ligne du plan : TTS MMS dans la langue cible, rognage des silences, découpe grossière en
N syllabes (N = syllabes cibles) aux minima d'énergie + onsets proches des positions idéales,
puis analyse WORLD (harvest, cheaptrick, d4c). Les trames sont rééchantillonnées par une carte de temps
linéaire par morceaux (syllabe TTS i -> fenêtre de la syllabe cible i), la courbe f0 d'origine de la
ligne est imposée (trous comblés en log-f0, lissage 25 ms, transposition par octaves si la médiane sort
de 80 à 800 Hz, `semi_tone_shift` optionnel dans le plan), puis synthèse WORLD. Chaque ligne est
normalisée, fondue (10 ms) et posée sur la timeline (`total_duration`). Enfin Seed-VC avec la voix de
référence. Garde-fous : syllabes absentes ou invalides -> une seule syllabe = la ligne ; ligne vide ou
TTS impossible -> ignorée avec avertissement ; WORLD en échec -> repli librosa (time_stretch +
pitch_shift) ; Seed-VC en échec -> la voix guide est renvoyée avec un avertissement.

## Temps et VRAM estimés (T4 16 Go, environ 15 Go utilisables)

| Modèle | Téléchargement (1re fois) | Chargement (cache chaud) | VRAM estimée |
|---|---|---|---|
| Demucs htdemucs | 80 Mo, ~10 s | 2 s | 0.2 Go poids, 1.5 à 2.5 Go en inférence (segments 7.8 s) |
| MMS-1b-all (fp32) + adaptateur | 3.9 Go, 1 à 3 min | 20 à 40 s ; adaptateur ~1 s | ~4 Go + 0.5 Go |
| MMS_FA (torchaudio) | 1.2 Go, ~1 min | 10 s | ~1.3 Go |
| torchcrepe full | inclus dans le paquet | 1 s | < 0.5 Go |
| NLLB-600M (fp16) | 2.5 Go, ~1 min | 10 à 20 s | ~1.3 Go |
| MMS-TTS (par langue) | 145 Mo | 2 s | ~0.15 Go |
| AudioSeal gen + détecteur | ~100 Mo | 2 s | < 0.2 Go |
| Seed-VC chant (démon) | ~1.5 Go (DiT f0 44k, whisper-small (encodeur fp16), BigVGAN v2 44k, CAMPPlus, RMVPE) | 30 à 60 s au 1er appel (puis résident) | ~2.5 Go résidents, 3 à 5 Go en conversion |

Tout chargé en même temps : environ 9 Go résidents + Seed-VC 3 à 5 Go, soit 12 à 14 Go. Ça tient sur un
T4, mais juste : avant chaque conversion Seed-VC le worker décharge les modèles les moins récemment
utilisés jusqu'à avoir `SEEDVC_RESERVE_GB` libres, et tout modèle est déchargé si la VRAM libre est
inférieure à son estimation au chargement. En cas d'OOM, tout est déchargé et l'erreur invite à relancer.
Warmup complet la première fois : 5 à 12 min (surtout les téléchargements).

Durées indicatives pour un refrain de 30 s : separate 10 à 20 s, transcribe 5 à 10 s, align 3 à 6 s,
analyze 3 s, translate < 2 s, tts < 1 s/ligne, convert 15 à 40 s à 30 pas (+30 à 60 s au tout premier appel),
sing_auto 25 à 60 s.

## Correctifs de compatibilité Seed-VC (`seedvc_runner.py`)

Seed-VC épingle torch 2.4 / transformers 4.46 / numpy 1.26 ; on NE réinstalle PAS ses requirements.
Le runner applique, sans modifier le dépôt cloné :
1. `torchaudio.save` -> soundfile (torchaudio >= 2.9 délègue l'écriture à TorchCodec, souvent absent) ;
2. BigVGAN `_from_pretrained` : `proxies` / `resume_download` rendus optionnels et arguments refusés
   par `hf_hub_download` filtrés (huggingface_hub >= 1.0 ne les passe plus : sinon `TypeError`) ;
3. `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1` (torch >= 2.6 charge en `weights_only=True` par défaut).
`descript-audio-codec` (import `dac`, requis par `modules/length_regulator.py`) dépend de
`descript-audiotools`, qui exige `protobuf<3.20` : les deux sont installés avec `--no-deps`.

## Problèmes connus / à surveiller

* **Seed-VC tourne dans un processus fils persistant** (`seedvc_runner.py --daemon`, journal dans
  `/tmp/seedvc_daemon.log`) : il est compté dans `models_loaded` (`seedvc`) et peut être déchargé par
  `/unload`. S'il plante, le worker repasse automatiquement en exécution unique (plus lente).
* **torchaudio 2.9+** : `forced_align` a été déprécié en 2.8 ; il est toujours présent dans les sources 2.9
  et 2.10 (et `MMS_FA` aussi), mais s'il manque à l'exécution le worker bascule sur son Viterbi numpy.
* **fon / yorùbá** : MMS-1b-all a les adaptateurs `fon` et `yor` (vérifié sur le dépôt HF) mais la
  qualité ASR sur du chant est faible : la transcription sert de brouillon, l'artiste corrige.
* MMS-TTS `fon` / `yor` : vocabulaires avec tons et lettres ɖ ɛ ɔ ẹ ọ ṣ ; les caractères absents du
  vocabulaire sont ignorés silencieusement par le tokenizer ; pas de uroman nécessaire (`is_uroman=false`).
* `pyworld` n'a pas de roue Linux : compilation depuis les sources (gcc + Cython). En cas d'échec,
  `/sing_auto` passe au repli librosa (qualité moindre) et le signale dans `warnings`.
* Session Colab gratuite : coupure après environ 90 min d'inactivité ou 12 h ; garder la dernière
  cellule active. Tout modèle est re-téléchargé à chaque nouvelle session.
* Le tunnel trycloudflare n'a pas de garantie de disponibilité ; requêtes limitées à ~100 s par
  Cloudflare sur les tunnels gratuits : pour un long morceau, `/convert` et `/sing_auto` peuvent
  dépasser. Utiliser des refrains de 15 à 40 s, `diffusion_steps` 10 à 20, et faire un warmup avant.
* La table de filigrane (`watermark_messages.json`) est perdue à la fin de la session Colab : un
  message inconnu est renvoyé sous forme `0x....` (les 16 bits restent détectés).

## Ordre de test conseillé sur Colab

`python3 test_client.py URL --only health,translate,tts` puis `--only separate,analyze` puis
`--only transcribe,align` puis `--only watermark` puis `--only convert` puis `--only sing_auto`
(du moins risqué au plus risqué ; chaque étape télécharge ses poids).
