# Journal du projet PolyglotSound

Team BLACKYY : NONDICHAO Nabil, KOBA David, SOULEMANE Khaled, CHITOU Haamdane.
Hackathon IA & Musique 2026, SIMA × Epitech Bénin, 6 et 7 novembre 2026, Epitech Bénin (Mezzanine), Cotonou.

Ce document résume toutes les discussions, décisions et textes produits pendant la préparation et le hackathon.
La liste des tâches restantes est dans [TODO.md](TODO.md).

---

## 1. Le hackathon

Trois axes proposés :
- Axe 1 : droits d'auteur et protection des œuvres
- Axe 2 : traçabilité et identification des œuvres musicales
- Axe 3 : intelligence artificielle et musique

Inscription close le 02/11/2026. **Candidature acceptée le 04/11/2026** sous le nom PolyglotSound.
Chaque membre a confirmé sa présence par mail (accueil 9h00, apporter ordinateur, chargeur, pièce d'identité, carte d'étudiant).

## 2. Premières idées étudiées (avant le choix)

| Idée | Axe | Principe |
|---|---|---|
| PreuvSon | 1 | certificat d'antériorité d'une maquette envoyée par WhatsApp (hash + empreinte + PDF avec QR code) |
| ContratClair | 1 | photo d'un contrat de label, explication simple en français ou en fon, clauses abusives signalées |
| RadioTrace | 2 | écoute des radios, reconnaissance des titres diffusés, rapports pour la répartition des droits |
| SplitBénin | 2 | registre des parts entre auteur, compositeur, beatmaker, featuring, validé par OTP |
| VoixVraie | 3 | détecteur de voix clonée par IA |
| Rythmes du Patrimoine | 3 | reconnaissance des rythmes traditionnels, licence de sample, part reversée aux communautés |
| Musique accessible aux sourds | 3 | vibrations, visuels, paroles en langue des signes |

## 3. Le projet retenu pour la candidature : PolyglotSound

Slogan : « Transcende les langues, conserve l'âme : la musique béninoise et africaine sans frontières. »

Principe : une chanson en fon ou en yorùbá est adaptée dans une autre langue **qui se chante** (même nombre de syllabes,
accents sur les temps forts), interprétée avec la voix de l'artiste sur l'instrumentale d'origine.

### Pièges techniques identifiés dans le document initial et corrections

| Piège | Correction retenue |
|---|---|
| Whisper ne prend pas en charge le fon | Meta MMS-1b-all ou Omnilingual ASR (fon et yorùbá pris en charge) + correction par l'artiste |
| GPT-4o traduit mal le fon | NLLB-200 de Meta (fon_Latn, yor_Latn) pour le sens, puis LLM pour la forme |
| ElevenLabs et XTTS parlent, ils ne chantent pas | conversion de voix chantée Seed-VC (ou RVC) à partir d'une voix guide chantée, ou TTS avec mélodie imposée (Mode Auto) |
| Clonage de voix = risque pour les droits | consentement vérifié, validation humaine à chaque étape, filigrane AudioSeal sur chaque version |
| Morceaux traditionnels difficiles à séparer | démo sur un refrain moderne, avec l'accord de l'artiste |

### Chaîne technique (11 étapes)

1. Demucs v4 (Meta) : séparation voix et instrumentale
2. MMS-1b-all / Omnilingual ASR (Meta) : transcription fon ou yorùbá
3. Correction par l'artiste
4. MMS_FA (Meta) : calage des syllabes
5. librosa + RMVPE : grille musicale (syllabes, durées, temps forts, mélodie)
6. NLLB-200 (Meta) : traduction du sens
7. LLM + compteur de syllabes : adaptation chantable, 3 variantes
8. Choix de l'artiste
9. Chant : Mode Studio (voix guide + Seed-VC) ou Mode Auto (TTS + durées et mélodie imposées + Seed-VC)
10. AudioSeal (Meta) : filigrane
11. Mixage FFmpeg

### Dossier de candidature

PDF de 11 pages (hors dépôt, sur le PC de David) : `~/Documents/PolyglotSound_SIMA2026/`.
Contenu : couverture, projet en une page, problème, solution et parcours artiste, architecture, innovations,
droits et éthique, stack technique, bénéficiaires et modèle économique, démo et plan 48 h, équipe.

### Textes envoyés dans le formulaire

**Axe principal :** Axe 3 - Intelligence artificielle et musique

**Nom du projet :** PolyglotSound

