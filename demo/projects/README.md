# Projets partagés

Pour partager un projet qui a bien marché avec toute l'équipe :

```bash
cp -r backend/data/<id> demo/projects/
git add demo/projects/<id>
git commit -m "Projet de démo : <titre>"
git push origin dev
```

Au prochain `./start.sh`, chaque projet de ce dossier est copié dans `backend/data/` (s'il n'y est pas déjà) et apparaît dans l'accueil.
Garder des extraits courts (15 à 45 s) : chaque projet pèse quelques Mo.
