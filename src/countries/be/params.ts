// Barèmes belges datés. Chaque montant porte sa source et sa fiabilité.
// MISE À JOUR : voir MAINTENANCE.md. Une année de revenus = un bloc ci-dessous.
// « revenus N » = exercice d'imposition N+1.

import type { Reliability } from '../../engine/types';

export const SOURCES = {
  spfIndex2026: 'https://finances.belgium.be/fr/particuliers/declaration_impot/taux-imposition-revenus-imposables (avis SPF indexation ex. 2026)',
  onyxe: 'https://onyxe.be/tranches-imposition-belgique/',
  attentia: 'https://www.attentia.be/fr/actualites/reforme-de-limpot-des-personnes-physiques-impact-sur-la-remuneration',
  deg: 'https://blog.degandpartners.com/fr/article/quotient-conjugal-en-2027-11.780-ou-12.790-selon-lage-des-conjoints-voila-ce-que-vous-obtiendrez-de-la-reforme/32619',
  loiIPP: 'Loi du 15 juillet 2026 portant réforme de l\'IPP, Moniteur belge du 29 juillet 2026',
  onssBonus: 'https://www.securex.be/fr/lex4you/employeur/montants-actuels/montants-socio-juridiques/bonus-a-l-emploi',
  onemCT: 'https://www.onem.be/documentation/montants/interruption-de-carriere-credit-temps/secteur-prive-credit-temps',
  onemCongés: 'https://www.onem.be/documentation/montants/interruption-de-carriere-credit-temps/conges-thematiques',
  parentiaNew: 'https://www.parentia.be/fr/wallonie/allocations-familiales/montants/nouveau-systeme',
  parentiaOld: 'https://www.parentia.be/fr/wallonie/allocations-familiales/montants/ancien-systeme',
  onePFP: 'https://www.crpe.be/wp-content/uploads/2026/01/Circulaire-PFP-2026-1.pdf (circulaire ONE PFP 2026)',
} as const;

export interface TaxYearParams {
  incomeYear: number;
  reliability: Reliability;
  source: string;
  brackets: { upTo: number; rate: number }[]; // dernier upTo = Infinity
  baseExempt: number;
  /** Supplément total de quotité exemptée pour 1, 2, 3, 4 enfants à charge ; puis par enfant au-delà. */
  childSupplement: [number, number, number, number];
  childSupplementBeyond4: number;
  childUnder3: number;
  singleParent: number;
  forfaitRate: number;
  forfaitMax: number;
  quotientRate: number;
  quotientCap: number;
  childcareRate: number;
  childcareMaxPerDay: number;
  childcareMaxAge: number;
  workBonusFiscalA: number;
  workBonusFiscalB: number;
}

// Revenus 2025 (ex. 2026) : avis officiel d'indexation SPF. Sert de référence pour la validation Tax-Calc.
const Y2025: TaxYearParams = {
  incomeYear: 2025,
  reliability: 'officiel',
  source: SOURCES.spfIndex2026,
  brackets: [
    { upTo: 16320, rate: 0.25 },
    { upTo: 28800, rate: 0.4 },
    { upTo: 49840, rate: 0.45 },
    { upTo: Infinity, rate: 0.5 },
  ],
  baseExempt: 10910,
  childSupplement: [1980, 5110, 11440, 18510],
  childSupplementBeyond4: 7070,
  childUnder3: 740,
  singleParent: 1980,
  forfaitRate: 0.3,
  forfaitMax: 5930,
  quotientRate: 0.3,
  quotientCap: 13460,
  childcareRate: 0.45,
  childcareMaxPerDay: 16.9,
  childcareMaxAge: 14,
  workBonusFiscalA: 0.3314,
  workBonusFiscalB: 0.5254,
};

// Revenus 2026 (ex. 2027) : barème et réforme publiés (loi du 15/07/2026) ; avis SPF d'indexation pas encore lu.
const IDX_2026 = 16720 / 16320; // coefficient observé sur la 1re tranche
const r10 = (x: number) => Math.round(x / 10) * 10;
const Y2026: TaxYearParams = {
  ...Y2025,
  incomeYear: 2026,
  reliability: 'publie',
  source: `${SOURCES.onyxe} ; ${SOURCES.attentia} ; ${SOURCES.loiIPP}`,
  brackets: [
    { upTo: 16720, rate: 0.25 },
    { upTo: 29510, rate: 0.4 },
    { upTo: 51070, rate: 0.45 },
    { upTo: Infinity, rate: 0.5 },
  ],
  baseExempt: 11550,
  childSupplement: [2130, 5130, 11440, 18510], // réforme : 1er et 2e enfant relevés, 3e et suivants gelés
  childSupplementBeyond4: 7070,
  childUnder3: r10(740 * IDX_2026), // estimé : indexation du montant 2025
  singleParent: 2030,
  forfaitMax: r10(5930 * IDX_2026), // estimé : indexation du montant 2025
  quotientCap: 11780,
  childcareMaxPerDay: Math.round(16.9 * IDX_2026 * 10) / 10, // estimé
  workBonusFiscalB: 0.63,
};

