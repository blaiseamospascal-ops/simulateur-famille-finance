import { describe, expect, it } from 'vitest';
import { budgetYears, holdFor, spendingCeiling, type BudgetSetup } from '../src/engine/budget';
import { grossFor, simulate } from '../src/engine/simulate';
import { belgiumWallonia } from '../src/countries/be/module';
import { DEFAULT_ASSUMPTIONS, DEFAULT_HOUSEHOLD } from '../src/defaults';
import { classify } from '../src/import/categories';
import { decode, merge, parseAmount, parseCsv, parseDate, parseFile, summarize } from '../src/import/csv';
import { exampleState, normalize, parseImport } from '../src/profile';
import type { Situation } from '../src/engine/types';

const kids = [{ id: 'e1', birth: '2018-05', planned: false }, { id: 'e2', birth: '2021-04', planned: false }];
const base: Situation = { label: 'b', children: kids, periods: [] };
const stop: Situation = { label: 's', children: kids, periods: [{ parent: 'B', from: '2027-06', to: '2050-12', fraction: 0, leave: 'aucun' }] };

const setup = (over: Partial<BudgetSetup> = {}): BudgetSetup => ({
  startYear: 2027, priceYear: 2026, inflation: 0, ownChildcare: false,
  items: [
    { id: 'l', label: 'Prêt', category: 'Crédits', monthly: 1000, to: '2030-12', credit: true },
    { id: 'c', label: 'Courses', category: 'Courses', monthly: 800, cut: 200 },
    { id: 's', label: 'Stages', category: 'Enfants : activités et stages', monthly: 300, dropsIfParentHome: true },
  ],
  incomes: [{ id: 'i', label: 'Cours', monthlyNet: 600, monthsPerYear: 8 }],
  oneOffs: [{ id: 'o', label: 'Travaux', amount: 5000, date: '2028-04' }],
  liquid: 20000, cushion: 10000, invested: 0, investYearly: 0, investReturn: 0, investOnlyIfSurplus: true, oneCarSaving: 250, holdYears: 5,
  ...over,
});

describe('salaire par année', () => {
  it('suit l’évolution connue puis projette', () => {
    const a = { ...DEFAULT_ASSUMPTIONS, indexRate: 0.02, realWageGrowth: 0 };
    const p = { label: 'A', grossMonthlyFT: 5000, age: 40, grossByYear: { '2028': 5800, '2030': 6200 } };
    expect(grossFor(p, 2026, a)).toBe(5000);
    expect(grossFor(p, 2027, a)).toBeCloseTo(5100);
    expect(grossFor(p, 2028, a)).toBe(5800);
    expect(grossFor(p, 2029, a)).toBeCloseTo(5916);
    expect(grossFor(p, 2031, a)).toBeCloseTo(6324);
  });
});

