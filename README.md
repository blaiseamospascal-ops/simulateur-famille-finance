# Simulateur famille

Compare deux situations d'un même ménage, année par année : la situation actuelle et un scénario (un enfant de plus, un parent à 4/5, à mi-temps ou à l'arrêt, ou les deux). Le résultat est l'écart de revenu disponible après impôts, cotisations, allocations et coûts de l'enfant.

V1 : Belgique, Wallonie, salariés du privé, barèmes 2026 (réforme IPP du 15 juillet 2026 incluse).

Cinq onglets :

- **Budget et épargne** : revenus calculés (salaires, impôt final, ONEM, allocations) + autres revenus − dépenses réelles (crédits avec date de fin, postes qui tombent quand un parent est à la maison, coupes possibles), dépenses ponctuelles, épargne et placements. Calcule l'épargne nécessaire pour tenir N années et le plafond de dépenses mensuel, pour six variantes (aucune coupe, moitié, budget serré × une ou deux voitures).
- **Mes dépenses** : encodage mensuel des extraits CSV Beobank et CBC (plusieurs fichiers à la fois, doublons ignorés, mois encodés par compte, liste « À vérifier » dont les choix sont mémorisés), puis tableau de bord : revenus réguliers et ponctuels, dépenses utiles et optionnelles, taux et montant du superflu, coût des enfants (direct, part estimée, allocations déduites), dépenses par catégorie et par commerçant, dépenses récurrentes détectées, évolution mois par mois.
- **Comparer des scénarios** : l'écart de revenu disponible, année par année, entre la situation actuelle et jusqu'à quatre scénarios.
- **Relevés bancaires** : import CSV (Beobank, CBC/KBC, format générique, voir FORMATS.md), classement automatique, moyennes mensuelles reportables dans le budget.
- **Profils et données** : plusieurs profils, export/import de fichier, effacement.

## Principes

- **Calculé ou estimé.** Les montants issus de règles publiques (impôt, ONSS, ONEM, allocations familiales, crèche ONE) sont calculés et sourcés. Les coûts de l'enfant sont des hypothèses en fourchette, modifiables.
- **Chaque ligne porte sa fiabilité** : officiel, publié (source secondaire en attendant l'avis officiel), projection, approché, estimé.
- **Rien ne quitte le navigateur.** Pas de serveur, pas de compte, pas de police ni de script externe. Les profils et relevés sont dans le `localStorage` du navigateur ; l'utilisateur les exporte lui-même en fichier JSON. La version autonome interdit toute requête réseau (CSP `connect-src 'none'`).
- **Aucune donnée personnelle dans le code.** La version publique ne livre qu'un exemple fictif (`src/profile.ts`). Une version personnelle se construit avec `PROFIL_PRIVE=chemin/profil.json npm run build` : le fichier reste hors du dépôt (voir `.gitignore`).

## Architecture

```
src/engine/        moteur sans pays : types, boucle année par année, comparaison, budget (budget.ts)
src/import/        lecture des relevés CSV et classement (csv.ts, categories.ts, files.ts), tableau de bord (dashboard.ts)
src/profile.ts     profils, exemple fictif, stockage local, export/import
src/countries/be/  module Belgique-Wallonie : params.ts (barèmes datés et sources), tax.ts (calculs purs), module.ts (année)
src/defaults.ts    hypothèses par défaut (coûts de l'enfant, exemple de ménage)
src/App.svelte     interface
validation/        cas de validation Tax-Calc
tests/             tests Vitest
```

Ajouter un pays : créer `src/countries/<pays>/` qui implémente `CountryModule` (voir `src/engine/types.ts`).

## Commandes

```
npm install
npm run dev      # développement
npm test         # tests (npx vitest run)
npm run build    # dist/index.html, un seul fichier autonome (version publique)
PROFIL_PRIVE=../profils-prives/profil.json npx vite build --outDir dist-perso   # version personnelle
```

## Publication

Voir [PUBLIER.md](PUBLIER.md) : chaque push sur `main` lance les tests, construit le site et le publie sur GitHub Pages (`.github/workflows/pages.yml`).

## Limites connues (V1)

- Allocations ONEM et indemnités de maternité imposées comme un salaire, sans la réduction pour revenus de remplacement.
- Cotisation spéciale de sécurité sociale au barème du ménage, sans le cas des ménages à un seul revenu.
- Supplément social des allocations familiales calculé sur le revenu de l'année (les seuils publiés portent la mention 2024).
- Allocations familiales des enfants nés avant 2020 : suppléments d'âge approximatifs.
- Hors champ : indépendants, fonctionnaires, voiture de société, revenus immobiliers et mobiliers, épargne-pension, garde alternée, Bruxelles et Flandre.

Licence : à choisir (AGPL-3.0 recommandée).
