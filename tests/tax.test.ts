import { describe, expect, it } from 'vitest';
import { taxParams } from '../src/countries/be/params';
import { childSupplement, csss, householdTax, progressive, workBonusMonthly } from '../src/countries/be/tax';
import cases from '../validation/cas-tax-calc.json';

const p2025 = taxParams(2025, 0.02);

describe('barème progressif', () => {
  it('revenus 2025 : calcul tranche par tranche', () => {
    expect(progressive(16320, p2025.brackets)).toBeCloseTo(4080, 2);
    expect(progressive(28800, p2025.brackets)).toBeCloseTo(4080 + 12480 * 0.4, 2);
    expect(progressive(60000, p2025.brackets)).toBeCloseTo(4080 + 4992 + 21040 * 0.45 + 10160 * 0.5, 2);
  });
});

describe('bonus à l\'emploi (septembre 2026)', () => {
  it('maximum sous les seuils', () => {
    const b = workBonusMonthly(2200);
    expect(b.A).toBeCloseTo(127.54, 2);
    expect(b.B).toBeCloseTo(171.99, 2);
  });
  it('nul au-dessus de 3 403,62 €', () => {
    const b = workBonusMonthly(3500);
    expect(b.A + b.B).toBe(0);
  });
});

describe('quotient conjugal', () => {
  const base = { couple: true, dependentChildren: 0, childrenUnder3NoChildcare: 0, childcare: [], communalRate: 0 };
  it('un seul revenu : 30 % transférés, plafonnés', () => {
    const r = householdTax({ ...base, persons: [{ taxableGross: 40000, personalOnss: 0, workBonus: { A: 0, B: 0 } }, { taxableGross: 0, personalOnss: 0, workBonus: { A: 0, B: 0 } }] }, p2025);
    expect(r.quotientTransfer).toBeCloseTo(Math.min(0.3 * (40000 - 5930), 13460), 2);
  });
  it('plafond 2026 réduit à 11 780 € par la réforme', () => {
    const r = householdTax({ ...base, persons: [{ taxableGross: 90000, personalOnss: 0, workBonus: { A: 0, B: 0 } }, { taxableGross: 0, personalOnss: 0, workBonus: { A: 0, B: 0 } }] }, taxParams(2026, 0.02));
    expect(r.quotientTransfer).toBe(11780);
  });
  it('deux revenus proches : pas de transfert', () => {
    const r = householdTax({ ...base, persons: [{ taxableGross: 40000, personalOnss: 0, workBonus: { A: 0, B: 0 } }, { taxableGross: 30000, personalOnss: 0, workBonus: { A: 0, B: 0 } }] }, p2025);
    expect(r.quotientTransfer).toBe(0);
  });
});

describe('suppléments enfants', () => {
  it('revenus 2025', () => {
    expect(childSupplement(3, p2025)).toBe(11440);
    expect(childSupplement(6, p2025)).toBe(18510 + 2 * 7070);
  });
  it('plafond CSSS', () => {
    expect(csss(100000)).toBeCloseTo(731.28, 2);
    expect(csss(15000)).toBe(0);
  });
});

// Cas de validation contre Tax-Calc (SPF Finances). Un cas sans valeur Tax-Calc est signalé, pas ignoré.
describe('validation Tax-Calc (revenus 2025)', () => {
  for (const c of cases.cases) {
    it(`${c.id} — ${c.description}`, () => {
      const r = householdTax(
        {
          couple: c.couple,
          persons: c.persons.map((x) => ({ taxableGross: x.taxableGross, personalOnss: x.personalOnss, workBonus: { A: 0, B: 0 } })),
          dependentChildren: c.dependentChildren,
          childrenUnder3NoChildcare: c.childrenUnder3NoChildcare,
          childcare: c.childcare,
          communalRate: c.communalRate,
        },
        taxParams(c.incomeYear, 0.02),
      );
      if (c.taxcalc.total == null) {
        console.warn(`${c.id} : pas encore de valeur Tax-Calc (simulateur : ${r.total} €)`);
        return;
      }
      expect(Math.abs(r.total - c.taxcalc.total)).toBeLessThanOrEqual(cases.tolerance);
    });
  }
});
