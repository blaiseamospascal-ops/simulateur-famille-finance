import type { Assumptions, Comparison, CountryModule, Household, Parent, Situation, YearResult, YM, WorkPeriod } from './types';

export const ym = (y: number, m: number): YM => `${y}-${String(m).padStart(2, '0')}`;
export const ymIndex = (s: YM): number => {
  const [y, m] = s.split('-').map(Number);
  return y * 12 + (m - 1);
};

/** Régime de travail d'un parent pour un mois donné : la dernière période qui couvre le mois l'emporte. */
export function regimeAt(periods: WorkPeriod[], parent: 'A' | 'B', monthIdx: number): Pick<WorkPeriod, 'fraction' | 'leave'> {
  let r: Pick<WorkPeriod, 'fraction' | 'leave'> = { fraction: 1, leave: 'aucun' };
  for (const p of periods) {
    if (p.parent !== parent) continue;
    if (monthIdx >= ymIndex(p.from) && monthIdx <= ymIndex(p.to)) r = { fraction: p.fraction, leave: p.leave };
  }
  return r;
}

/**
 * Brut mensuel temps plein d'un parent pour une année, avant pénalité de carrière.
 * Avec une évolution connue (grossByYear), on prend la dernière année connue et on projette au-delà ;
 * sinon, le brut de départ suit l'indexation et la progression de carrière.
 */
export function grossFor(par: Parent, year: number, a: Assumptions): number {
  const g = (n: number) => Math.pow((1 + a.indexRate) * (1 + a.realWageGrowth), Math.max(0, n));
  let lastY = a.startYear;
  let lastG = par.grossMonthlyFT;
  for (const [ys, v] of Object.entries(par.grossByYear ?? {})) {
    const y = Number(ys);
    if (Number.isFinite(y) && Number(v) > 0 && y <= year && y >= lastY) {
      lastY = y;
      lastG = Number(v);
    }
  }
  return lastG * g(year - lastY);
}

export function simulate(module: CountryModule, household: Household, situation: Situation, a: Assumptions): YearResult[] {
  const out: YearResult[] = [];
  const cum = { A: 0, B: 0 };
  for (let i = 0; i < a.years; i++) {
    const year = a.startYear + i;
    const growth = Math.pow((1 + a.indexRate) * (1 + a.realWageGrowth), i);
    const wageFactor = {
      A: growth * Math.max(0, 1 - a.careerPenaltyPerYear * cum.A),
      B: growth * Math.max(0, 1 - a.careerPenaltyPerYear * cum.B),
    };
    const pen = (p: 'A' | 'B') => Math.max(0, 1 - a.careerPenaltyPerYear * cum[p]);
    const grossMonthly = {
      A: grossFor(household.A, year, a) * pen('A'),
      B: household.B ? grossFor(household.B, year, a) * pen('B') : 0,
    };
    out.push(module.computeYear({ year, household, situation, assumptions: a, wageFactor, grossMonthly, cumulativeNotWorked: { ...cum } }));
    // Années non travaillées (équivalent temps plein) de cette année, pour la pénalité de carrière.
    for (const p of ['A', 'B'] as const) {
      let notWorked = 0;
      for (let m = 1; m <= 12; m++) notWorked += 1 - regimeAt(situation.periods, p, ymIndex(ym(year, m))).fraction;
      cum[p] += notWorked / 12;
    }
  }
  return out;
}

export function compare(module: CountryModule, household: Household, base: Situation, scenario: Situation, a: Assumptions): Comparison {
  const b = simulate(module, household, base, a);
  const s = simulate(module, household, scenario, a);
  const cumulative = { low: 0, mid: 0, high: 0 };
  const diff = b.map((by, i) => {
    const sy = s[i];
    // Écart de revenu disponible : la fourchette la plus défavorable combine coûts hauts du scénario.
    const costs = {
      low: sy.estimatedCosts.low - by.estimatedCosts.low,
      mid: sy.estimatedCosts.mid - by.estimatedCosts.mid,
      high: sy.estimatedCosts.high - by.estimatedCosts.high,
    };
    const computed = sy.computedNet - by.computedNet;
    const disposable = { low: computed - costs.high, mid: computed - costs.mid, high: computed - costs.low };
    cumulative.low += disposable.low;
    cumulative.mid += disposable.mid;
    cumulative.high += disposable.high;
    return { year: by.year, computed, costs, disposable, cumulative: { ...cumulative } };
  });
  return { base: b, scenario: s, diff };
}

/**
 * Trajectoire de patrimoine : épargne annuelle de départ (indexée) + écart de revenu disponible du scénario,
 * placée au rendement choisi. Avec un écart nul, c'est la trajectoire de la situation actuelle.
 */
export function wealthPath(diffs: number[], start: number, yearlySavings: number, returnRate: number, indexRate: number) {
  let w = start;
  const wealth: number[] = [];
  const savings: number[] = [];
  diffs.forEach((d, t) => {
    const s = yearlySavings * Math.pow(1 + indexRate, t) + d;
    w = w * (1 + returnRate) + s;
    savings.push(Math.round(s));
    wealth.push(Math.round(w));
  });
  return { wealth, savings };
}
