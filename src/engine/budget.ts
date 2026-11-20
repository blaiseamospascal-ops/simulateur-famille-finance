// Budget du ménage : revenus calculés par le module pays + autres revenus nets − dépenses réelles,
// année par année, puis trajectoire de l'épargne et calculs « combien de temps tenir ».
// Pur et sans pays : testable isolément.
import { regimeAt, ym, ymIndex } from './simulate';
import type { Situation, YearResult, YM } from './types';

/** Un poste de dépense mensuel (montant positif), avec sa période et ses règles. */
export interface BudgetItem {
  id: string;
  label: string;
  category: string;
  /** € par mois, aux prix de l'année de référence. */
  monthly: number;
  from?: YM;
  /** Dernier mois payé (fin d'un crédit, fin de la crèche…). */
  to?: YM;
  /** Crédit : montant fixe, non indexé. */
  credit?: boolean;
  /** Disparaît les mois où un parent ne travaille pas (crèche, stages, garderie). */
  dropsIfParentHome?: boolean;
  /** Économie possible en « budget serré » (€ par mois). Le niveau « moitié » en applique la moitié. */
  cut?: number;
  note?: string;
}

/** Autre revenu net (cours, primes, remboursements…), hors salaires calculés par le simulateur. */
export interface IncomeItem {
  id: string;
  label: string;
  monthlyNet: number;
  /** Nombre de mois payés par an (8 pour une charge de cours sur l'année académique). */
  monthsPerYear: number;
  from?: YM;
  to?: YM;
  note?: string;
}

/** Dépense ou rentrée ponctuelle (travaux, voiture, prime…). Montant positif = dépense. */
export interface OneOff {
  id: string;
  label: string;
  amount: number;
  date: YM;
}

export interface BudgetSetup {
  /** Première année budgétée ; l'épargne est celle du 1er janvier de cette année. */
  startYear: number;
  /** Année des prix saisis (les dépenses non liées à un crédit suivent l'inflation à partir de là). */
  priceYear: number;
  inflation: number;
  /** Les dépenses saisies contiennent déjà la crèche des enfants nés : ne pas la compter deux fois. */
  ownChildcare: boolean;
  items: BudgetItem[];
  incomes: IncomeItem[];
  oneOffs: OneOff[];
  /** Épargne disponible (comptes d'épargne et comptes courants). */
  liquid: number;
  /** Coussin de sécurité à ne jamais entamer. */
  cushion: number;
  /** Placements à ne pas toucher (ETF…). */
  invested: number;
  investYearly: number;
  investReturn: number;
  /** Ne verser aux placements que ce que le budget de l'année permet. */
  investOnlyIfSurplus: boolean;
  /** Économie mensuelle d'une seule voiture au lieu de deux (assurance, taxe, entretien, amortissement). */
  oneCarSaving: number;
  /** Nombre d'années à tenir pour les calculs d'épargne nécessaire. */
  holdYears: number;
}

export interface Variant {
  /** 0 : aucune coupe ; 0,5 : la moitié ; 1 : budget serré. */
  cutLevel: number;
  oneCar: boolean;
}

export interface BudgetYear {
  year: number;
  /** Revenu net calculé (salaires, ONEM, allocations, impôt final), crèche réelle remise si déjà dans les dépenses. */
  publicNet: number;
  otherIncome: number;
  income: number;
  /** Dépenses courantes hors crédits. */
  living: number;
  credits: number;
  /** Coûts estimés des enfants à venir. */
  newChildren: number;
  oneOffs: number;
  expenses: number;
  /** Revenu − dépenses, avant placements. */
  surplus: number;
  invest: number;
  liquid: number;
  invested: number;
  /** Indice de prix de l'année (dépenses courantes). */
  priceIndex: number;
}

const inPeriod = (mi: number, from?: YM, to?: YM) => (!from || mi >= ymIndex(from)) && (!to || mi <= ymIndex(to));

/** Un parent ne travaille pas du tout ce mois-là (hors congé de maternité). */
export function parentHome(s: Situation, mi: number, parents: ('A' | 'B')[]): boolean {
  return parents.some((p) => regimeAt(s.periods, p, mi).fraction === 0);
}

/** Dépense d'un poste pour une année (€), selon la variante et la situation. */
export function itemYear(it: BudgetItem, year: number, s: Situation, parents: ('A' | 'B')[], v: Variant, priceIndex: number): number {
  let sum = 0;
  const m = Math.max(0, it.monthly - v.cutLevel * (it.cut ?? 0));
  for (let k = 1; k <= 12; k++) {
    const mi = ymIndex(ym(year, k));
    if (!inPeriod(mi, it.from, it.to)) continue;
    if (it.dropsIfParentHome && parentHome(s, mi, parents)) continue;
    sum += m * (it.credit ? 1 : priceIndex);
  }
  return sum;
}

export function incomeYear(inc: IncomeItem, year: number, priceIndex: number): number {
  let months = 0;
  for (let k = 1; k <= 12; k++) if (inPeriod(ymIndex(ym(year, k)), inc.from, inc.to)) months++;
  return inc.monthlyNet * (inc.monthsPerYear / 12) * months * priceIndex;
}

