import { describe, expect, it } from 'vitest';
import { compare, simulate } from '../src/engine/simulate';
import { belgiumWallonia } from '../src/countries/be/module';
import { DEFAULT_ASSUMPTIONS, DEFAULT_BASE, DEFAULT_HOUSEHOLD, DEFAULT_SCENARIO } from '../src/defaults';

describe('smoke', () => {
  it('runs default comparison', () => {
    const c = compare(belgiumWallonia, DEFAULT_HOUSEHOLD, DEFAULT_BASE, DEFAULT_SCENARIO, DEFAULT_ASSUMPTIONS);
    for (const y of [0, 1, 2, 5]) {
      console.log(c.base[y].year, JSON.stringify(c.base[y].lines.map((l) => [l.key, l.amount])), c.base[y].computedNet);
      console.log(c.scenario[y].year, JSON.stringify(c.scenario[y].lines.map((l) => [l.key, l.amount])), c.scenario[y].computedNet);
      console.log(JSON.stringify(c.diff[y]));
    }
    expect(c.diff.length).toBe(20);
  });
  it('stop work', () => {
    const s = { ...DEFAULT_BASE, periods: [{ parent: 'B' as const, from: '2026-01', to: '2040-12', fraction: 0, leave: 'aucun' as const }] };
    const r = simulate(belgiumWallonia, DEFAULT_HOUSEHOLD, s, DEFAULT_ASSUMPTIONS);
    console.log(JSON.stringify(r[0].lines.map((l) => [l.key, l.amount, l.detail?.slice(0, 80)])), r[0].computedNet);
  });
});