describe('budget', () => {
  const rb = simulate(belgiumWallonia, DEFAULT_HOUSEHOLD, base, DEFAULT_ASSUMPTIONS);
  const rs = simulate(belgiumWallonia, DEFAULT_HOUSEHOLD, stop, DEFAULT_ASSUMPTIONS);
  it('crédits jusqu’à leur fin, stages qui tombent, revenus 8 mois sur 12', () => {
    const r = budgetYears(setup(), rs, stop, { cutLevel: 0, oneCar: false }, ['A', 'B']);
    expect(r[0].year).toBe(2027);
    expect(r[0].credits).toBe(12000);
    expect(r.find((x) => x.year === 2031)!.credits).toBe(0);
    expect(r[0].living).toBe(800 * 12 + 300 * 5); // stages jusqu'en mai 2027
    expect(r[1].living).toBe(800 * 12);
    expect(r[0].otherIncome).toBeCloseTo(600 * 8);
    expect(r[1].oneOffs).toBe(5000);
  });
  it('coupes et voiture réduisent les dépenses', () => {
    const r0 = budgetYears(setup(), rb, base, { cutLevel: 0, oneCar: false }, ['A', 'B']);
    const r1 = budgetYears(setup(), rb, base, { cutLevel: 1, oneCar: true }, ['A', 'B']);
    expect(r0[0].living - r1[0].living).toBe(200 * 12 + 250 * 12);
  });
  it('épargne nécessaire = coussin + plus grand creux cumulé', () => {
    const rows = [100, -5000, -3000, 2000, -1000].map((s, i) => ({ year: 2027 + i, surplus: s } as any));
    const h = holdFor(rows, 5, 10000, 15000);
    expect(h.drawdown).toBe(7900);
    expect(h.needed).toBe(17900);
    expect(h.lowestYear).toBe(2029);
    expect(h.breaksIn).toBe(2029);
  });
  it('le plafond de dépenses tient juste au-dessus du coussin', () => {
    const s = setup();
    const r = budgetYears(s, rs, stop, { cutLevel: 0, oneCar: false }, ['A', 'B']);
    const cap = spendingCeiling(r, 5, s.liquid, s.cushion);
    let cash = s.liquid;
    for (const y of r.slice(0, 5)) {
      cash += y.income - y.credits - y.newChildren - y.oneOffs - cap * 12 * y.priceIndex;
      expect(cash).toBeGreaterThanOrEqual(s.cushion - 12);
    }
  });
  it('un enfant à venir ajoute ses coûts estimés', () => {
    const withBaby: Situation = { ...base, children: [...kids, { id: 'p', birth: '2028-03', planned: true, birthParent: 'B' }] };
    const r = simulate(belgiumWallonia, DEFAULT_HOUSEHOLD, withBaby, DEFAULT_ASSUMPTIONS);
    expect(r.find((y) => y.year === 2028)!.parts.plannedEstimated).toBeGreaterThan(1000);
    expect(rb.find((y) => y.year === 2028)!.parts.plannedEstimated).toBe(0);
  });
  it('l’avantage enfants à charge est dans l’impôt, une seule fois', () => {
    const y = rb[1];
    expect(y.indicators.childTaxBenefit).toBeGreaterThan(1000);
    const yStop = rs.find((x) => x.year === 2028)!;
    expect(yStop.indicators.quotientGain).toBeGreaterThan(y.indicators.quotientGain);
  });
});

// Exemples synthétiques aux formats réels (aucune donnée personnelle).
const BEOBANK = [
  'Banque;Libellé Compte;RIB;Date opération;Date analyse;Libellé opération;Note personnelle;Type opération;Catégorie;SousCatégorie;Montant;Devise;Opération pointée;Tags associés',
  'Beobank;Compte Go;XXX X123XXX 45;02/11/2026;02/11/2026;Paiement Bancontact 02/11/26 15:32 Delhaize Exemple 5000 Namur Be;;Dépenses;Alimentation;Grande surface;-43,47;EUR;;',
  'Beobank;Compte Go;XXX X123XXX 45;03/11/2026;03/11/2026;Paiement Debit Mastercard Sanef - Senlis 02/11/2026 08:08;;Dépenses;Véhicule;Parking / péage;-12,10;EUR;;',
  'Beobank;Compte Go;XXX X123XXX 45;05/11/2026;05/11/2026;Virement De Employeur Salaire 2026-11;;Revenus;Salaires;Salaire;3.269,96;EUR;;',
].join('\r\n');
const CBC = [
  "Numéro de compte;Nom de la rubrique;Nom;Devise;Numéro de l'extrait;Date;Description;Valeur;Montant;Solde;crédit;débit;numéro de compte contrepartie;BIC contrepartie;Nom contrepartie;Adresse contrepartie;communication structurée;Communication libre",
  'BE00000000000001;  ;DUPONT;EUR;  0202;31/12/2025;PAIEMENT PAR BANCONTACT 31-12 30-12-2025 A 18.20 HEURES PHARMACIE CENTRALE BE5004 BOUGE AVEC CARTE DE DEBIT;31/12/2025;-8,50;100,00;;-8,50;;;;;;',
  'BE00000000000001;  ;DUPONT;EUR;  0202;30/12/2025;VIREMENT DE AXA;30/12/2025;20,00;108,50;20,00;;BE73000000000002;AXABBE22XXX;CIARA EXEMPLE;;;remboursement',
  'BE00000000000001;  ;DUPONT;EUR;  0202;29/12/2025;VIREMENT VERS BE00 0000 0000 0003;29/12/2025;-500,00;88,50;;-500,00;BE00000000000003;GEBABEBB;DUPONT;;;epargne',
].join('\r');