/** Coefficient d'indexation figé à partir de l'ex. 2027 (montants de base × coefficient). */
const COEF_2027 = 11550 / 4945;

// Réforme votée : montants de base (non indexés) des années suivantes, convertis avec le coefficient 2027.
const REFORM: Record<number, Partial<TaxYearParams>> = {
  2027: {
    baseExempt: r10(4990 * COEF_2027),
    childSupplement: [r10(1005 * COEF_2027), r10(2260 * COEF_2027), 11440, 18510],
    quotientCap: 10110,
    workBonusFiscalB: 0.63,
  },
  2028: {
    baseExempt: r10(5070 * COEF_2027),
    childSupplement: [r10(1075 * COEF_2027), r10(2272.5 * COEF_2027), 11440, 18510],
    quotientCap: 8420,
    workBonusFiscalA: 0.35,
    workBonusFiscalB: 0.72,
  },
  2029: {
    baseExempt: 14450,
    childSupplement: [r10(1162.5 * COEF_2027), r10(2325 * COEF_2027), 11440, 18510],
    quotientCap: 6730,
    workBonusFiscalA: 0.35,
    workBonusFiscalB: 0.72,
  },
  2030: {
    baseExempt: 15600,
    childSupplement: [r10(1162.5 * COEF_2027), r10(2325 * COEF_2027), 11440, 18510],
    quotientCap: 6730,
    workBonusFiscalA: 0.35,
    workBonusFiscalB: 0.72,
  },
};

/** Paramètres fiscaux d'une année de revenus. Au-delà des années connues : indexation au taux choisi. */
export function taxParams(year: number, indexRate: number): TaxYearParams {
  if (year <= 2025) return Y2025;
  if (year === 2026) return Y2026;
  const n = year - 2026;
  const f = Math.pow(1 + indexRate, n);
  const idx = (x: number) => r10(x * f);
  const lastReform = Math.min(year, 2030);
  let reform: Partial<TaxYearParams> = {};
  for (let y = 2027; y <= lastReform; y++) reform = { ...reform, ...REFORM[y] };
  const fAfter2030 = year > 2030 ? Math.pow(1 + indexRate, year - 2030) : 1;
  return {
    ...Y2026,
    ...reform,
    incomeYear: year,
    reliability: 'projection',
    source: `Projection : ${SOURCES.loiIPP} (quotité, quotient conjugal, bonus fiscal) ; autres montants 2026 indexés à ${(indexRate * 100).toFixed(1)} %/an`,
    brackets: Y2026.brackets.map((b) => ({ upTo: b.upTo === Infinity ? Infinity : idx(b.upTo), rate: b.rate })),
    baseExempt: r10((reform.baseExempt ?? Y2026.baseExempt) * fAfter2030),
    childSupplement: (reform.childSupplement ?? Y2026.childSupplement).map((x) => r10(x * fAfter2030)) as [number, number, number, number],
    childUnder3: idx(Y2026.childUnder3),
    singleParent: idx(Y2026.singleParent),
    forfaitMax: idx(Y2026.forfaitMax),
    // Le plafond du quotient conjugal n'est plus indexé (loi du 15/07/2026).
    quotientCap: reform.quotientCap ?? Y2026.quotientCap,
    childcareMaxPerDay: Math.round(Y2026.childcareMaxPerDay * f * 10) / 10,
  };
}

// ---------- Sécurité sociale (montants mensuels, employés, depuis le 1er septembre 2026) ----------
export const SOCIAL_2026 = {
  onssRate: 0.1307,
  /** Bonus à l'emploi volet A (bas salaires). */
  bonusA: { max: 127.54, s1: 2937.93, coef: 0.2739, s2: 3403.62 },
  /** Bonus à l'emploi volet B (très bas salaires). */
  bonusB: { max: 171.99, s1: 2300.62, coef: 0.2699, s2: 2937.93 },
  source: SOURCES.onssBonus,
};

