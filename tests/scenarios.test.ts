import { describe, expect, it } from 'vitest';
import { compare } from '../src/engine/simulate';
import { belgiumWallonia } from '../src/countries/be/module';
import { DEFAULT_ASSUMPTIONS, DEFAULT_BASE, DEFAULT_HOUSEHOLD } from '../src/defaults';
import type { WorkPeriod } from '../src/engine/types';

const run = (fraction: number, leave: WorkPeriod['leave'] = 'aucun') =>
  compare(belgiumWallonia, DEFAULT_HOUSEHOLD, DEFAULT_BASE, { ...DEFAULT_BASE, periods: [{ parent: 'B', from: '2027-01', to: '2045-12', fraction, leave }] }, DEFAULT_ASSUMPTIONS);

describe('scénarios de temps de travail', () => {
  it('moins on travaille, plus le revenu disponible baisse', () => {
    const y = 1; // 2027
    const d45 = run(0.8).diff[y].computed, dMi = run(0.5).diff[y].computed, dArret = run(0).diff[y].computed;
    console.log('2027 écart calculé : 4/5', d45, 'mi-temps', dMi, 'arrêt', dArret);
    expect(d45).toBeLessThan(0);
    expect(dMi).toBeLessThan(d45);
    expect(dArret).toBeLessThan(dMi);
  });
  it('le net perdu est bien inférieur au brut perdu (impôt, quotient conjugal)', () => {
    const c = run(0);
    const grossLost = c.base[1].lines.find((l) => l.key === 'salaire-B')!.amount;
    expect(-c.diff[1].computed).toBeLessThan(grossLost * 0.65);
  });
  it('un congé parental 4/5 rapporte une allocation ONEM', () => {
    const c = run(0.8, 'conge-parental');
    expect(c.scenario[1].lines.some((l) => l.key === 'onem-B' && l.amount > 2000)).toBe(true);
  });
});