**Brève description :**
> Les chansons en fon, en yorùbá et dans d'autres langues africaines circulent aujourd'hui dans le monde entier, mais leurs paroles restent incomprises hors de leur zone, et une grande partie du message, de l'humour et des proverbes qu'elles portent se perd. Une traduction mot à mot ou un doublage casse le rythme, les rimes et la mélodie, tandis qu'une vraie adaptation, qui demande un parolier bilingue et un studio, coûte trop cher pour la plupart des artistes indépendants. De plus, les outils grand public de transcription et de traduction ne prennent pas correctement en charge des langues comme le fon. PolyglotSound est un adaptateur musical intelligent qui répond à ce problème en plusieurs étapes. Il sépare d'abord la voix de l'instrumentale, puis transcrit les paroles en fon ou en yorùbá grâce aux modèles open source de Meta (MMS, NLLB), qui prennent en charge nos langues. Il extrait la grille musicale de chaque ligne (nombre de syllabes, durée des notes, temps forts), puis une IA réécrit les paroles dans la langue cible en respectant exactement cette grille, pour que la traduction se chante naturellement. La nouvelle version est ensuite chantée avec la voix de l'artiste, sur la mélodie et l'instrumentale d'origine. Le sens inverse est aussi possible, pour adapter un titre étranger en fon. L'artiste garde le contrôle à chaque étape : il corrige la transcription, choisit la traduction parmi plusieurs propositions et valide le rendu final. Lui seul peut utiliser sa voix, et chaque version porte un filigrane audio inaudible qui protège ses droits et permet d'en tracer l'origine. Le projet s'adresse aux artistes béninois et africains, en particulier indépendants, aux labels, producteurs et distributeurs qui veulent conquérir de nouveaux marchés, à la diaspora qui veut comprendre les chansons de ses origines, et aux publics étrangers curieux de la musique africaine.

**Pourquoi participer (version déclarant un prototype partiel) :**
> Nous sommes quatre étudiants de SCITI passionnés par l'intelligence artificielle et attachés à la culture béninoise, et ce hackathon réunit exactement ce qui nous motive : mettre la technologie au service de notre patrimoine. Nous avons grandi avec une musique riche, portée par des langues comme le fon et le yorùbá, et nous constatons que son message ne dépasse pas toujours nos frontières, faute d'outils adaptés à nos langues. Nous avons déjà développé un prototype partiel de PolyglotSound, avec les premières briques de notre chaîne de traitement, et ce hackathon est pour nous l'occasion idéale de le faire passer à une version complète et démontrable, grâce à 48 heures de travail intensif et à l'accompagnement des mentors. C'est aussi une chance unique d'échanger avec les professionnels de l'industrie musicale réunis par le SIMA, de confronter notre solution à leurs besoins réels, notamment sur la protection des droits des artistes, et de l'améliorer à partir de leurs retours. Enfin, nous voulons montrer que des étudiants béninois peuvent concevoir des solutions d'IA de pointe, pensées pour nos langues et nos artistes, et contribuer à faire rayonner la musique africaine dans le monde sans qu'elle perde son âme.

## 4. Le prototype construit (6 novembre)

Voir [CONTRACT.md](CONTRACT.md) pour l'API complète et le [README](../README.md) pour le lancement.

| Partie | Contenu | État |
|---|---|---|
| `frontend/` | React + Vite + Tailwind : accueil, studio en 7 écrans, atelier jury, vérificateur de filigrane | fait, build OK |
| `backend/` | FastAPI sans torch : projets, 6 étapes, mode démo sans GPU, mixage ffmpeg, extrait limité à 45 s | fait, 46 tests OK |
| `backend/app/lyrics/` | compteur de syllabes fon, yorùbá, français, anglais + boucle LLM sous contrainte | fait |
| `worker/` | serveur GPU Colab : Demucs, MMS, MMS_FA, NLLB, MMS-TTS, Seed-VC, AudioSeal + notebook + tunnel cloudflared | écrit, **jamais exécuté** |

Lancement local : `./start.sh` (arrêt : `./start.sh stop`), puis http://localhost:5173.

### Constats techniques importants

- **Le PC de développement n'a pas de GPU** (6,8 Go de RAM, réseau lent) : tous les modèles lourds tournent sur Colab (GPU T4).
- **Groq ne propose plus de Llama de chat** (`llama-3.3-70b-versatile` renvoie « model not found »). Le moteur utilise `openai/gpt-oss-120b`
  (reasoning_effort low), avec repli sur `openai/gpt-oss-20b`.