/** Cotisation spéciale de sécurité sociale, barème annuel du ménage (revenus nets imposables). */
export const CSSS = [
  { from: 0, to: 18592.02, base: 0, rate: 0 },
  { from: 18592.02, to: 21070.96, base: 0, rate: 0.09 },
  { from: 21070.96, to: 37344.02, base: 223.1, rate: 0.013 },
  { from: 37344.02, to: 60181.95, base: 434.66, rate: 0.013 },
] as const;
export const CSSS_MAX = 731.28;

// ---------- ONEM, montants BRUTS mensuels pour un temps plein, indexés au 01/09/2026 ----------
// Le moteur ajoute le brut au revenu imposable : l'impôt final est recalculé (le précompte ONEM n'est qu'une avance).
export const ONEM_2026 = {
  source: `${SOURCES.onemCT} ; ${SOURCES.onemCongés}`,
  // clé = part du temps interrompue
  congeParental: {
    1: { coh: 1080.08, iso: 1840.08 },
    0.5: { coh: 540.03, iso: 920.04 },
    0.2: { coh: 183.2, iso: 368.01 },
    0.1: { coh: 91.6, iso: 184.0 },
  } as Record<number, { coh: number; iso: number }>,
  creditTemps: {
    1: { coh: 660.35, iso: 660.35 },
    0.5: { coh: 330.16, iso: 330.16 },
    0.2: { coh: 217.42, iso: 290.77 },
  } as Record<number, { coh: number; iso: number }>,
  /** Durées maximales du congé parental par enfant (mois), selon la forme. */
  congeParentalMaxMonths: { 1: 4, 0.5: 8, 0.2: 20, 0.1: 40 } as Record<number, number>,
};

// ---------- Allocations familiales Wallonie (montants depuis septembre 2026) ----------
export const AF_WAL_2026 = {
  source: SOURCES.parentiaNew,
  birthPremium: 1422.96,
  new: {
    base0_17: 200.51,
    base18_24: 213.44,
    social: {
      lowThreshold: 34453.81,
      highThreshold: 55599.36,
      low: 71.15,
      lowLarge: 45.28, // supplément si 3 enfants ou plus
      lowSingle: 25.87,
      mid: 32.34,
      midLarge: 25.87,
      midSingle: 25.87,
    },
    singleParentOrphan: 100.26,
    school: [
      { maxAge: 4, amount: 25.87 },
      { maxAge: 10, amount: 38.81 },
      { maxAge: 16, amount: 64.68 },
      { maxAge: 99, amount: 103.49 },
    ],
  },
  old: {
    source: SOURCES.parentiaOld,
    base: [123.94, 229.32, 342.39],
    // La source donne une fourchette « de 21,59 € à 82,01 € » selon le rang et l'âge : valeurs intermédiaires approximatives.
    ageSupplement: [
      { minAge: 6, amount: 21.59 },
      { minAge: 12, amount: 51.8 },
      { minAge: 18, amount: 82.01 },
    ],
    social: [63.09, 39.11, 6.87],
    school: [
      { maxAge: 5, amount: 27.46 },
      { maxAge: 11, amount: 59.03 },
      { maxAge: 17, amount: 82.36 },
      { maxAge: 99, amount: 109.33 },
    ],
  },
};

// ---------- Crèche ONE, participation financière des parents 2026 (enfants entrés depuis 2025) ----------
export const ONE_PFP_2026 = {
  source: SOURCES.onePFP,
  tranches: [
    { upTo: 1041, base: 0.035, reduced: 0.021 },
    { upTo: 4163, base: 0.128, reduced: 0.09 },
    { upTo: 6765, base: 0.135, reduced: 0.108 },
    { upTo: Infinity, base: 0.24, reduced: 0.216 },
  ],
  maxDaily: 46.84,
};

// ---------- Congé de maternité (approximation) ----------
export const MATERNITY = {
  weeks: 15,
  /** Indemnité moyenne de la mutuelle sur le brut (82 % le premier mois, 75 % ensuite, plafonné). */
  rate: 0.77,
  /** Plafond mensuel approximatif du salaire pris en compte après 30 jours. À vérifier (INAMI). */
  monthlyCap: 4400,
  source: 'INAMI, indemnités de maternité (plafond approximatif, à vérifier)',
};

/** Pension : ordre de grandeur seulement. */
export const PENSION = {
  rate: 0.6,
  careerYears: 45,
  /** Plafond salarial annuel approximatif pris en compte pour la pension. */
  ceiling: 80000,
};
