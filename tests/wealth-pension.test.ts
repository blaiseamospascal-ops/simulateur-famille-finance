import { describe, expect, it } from 'vitest';
import { wealthPath } from '../src/engine/simulate';
import { pensionLossUntilRetirement } from '../src/countries/be/module';
import { DEFAULT_ASSUMPTIONS, DEFAULT_BASE, DEFAULT_HOUSEHOLD } from '../src/defaults';

describe('patrimoine', () => {
  it('capitalise épargne et écart', () => {
    const r = wealthPath([0, -1000], 1000, 100, 0.1, 0);
    expect(r.wealth).toEqual([1200, 1320 - 1000 + 100]);
    expect(r.savings).toEqual([100, -900]);
  });
});

describe('pension indicative', () => {
  it('congé parental assimilé : aucune perte', () => {
    const s = { ...DEFAULT_BASE, periods: [{ parent: 'B' as const, from: '2027-01', to: '2028-08', fraction: 0.8, leave: 'conge-parental' as const }] };
    expect(pensionLossUntilRetirement(DEFAULT_HOUSEHOLD, s, DEFAULT_ASSUMPTIONS).B).toBe(0);
  });
  it('arrêt jusqu’à la retraite : perte comptée jusqu’à 67 ans', () => {
    const s = { ...DEFAULT_BASE, periods: [{ parent: 'B' as const, from: '2027-01', to: '2080-12', fraction: 0, leave: 'aucun' as const }] };
    const loss = pensionLossUntilRetirement(DEFAULT_HOUSEHOLD, s, DEFAULT_ASSUMPTIONS).B;
    // 30 ans d'arrêt (de 37 à 66 ans) : environ 30/45 de 60 % du salaire.
    expect(loss).toBeGreaterThan(15000);
    expect(loss).toBeLessThan(35000);
  });
});
