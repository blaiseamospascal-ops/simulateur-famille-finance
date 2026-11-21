# Relevés bancaires : formats reconnus

Les fichiers sont lus dans le navigateur (`src/import/csv.ts`) et ne sont envoyés nulle part.

## Détection automatique

Le simulateur cherche, dans les 20 premières lignes, une ligne d'en-têtes qui contient une **date** et un **montant** (ou deux colonnes **débit** et **crédit**). Séparateur `;`, `,` ou tabulation ; encodage UTF-8 ou Windows-1252 ; fins de ligne Windows, Unix ou `\r` seul (exports CBC).

| Banque | Export | Vérifié |
| --- | --- | --- |
| Beobank | Historique du compte, CSV | Oui, sur des exports réels (catégories Beobank reprises en dernier recours) |
| CBC / KBC | Extraits, CSV (français ou néerlandais) | Oui, sur des exports réels |
| Belfius, BNP Paribas Fortis, ING, Argenta, Crelan… | CSV | Par les noms de colonnes courants ; à confirmer avec un vrai fichier |

Pour ajouter une banque : ajouter ses noms de colonnes dans `ALIASES` (et, si besoin, un nom de format dans `detect`), puis un test avec un exemple **synthétique** dans `tests/budget-import.test.ts`. Ne jamais committer un vrai relevé.

## Format générique

```
date;libelle;montant;categorie;contrepartie
02/11/2026;Delhaize Bouge;-83,03;Courses;Delhaize
05/11/2026;Allocations familiales;601,53;Revenus;
```

- `date` (obligatoire) : JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ/MM/AA ou AAAA-MM-JJ.
- `montant` (obligatoire) : négatif pour une dépense ; « 1.234,56 », « 1 234,56 » et « 1234.56 » acceptés. Ou `debit` et `credit`.
- `libelle` : conseillé. `contrepartie`, `categorie`, `compte` : facultatifs.
- Une `categorie` qui porte exactement le nom d'une catégorie du simulateur est reprise telle quelle. L'export « Exporter en CSV » produit ce format.

## Classement

1. Comptes de l'utilisateur (IBAN) : virement interne.
2. Règles de l'utilisateur (texte cherché → catégorie), prioritaires.
3. Mots-clés intégrés (`src/import/categories.ts`) : enseignes et organismes courants en Belgique. Les codes BIC sont retirés avant (« AXABBE22 » n'est pas une assurance).
4. Catégorie fournie par la banque, si elle existe.
5. Sinon « À classer » (dépense) ou « Revenus » (crédit).

Une dépense de plus de 1 500 € hors crédits, loyer, crèche et épargne est proposée comme exceptionnelle (exclue des moyennes, modifiable). Les doublons entre fichiers qui se recouvrent sont ignorés ; deux paiements identiques le même jour dans un même fichier sont gardés.

## Tableau de bord (onglet « Mes dépenses »)

Calculs dans `src/import/dashboard.ts`, sans accès réseau.

- **Commerçant** : enseignes regroupées (« AD Delhaize Salzinnes 5000 Namur » → Delhaize), sinon les trois premiers mots de la contrepartie, sans code postal, ville ni forme juridique.
- **Utile ou optionnel** : choix sur l'opération, sinon sur le commerçant, sinon sur la catégorie, sinon valeur par défaut de la catégorie (`DEFAULT_NATURE`). Les services de divertissement (Netflix, Spotify…) sont optionnels. Espèces, divers et « À classer » restent « à qualifier ». Superflu = optionnel ÷ (utile + optionnel).
- **Enfants** : crèche, école, stages et activités, babysitting, enseignes pour enfants, et ce que l'utilisateur coche ; plus une part estimée (30 % par défaut) des courses, vêtements et santé ; moins les allocations familiales reçues.
- **Récurrent** : même bénéficiaire, montant stable (±20 %, ±35 % pour un revenu), rythme mensuel (au moins 3 mois), trimestriel (au moins 3 fois) ou annuel (montant à ±10 %).
- **Revenu régulier** : revenu récurrent ou allocations familiales ; le reste est ponctuel. Modifiable par émetteur.
