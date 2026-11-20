// Calculs fiscaux et sociaux belges purs (sans état), testables isolément.
import { CSSS, CSSS_MAX, SOCIAL_2026, type TaxYearParams } from './params';

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Impôt de base progressif sur un montant. */
export function progressive(amount: number, brackets: TaxYearParams['brackets']): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (amount <= prev) break;
    const slice = Math.min(amount, b.upTo) - prev;
    tax += slice * b.rate;
    prev = b.upTo;
  }
  return tax;
}

/** Bonus à l'emploi social mensuel (volets A et B) pour un salaire mensuel temps plein S, avec un facteur d'indexation des seuils. */
export function workBonusMonthly(S: number, idx = 1): { A: number; B: number } {
  const a = SOCIAL_2026.bonusA;
  const b = SOCIAL_2026.bonusB;
  const s = S / idx; // ramène le salaire au niveau de 2026 plutôt que d'indexer chaque seuil
  const A = s <= a.s1 ? a.max : s <= a.s2 ? Math.max(0, a.max - a.coef * (s - a.s1)) : 0;
  const B = s <= b.s1 ? b.max : s <= b.s2 ? Math.max(0, b.max - b.coef * (s - b.s1)) : 0;
  return { A: A * idx, B: B * idx };
}

/** Supplément de quotité exemptée pour n enfants à charge. */
export function childSupplement(n: number, p: TaxYearParams): number {
  if (n <= 0) return 0;
  if (n <= 4) return p.childSupplement[n - 1];
  return p.childSupplement[3] + (n - 4) * p.childSupplementBeyond4;
}

export function csss(householdNetIncome: number, idx = 1): number {
  const x = householdNetIncome / idx;
  for (const t of CSSS) if (x > t.from && x <= t.to) return round2(Math.min(CSSS_MAX, t.base + (x - t.from) * t.rate) * idx);
  return x > 0 ? round2(CSSS_MAX * idx) : 0;
}

export interface PersonTaxInput {
  /** Revenus professionnels bruts imposables (salaire, 13e mois, double pécule). */
  taxableGross: number;
  /** Cotisations ONSS personnelles réellement retenues (après bonus à l'emploi). */
  personalOnss: number;
  /** Bonus à l'emploi social de l'année (volets A et B). */
  workBonus: { A: number; B: number };
  /** Revenus de remplacement bruts imposables (ONEM, mutuelle), sans frais forfaitaires. */
  replacementGross?: number;
}

export interface HouseholdTaxInput {
  couple: boolean;
  persons: PersonTaxInput[]; // 1 ou 2
  dependentChildren: number;
  childrenUnder3NoChildcare: number;
  /** Frais de garde : jours et prix journalier par enfant éligible. */
  childcare: { days: number; daily: number }[];
  communalRate: number;
  /** false : sans quotient conjugal ni transfert de quotité exemptée (pour mesurer l'avantage de l'imposition commune). */
  jointBenefits?: boolean;
}

export interface HouseholdTaxResult {
  perPerson: {
    netPro: number;
    forfait: number;
    taxable: number;
    afterQuotient: number;
    exempt: number;
    baseTax: number;
    workBonusReduction: number;
  }[];
  quotientTransfer: number;
  childcareReduction: number;
  federal: number;
  communal: number;
  total: number;
}

/**
 * Impôt final d'un ménage de salariés pour une année de revenus.
 * Simplifications : pas de revenus immobiliers ou mobiliers, pas de réductions pour épargne,
 * revenus de remplacement (ONEM, mutuelle) imposés comme des revenus professionnels, sans la réduction
 * d'impôt pour revenus de remplacement (légère surestimation de l'impôt pour les petits revenus).
 */
export function householdTax(h: HouseholdTaxInput, p: TaxYearParams): HouseholdTaxResult {
  const per = h.persons.map((x) => {
    const netPro = x.taxableGross - x.personalOnss;
    const forfait = Math.min(netPro * p.forfaitRate, p.forfaitMax);
    return { netPro, forfait, taxable: Math.max(0, netPro - forfait) + (x.replacementGross ?? 0) };
  });

  // Quotient conjugal : le conjoint au plus faible revenu reçoit de quoi atteindre 30 % du total, plafonné.
  let transfer = 0;
  const after = per.map((x) => x.taxable);
  if (h.couple && h.jointBenefits !== false && after.length === 2) {
    const total = after[0] + after[1];
    const lo = after[0] <= after[1] ? 0 : 1;
    const hi = 1 - lo;
    const target = total * p.quotientRate;
    if (after[lo] < target) {
      transfer = Math.min(target - after[lo], p.quotientCap);
      after[lo] += transfer;
      after[hi] -= transfer;
    }
  }

  // Quotité exemptée : base pour chacun, suppléments au conjoint qui a le revenu le plus élevé.
  const exempt = after.map(() => p.baseExempt);
  const hiIdx = after.length === 2 && after[1] > after[0] ? 1 : 0;
  let supp = childSupplement(h.dependentChildren, p) + h.childrenUnder3NoChildcare * p.childUnder3;
  if (!h.couple && h.dependentChildren > 0) supp += p.singleParent;
  exempt[hiIdx] += supp;
  // L'excédent de quotité sur le revenu passe à l'autre conjoint (imposition commune).
  if (after.length === 2 && h.jointBenefits !== false) {
    for (const i of [0, 1]) {
      const j = 1 - i;
      const excess = exempt[i] - after[i];
      if (excess > 0) {
        exempt[i] -= excess;
        exempt[j] += excess;
      }
    }
  }

  const persons = per.map((x, i) => {
    const e = Math.min(exempt[i], Math.max(after[i], 0));
    const baseTax = Math.max(0, progressive(after[i], p.brackets) - progressive(e, p.brackets));
    const wb = h.persons[i].workBonus;
    const workBonusReduction = Math.min(baseTax, wb.A * p.workBonusFiscalA + wb.B * p.workBonusFiscalB);
    return { ...x, afterQuotient: after[i], exempt: exempt[i], baseTax, workBonusReduction };
  });

  const beforeChildcare = persons.reduce((s, x) => s + x.baseTax - x.workBonusReduction, 0);
  const childcareRaw = h.childcare.reduce((s, c) => s + c.days * Math.min(c.daily, p.childcareMaxPerDay) * p.childcareRate, 0);
  const childcareReduction = Math.min(childcareRaw, beforeChildcare);
  const federal = beforeChildcare - childcareReduction;
  const communal = federal * h.communalRate;
  return {
    perPerson: persons,
    quotientTransfer: transfer,
    childcareReduction,
    federal: round2(federal),
    communal: round2(communal),
    total: round2(federal + communal),
  };
}
