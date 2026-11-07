# Reste à faire

Mis à jour le 7 novembre 2026 (jour 2 du hackathon). Contexte complet : [JOURNAL.md](JOURNAL.md).

## 0. Décisions à prendre tout de suite

- [ ] Valider en équipe la version croisée **PolyglotSound plateforme (ÉCOUTE + AMBIANCE + POLYGLOT)**, ou garder PolyglotSound seul
- [ ] Noter l'**heure de passage devant le jury** pour calibrer ce qu'on construit
- [ ] Répartir les rôles (qui code quoi, qui prépare le pitch, qui fait la démo)

## 1. Si on part sur la plateforme croisée

Priorité absolue si le temps est court : **ÉCOUTE + tableau de bord**. AMBIANCE et POLYGLOT peuvent rester en écrans de démonstration.

### ÉCOUTE (cœur de la démo, environ 4 à 5 h)
- [ ] Empreinte audio sur CPU (spectrogramme, pics, hachage façon Shazam) en numpy, dans le backend
- [ ] Enregistrement d'un titre au catalogue : empreinte + filigrane (si worker) + fiche ayants droit
- [ ] Reconnaissance d'un extrait de 5 à 10 s (route API) avec score de confiance
- [ ] Écoute en direct depuis le micro du navigateur (téléphone ou PC) : envoi d'extraits, affichage « Détecté : titre, artiste, +1 diffusion »
- [ ] Journal des diffusions (titre, lieu, date, source : radio, maquis, hôtel)
- [ ] Test de robustesse : reconnaissance d'un morceau joué par un haut-parleur et capté par un téléphone

### Tableau de bord et registre (environ 2 à 3 h)
- [ ] Catalogue des titres enregistrés
- [ ] Lieux (radios, maquis, hôtels) avec leur type
- [ ] Vue artiste : nombre de diffusions, lieux, carte ou liste des villes, droits estimés en FCFA
- [ ] Vue organisme de droits : répartition par artiste, export CSV

### AMBIANCE (environ 2 à 3 h)
- [ ] Écran « lieu » : choix d'une ambiance (calme, festif, international), lecture d'une playlist du catalogue
- [ ] Déclaration automatique de chaque titre joué dans le journal des diffusions
- [ ] Playlist « internationale » incluant les versions anglaises créées par POLYGLOT

### POLYGLOT
- [ ] Garder le studio existant, l'intégrer comme module « Créer » dans la navigation
- [ ] Une version créée = une nouvelle œuvre enregistrée au catalogue

### Pitch
- [ ] Nouveau deck court (style keynote, environ 20 mots par slide) : problème, solution en 3 briques, démo, modèle économique, équipe
- [ ] Vérifier le chiffre CISAC (part de l'Afrique dans les droits collectés) avant de le citer
- [ ] Préparer les réponses aux questions probables : concurrence (acteurs internationaux de veille de diffusion), coût du boîtier ou du téléphone, adhésion du BUBEDRA, protection des données

## 2. Dans tous les cas

### Worker GPU sur Colab (environ 30 min, une personne)
- [ ] Ouvrir https://colab.research.google.com/github/KOBA2008/PolygotSound-/blob/main/worker/PolyglotSound_Worker.ipynb
- [ ] Activer le GPU T4, définir `WORKER_TOKEN` dans la cellule 2
- [ ] Exécuter les cellules dans l'ordre, signaler toute ligne `ERR` de la cellule 4 (pyworld et Seed-VC sont les points fragiles)
- [ ] Copier l'URL `trycloudflare.com` dans `backend/.env` (`WORKER_URL` et `WORKER_TOKEN`), relancer `./start.sh`
- [ ] Tester les routes dans l'ordre : translate,tts puis separate,analyze puis transcribe,align puis watermark puis convert puis sing_auto

### Données de démo
- [ ] Un vrai refrain en fon (15 à 40 s) avec l'accord de l'artiste, ses paroles écrites et leur sens en français
- [ ] Environ 30 s de la voix de l'artiste a cappella (référence Seed-VC)
- [ ] Pour ÉCOUTE : 5 à 10 titres béninois (avec accord) pour remplir le catalogue

### Tests avant la démo
- [ ] Parcours complet sur le vrai refrain, en mode live
- [ ] Clics réels dans le navigateur : lecture audio, bascule A/B, enregistrement micro, atelier jury
- [ ] **Plan B** : enregistrer une vidéo de la démo et garder les fichiers finaux (final.mp3) au cas où Colab ou le réseau tombe

### Équipe et GitHub
- [ ] Ajouter Nabil, Khaled et Haamdane comme collaborateurs (Settings > Collaborators)
- [ ] Travailler sur `dev`, fusionner dans `main` seulement ce qui est testé

### Sécurité
- [ ] Après le hackathon : révoquer la clé Groq actuelle sur console.groq.com/keys et en créer une nouvelle (elle a circulé dans une conversation)
- [ ] Ne jamais versionner `backend/.env`