describe('import CSV', () => {
  it('montants et dates belges', () => {
    expect(parseAmount('-1.234,56')).toBe(-1234.56);
    expect(parseAmount('1 234,56 €')).toBe(1234.56);
    expect(parseAmount('-89.67')).toBe(-89.67);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseDate('31/12/2025')).toBe('2025-12-31');
    expect(parseDate('2026-01-05')).toBe('2026-01-05');
    expect(parseDate('05.01.26')).toBe('2026-01-05');
  });
  it('guillemets et séparateur', () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([['a', 'b'], ['x, y', '2']]);
  });
  it('Beobank', () => {
    const p = parseFile(BEOBANK, []);
    expect(p.format).toBe('Beobank');
    expect(p.rows.map((r) => r.category)).toEqual(['Courses', 'Voiture', 'Revenus']);
    expect(p.rows[2].amount).toBe(3269.96);
  });
  it('CBC (fins de ligne \\r seul, Windows-1252), virement entre ses comptes', () => {
    const bytes = new Uint8Array([...CBC].map((c) => (c === 'é' ? 0xe9 : c.charCodeAt(0))));
    const text = decode(bytes.buffer);
    const p = parseFile(text, [], ['BE00000000000003']);
    expect(p.format).toBe('CBC / KBC');
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0].counterparty).toBe('PHARMACIE CENTRALE');
    expect(p.rows[0].category).toBe('Santé');
    expect(p.rows[1].category).not.toBe('Assurances'); // le BIC « AXABBE22 » ne fait pas une assurance
    expect(p.rows[2].category).toBe('Épargne et virements internes');
  });
  it('format générique avec nos catégories', () => {
    const p = parseFile('date;libelle;montant;categorie\n02/11/2026;Boulanger du coin;-5,20;Courses\n03/11/2026;Truc;-10;Babysitting', []);
    expect(p.format).toBe('Générique');
    expect(p.rows.map((r) => r.category)).toEqual(['Courses', 'Babysitting']);
  });
  it('règles de l’utilisateur prioritaires, sans accents ni majuscules', () => {
    expect(classify('VIREMENT VERS MARIE BABYSITTER', -40, undefined, [{ pattern: 'marie babysitter', category: 'Babysitting' }]).category).toBe('Babysitting');
    expect(classify('Crèche Les Petits', -900, undefined, []).category).toBe('Crèche et garde');
  });
  it('fichiers qui se recouvrent : pas de doublon, mais deux paiements identiques le même jour restent', () => {
    const f = 'date;libelle;montant\n01/10/2026;Stage;-140\n01/10/2026;Stage;-140\n02/10/2026;Delhaize;-30';
    const a = parseFile(f, []).rows;
    expect(a).toHaveLength(2 + 1);
    const m = merge(a, parseFile(f, []).rows);
    expect(m.added).toBe(0);
    expect(m.all).toHaveLength(3);
  });
  it('moyennes par mois complets, hors exceptionnel', () => {
    const rows = parseFile('date;libelle;montant\n01/10/2026;Delhaize;-300\n15/10/2026;Travaux;-5000\n31/10/2026;Delhaize;-100\n01/11/2026;Delhaize;-200\n30/11/2026;Delhaize;-200', []).rows;
    rows.find((r) => r.text === 'Travaux')!.exceptional = true;
    const s = summarize(rows);
    expect(s.months).toEqual(['2026-10', '2026-11']);
    expect(s.cats.find((c) => c.category === 'Courses')!.monthly).toBe(400);
  });
});

describe('profils', () => {
  it('l’exemple public ne contient pas de données personnelles', () => {
    const s = JSON.stringify(exampleState());
    for (const w of ['BE58', 'BE80']) expect(s).not.toContain(w);
  });
  it('import d’un ancien état et d’un export', () => {
    const old = { household: DEFAULT_HOUSEHOLD, scenarios: [] };
    expect(normalize(old).budget.items.length).toBeGreaterThan(0);
    const exp = JSON.stringify({ app: 'simulateur-famille', version: 3, name: 'X', state: exampleState(), transactions: [] });
    expect(parseImport(exp).name).toBe('X');
    expect(() => parseImport('{"a":1}')).toThrow();
  });
});
