# Mettre à jour les barèmes

Sans mise à jour, le simulateur devient faux en un an. Tout se passe dans `src/countries/be/params.ts`.

## À chaque indexation (ONEM, allocations familiales, bonus à l'emploi)

1. ONEM : relever les montants **bruts** sur les pages « secteur privé crédit-temps » et « congés thématiques », mettre à jour `ONEM_2026` (ou créer `ONEM_<année>`).
2. Allocations familiales : page Parentia « nouveau système » et « ancien système », mettre à jour `AF_WAL_2026`. Vérifier si les seuils du supplément social (mention « 2024 ») ont changé.
3. Bonus à l'emploi : instructions ONSS ou Securex, mettre à jour `SOCIAL_2026`.

## Chaque année fiscale (avis d'indexation du SPF Finances, au Moniteur)

1. Créer le bloc `Y<année>` dans `params.ts` avec tranches, quotité exemptée, suppléments enfants, forfait de frais, plafond du quotient conjugal, frais de garde.
2. Remplacer la fiabilité `publie` par `officiel` quand le montant vient de l'avis SPF.
3. Relancer `npm test`, puis compléter `validation/cas-tax-calc.json` pour la nouvelle année (voir ci-dessous).
4. Tarif crèche : circulaire ONE « participation financière des parents » de l'année, mettre à jour `ONE_PFP_<année>`.

## Validation Tax-Calc

`validation/cas-tax-calc.json` décrit 20 ménages types. Pour chacun, encoder dans Tax-Calc (SPF Finances) le montant `code1250` comme rémunérations, la taxe communale, les enfants à charge et les frais de garde, puis reporter l'impôt total dans `taxcalc.total`. Le test échoue si l'écart dépasse `tolerance` (50 €). Un cas sans valeur est signalé, pas ignoré.

## Valeurs à confirmer (novembre 2026)

- Revenus 2026 : supplément enfant de moins de 3 ans, forfait de frais professionnels et maximum journalier des frais de garde sont l'indexation estimée des montants 2025.
- Revenus 2027 et 2028 : quotité exemptée = montant de base de la loi × coefficient 2027 (indexation non publiée).
- Plafond de pension et indemnité de maternité : approximations.
