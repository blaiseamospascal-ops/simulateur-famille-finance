# Publier sur GitHub et GitHub Pages

Ce dossier ne contient aucune donnée personnelle : seul un exemple fictif est livré.
Les profils personnels (`profil-*.json`, `private/`, `*.perso.html`) sont exclus par `.gitignore`.

## Avec le site GitHub (sans ligne de commande)

1. Sur github.com, créez un dépôt **simulateur-famille** (public), sans README.
2. Dans le dépôt vide, cliquez « uploading an existing file » et glissez **le contenu** de ce dossier
   (y compris le dossier `.github`). Validez avec « Commit changes ».
   Astuce Windows : le dossier `.github` est parfois masqué ; s'il n'apparaît pas, utilisez GitHub Desktop.
3. Settings → Pages → Source : **GitHub Actions**.
4. Onglet Actions : le workflow « Publier sur GitHub Pages » tourne (tests puis build, 1 à 2 min).
5. Le site est en ligne à `https://<votre-compte>.github.io/simulateur-famille/`.

## Avec git

```bash
cd simulateur-famille
git init -b main
git add .
git commit -m "Simulateur famille"
git remote add origin https://github.com/<votre-compte>/simulateur-famille.git
git push -u origin main
```

Puis Settings → Pages → Source : **GitHub Actions**.

## Travailler en local

Installer Node.js 22 (nodejs.org), puis :

```bash
npm install
npm run dev     # aperçu sur http://localhost:5173
npm test        # tests
npm run build   # dist/index.html, un seul fichier autonome
```

## Licence

Ajoutez un fichier LICENSE avant de publier (AGPL-3.0 recommandée : « Add file → Create new file »,
nommez-le LICENSE, GitHub propose alors un modèle).