- **Palier gratuit Groq : 8 000 jetons par minute.** Gestion du 429 (attente puis changement de modèle), 2 lignes traduites en parallèle.
  Test : 6 lignes sur 6 au bon nombre de syllabes en 34 s.
- La clé Anthropic présente sur la machine est invalide (401).
- **Le tunnel Cloudflare coupe les requêtes après environ 100 s** : on travaille sur des refrains de 15 à 40 s.
- Le pitch ne doit plus dire « Llama via Groq » : dire « 6 modèles Meta + un LLM open source ».

### Exemples d'adaptation obtenus (anglais, 6 syllabes)

| Sens | Adaptation |
|---|---|
| Mon cœur danse au rythme du tambour | My heart beats like a drum |
| Les anciens nous regardent | Old eyes are watching us |
| Nous chantons pour ne pas oublier | We sing to hold the past |
| Demain sera plus beau | Tomorrow's gonna shine |

## 5. Remise en question du projet (7 novembre)

Constat de l'équipe : PolyglotSound seul n'a pas d'impact assez direct pour l'Afrique et le Bénin, et doit être **vendable**
(un artiste ou un investisseur doit pouvoir y croire et l'acheter).

Problème de fond identifié : **la musique africaine est écoutée partout mais rapporte peu à ceux qui la créent.**
Les diffusions (radios, télés, maquis, bars, hôtels, événements) ne sont pas suivies et la répartition des droits se fait sur des estimations.
D'après la CISAC, l'Afrique pèse moins de 1 % des droits d'auteur collectés dans le monde (chiffre à vérifier dans le dernier rapport avant de le citer).

### Nouvelles propositions étudiées

| Projet | Principe | Qui paie | Faisable le jour 2 |
|---|---|---|---|
| **ÉCOUTE** | Shazam des droits d'auteur : empreinte audio, reconnaissance des diffusions en radio et maquis, tableau de bord | organismes de droits, radios, labels | oui (CPU) |
| **AMBIANCE** | playlists africaines sous licence pour hôtels, bars, maquis, commerces, déclaration automatique | commerces (abonnement) | oui |
| **SYNCAFRIK** | catalogue de musique africaine pour pubs, films, créateurs, recherche en langage naturel | commission sur les licences | oui |
| **PROMOKIT** | kit promo automatique : extrait TikTok, vidéo de paroles, pochette, bio | artistes (crédits), labels | oui |
| **RYTHMES VIVANTS** | banque de sons traditionnels, part reversée aux communautés | beatmakers, producteurs, ONG | oui |
| **SPLITPAY** | répartition entre co-auteurs signée par OTP, paiement Mobile Money | commission 2 à 5 % | oui (peu d'IA) |
| **VOIXVRAIE** | certification des vraies voix contre les deepfakes (AudioSeal) | artistes, plateformes | partiel |
| **AVANCE** | avance de fonds sur revenus futurs | frais sur avance | difficile |
| **RADAR A&R** | détection des talents émergents | labels | difficile (données) |

### Proposition en cours de validation : PolyglotSound plateforme (ÉCOUTE + AMBIANCE + POLYGLOT)

> **PolyglotSound : la plateforme qui fait voyager, diffuser et payer la musique africaine.**

| Brique | Rôle |
|---|---|
| POLYGLOT | **Créer** : versions anglaise et française chantées par la voix de l'artiste (déjà construit) |
| AMBIANCE | **Diffuser** : playlists légales pour hôtels, bars, maquis |
| ÉCOUTE | **Suivre et payer** : reconnaissance automatique de chaque diffusion, répartition |

Cercle vertueux : enregistrer (empreinte + filigrane + ayants droit) → version anglaise (POLYGLOT, option premium) →
diffusion dans les lieux (AMBIANCE) → reconnaissance (ÉCOUTE) → tableau de bord et répartition.

Lien clé : un hôtel de Cotonou accueille des clients internationaux, AMBIANCE leur diffuse des tubes béninois en version anglaise
créée par POLYGLOT, et ÉCOUTE prouve chaque diffusion pour payer l'artiste.

Revenus :
- commerces : abonnement AMBIANCE (ordre de grandeur 5 000 à 25 000 FCFA par mois, à valider)
- organismes de droits et radios : licence ÉCOUTE
- artistes et labels : tableau de bord gratuit, POLYGLOT premium

Scénario de démo (3 min) : enregistrer un titre → montrer la version anglaise → lancer la playlist d'un hôtel →
un téléphone reconnaît le morceau en direct (+1 diffusion) → tableau de bord artiste (diffusions, lieux, droits estimés).

**Décision en attente :** validation par l'équipe et heure de passage devant le jury.
