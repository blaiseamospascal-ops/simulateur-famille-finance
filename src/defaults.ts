import type { Assumptions, Household, Situation } from './engine/types';

// Coûts de consommation par défaut : ordres de grandeur pour un ménage belge à revenus moyens,
// hors crèche, logement et allocations. À remplacer par vos propres chiffres.
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  startYear: 2026,
  years: 20,
  indexRate: 0.02,
  realWageGrowth: 0.005,
  careerPenaltyPerYear: 0,
  allowanceEndAge: 21,
  creche: { use: true, type: 'one', privateDaily: 45, daysPerYear: 220, adaptToParentTime: true },
  childMonthly: { age0_2: 300, age3_5: 280, age6_11: 350, age12_17: 480, age18_24: 600 },
  costRange: { low: 0.7, high: 1.4 },
  rankFactor: { second: 0.85, thirdPlus: 0.75 },
  extracurricularYearly: 900,
  extracurricularDropIfParentHome: true,
  birthEquipment: 1500,
  housingPerNewChildMonthly: 0,
};

export const DEFAULT_HOUSEHOLD: Household = {
  country: 'be',
  region: 'wal',
  couple: true,
  communalRate: 0.08,
  A: { label: 'Parent A', grossMonthlyFT: 4200, age: 38 },
  B: { label: 'Parent B', grossMonthlyFT: 3600, age: 36 },
};

export const DEFAULT_BASE: Situation = {
  label: 'Situation actuelle',
  children: [
    { id: 'e1', birth: '2021-04', planned: false },
    { id: 'e2', birth: '2023-09', planned: false },
  ],
  periods: [],
};

export const DEFAULT_SCENARIO: Situation = {
  label: 'Scénario',
  children: [
    { id: 'e1', birth: '2021-04', planned: false },
    { id: 'e2', birth: '2023-09', planned: false },
    { id: 'e3', birth: '2027-09', planned: true, birthParent: 'B' },
  ],
  periods: [{ parent: 'B', from: '2028-01', to: '2030-12', fraction: 0.8, leave: 'conge-parental' }],
};