/** Budget année par année d'une situation, à partir des résultats du module pays. */
export function budgetYears(setup: BudgetSetup, results: YearResult[], s: Situation, v: Variant, parents: ('A' | 'B')[]): BudgetYear[] {
  const out: BudgetYear[] = [];
  let liquid = setup.liquid;
  let invested = setup.invested;
  for (const r of results) {
    if (r.year < setup.startYear) continue;
    const priceIndex = Math.pow(1 + setup.inflation, Math.max(0, r.year - setup.priceYear));
    const publicNet = r.computedNet + (setup.ownChildcare ? r.parts.crecheExisting : 0);
    const otherIncome = setup.incomes.reduce((a, i) => a + incomeYear(i, r.year, priceIndex), 0);
    let living = 0;
    let credits = 0;
    for (const it of setup.items) {
      const x = itemYear(it, r.year, s, parents, v, priceIndex);
      if (it.credit) credits += x;
      else living += x;
    }
    if (v.oneCar) living = Math.max(0, living - setup.oneCarSaving * 12 * priceIndex);
    const newChildren = r.parts.plannedEstimated;
    const oneOffs = setup.oneOffs.filter((o) => Number(o.date.slice(0, 4)) === r.year).reduce((a, o) => a + o.amount, 0);
    const income = publicNet + otherIncome;
    const expenses = living + credits + newChildren + oneOffs;
    const surplus = income - expenses;
    const invest = setup.investOnlyIfSurplus ? Math.max(0, Math.min(setup.investYearly, surplus)) : setup.investYearly;
    liquid += surplus - invest;
    invested = invested * (1 + setup.investReturn) + invest;
    out.push({ year: r.year, publicNet, otherIncome, income, living, credits, newChildren, oneOffs, expenses, surplus, invest, liquid, invested, priceIndex });
  }
  return out;
}

export interface HoldResult {
  /** Épargne à avoir au départ (coussin compris) pour tenir `years` années sans rien verser aux placements. */
  needed: number;
  /** Ce qu'il faut puiser au plus bas, hors coussin. */
  drawdown: number;
  /** Année où l'épargne est au plus bas (null si jamais en déficit). */
  lowestYear: number | null;
  /** Première année où l'épargne passerait sous le coussin avec l'épargne disponible (null : tient). */
  breaksIn: number | null;
}

/**
 * Épargne nécessaire pour tenir les `years` premières années, versements aux placements suspendus.
 * Le calcul est fait en fin d'année : un déficit au milieu d'une année est lissé.
 */
export function holdFor(rows: BudgetYear[], years: number, cushion: number, available: number): HoldResult {
  let cum = 0;
  let min = 0;
  let lowestYear: number | null = null;
  let breaksIn: number | null = null;
  for (const r of rows.slice(0, years)) {
    cum += r.surplus;
    if (cum < min) {
      min = cum;
      lowestYear = r.year;
    }
    if (breaksIn === null && available + cum < cushion) breaksIn = r.year;
  }
  return { needed: Math.round(cushion - min), drawdown: Math.round(-min), lowestYear, breaksIn };
}

/**
 * Plafond de dépenses courantes (hors crédits, ponctuels et enfants à venir), en € par mois aux prix
 * de l'année de départ et suivant l'inflation, qui permet de tenir `years` années avec l'épargne disponible
 * sans passer sous le coussin. Solution exacte : le plafond est le minimum, sur chaque horizon k,
 * de (revenus cumulés − autres dépenses cumulées + épargne − coussin) / (12 × indices de prix cumulés).
 */
export function spendingCeiling(rows: BudgetYear[], years: number, available: number, cushion: number): number {
  let num = available - cushion;
  let den = 0;
  let best = Infinity;
  for (const r of rows.slice(0, years)) {
    num += r.income - r.credits - r.newChildren - r.oneOffs;
    den += 12 * r.priceIndex;
    best = Math.min(best, num / den);
  }
  return Number.isFinite(best) ? Math.max(0, Math.floor(best)) : 0;
}

export const VARIANTS: { id: string; label: string; v: Variant }[] = [
  { id: 'n2', label: 'Aucune coupe, 2 voitures', v: { cutLevel: 0, oneCar: false } },
  { id: 'h2', label: 'Moitié des coupes, 2 voitures', v: { cutLevel: 0.5, oneCar: false } },
  { id: 's2', label: 'Budget serré, 2 voitures', v: { cutLevel: 1, oneCar: false } },
  { id: 'n1', label: 'Aucune coupe, 1 voiture', v: { cutLevel: 0, oneCar: true } },
  { id: 'h1', label: 'Moitié des coupes, 1 voiture', v: { cutLevel: 0.5, oneCar: true } },
  { id: 's1', label: 'Budget serré, 1 voiture', v: { cutLevel: 1, oneCar: true } },
];

/** Total mensuel des dépenses d'un mois donné (pour afficher « aujourd'hui »). */
export function monthlyTotal(items: BudgetItem[], mi: number, v: Variant = { cutLevel: 0, oneCar: false }): { living: number; credits: number } {
  let living = 0;
  let credits = 0;
  for (const it of items) {
    if (!inPeriod(mi, it.from, it.to)) continue;
    const m = Math.max(0, it.monthly - v.cutLevel * (it.cut ?? 0));
    if (it.credit) credits += m;
    else living += m;
  }
  return { living, credits };
}
