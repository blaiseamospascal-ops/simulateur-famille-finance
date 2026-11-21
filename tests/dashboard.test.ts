import { describe, expect, it } from 'vitest';
import type { Tx } from '../src/import/csv';
import { parseFile } from '../src/import/csv';
import { byMerchant, coverage, defaultDashSettings, detectRecurring, isKid, merchant, monthRows, natureOf, normalizeDash, superfluRate, totals } from '../src/import/dashboard';
import { ruleFromTx } from '../src/import/files';
import { normalize } from '../src/profile';

// Ménage fictif : aucune donnée réelle.
let n = 0;
const tx = (date: string, amount: number, counterparty: string, category: string, extra: Partial<Tx> = {}): Tx => ({
  id: `${n++}`, date, amount, text: counterparty, counterparty, account: 'BE00', bank: 'Banque', category, by: 'mot-clé', ...extra,
});
const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const sample = (): Tx[] => [
  ...months.flatMap((m, i) => [
    tx(`${m}-25`, 3000, 'EMPLOYEUR FICTIF SA', 'Revenus'),
    tx(`${m}-10`, 450, 'CAMILLE', 'Revenus'),
    tx(`${m}-02`, -1200, 'ECH PRET 123', 'Crédits'),
    tx(`${m}-05`, -12.99, 'NETFLIX.COM', 'Abonnements et télécom'),
    tx(`${m}-03`, -90 - i * 7, 'AD Delhaize Bouge 5004 Namur BE', 'Courses'),
    tx(`${m}-17`, -60 + i * 3, 'PAIEMENT PAR BANCONTACT DELHAIZE JAMBES', 'Courses'),
    tx(`${m}-12`, -400, 'Creche Les Lutins', 'Crèche et garde'),
    tx(`${m}-20`, -55, 'Restaurant Le Fictif', 'Restaurants et sorties'),
  ]),
  tx('2026-03-14', -80, 'Okaidi Namur', 'Vêtements'),
  tx('2026-04-14', 120, 'REMBOURSEMENT VENTE', 'Revenus'),
  tx('2026-05-01', -2500, 'Garage Fictif', 'Voiture', { exceptional: true }),
  tx('2026-05-08', -40, 'Retrait Bancontact', "Retraits d'espèces"),
  tx('2026-02-15', -300, 'Vers votre compte épargne', 'Épargne et virements internes'),
];

describe('commerçants', () => {
  it('regroupe les magasins d’une enseigne et nettoie les libellés', () => {
    expect(merchant({ counterparty: 'AD Delhaize Bouge 5004 Namur BE', text: '' }).label).toBe('Delhaize');
    expect(merchant({ counterparty: 'PARKING LLN BE1348 LOUVAIN LA NE', text: '' }).label).toBe('Parking Lln');
    expect(merchant({ counterparty: 'Virement vers Dupont Jean', text: '' }).key).toBe(merchant({ counterparty: 'DUPONT JEAN', text: '' }).key);
    const m = byMerchant(sample(), defaultDashSettings());
    expect(m[0].label).toBe('Ech Pret');
    const d = m.find((x) => x.label === 'Delhaize')!;
    expect(d.count).toBe(12);
    expect(d.category).toBe('Courses');
  });
});

describe('récurrences', () => {
  it('détecte crédit, abonnement, crèche et revenus réguliers, pas les courses', () => {
    const r = detectRecurring(sample());
    const labels = r.map((x) => x.label);
    expect(labels).toContain('Ech Pret');
    expect(labels).toContain('Netflix');
    expect(labels).toContain('Creche Les Lutins');
    expect(labels).toContain('Employeur Fictif');
    expect(labels).not.toContain('Delhaize');
    expect(r.find((x) => x.label === 'Netflix')!.monthly).toBeCloseTo(12.99);
  });
  it('signale une hausse et un paiement arrêté', () => {
    const t = sample().filter((x) => x.counterparty !== 'NETFLIX.COM');
    t.push(...['2026-01', '2026-02', '2026-03'].map((m) => tx(`${m}-08`, -30, 'Salle de sport', 'Loisirs')));
    t.push(...months.map((m, i) => tx(`${m}-09`, i === 5 ? -55 : -50, 'Assureur fictif', 'Assurances')));
    const r = detectRecurring(t);
    expect(r.find((x) => x.label === 'Salle De Sport')!.active).toBe(false);
    expect(r.find((x) => x.label === 'Assureur Fictif')!.change).toBeCloseTo(0.1);
  });
  it('détecte un paiement annuel', () => {
    const r = detectRecurring([tx('2025-03-10', -380, 'Taxe fictive', 'Impôts et taxes'), tx('2026-03-12', -385, 'Taxe fictive', 'Impôts et taxes'), tx('2026-06-01', -5, 'x', 'Divers')]);
    expect(r[0].frequency).toBe('annuel');
    expect(r[0].monthly).toBeCloseTo(382.5 / 12);
  });
  it('écarte un groupe choisi par l’utilisateur', () => {
    const s = { ...defaultDashSettings(), notRecurring: ['-1|netflix'] };
    expect(detectRecurring(sample(), s).map((x) => x.label)).not.toContain('Netflix');
  });
});

describe('agrégats mensuels', () => {
  const s = defaultDashSettings();
  const rows = monthRows(sample(), s);
  it('sépare revenus réguliers et ponctuels, compte les allocations', () => {
    const apr = rows.find((r) => r.month === '2026-04')!;
    expect(apr.income).toBe(3570);
    expect(apr.incomeRegular).toBe(3450);
    expect(apr.incomeOneOff).toBe(120);
    expect(apr.allowances).toBe(450);
  });
  it('utile, optionnel, à qualifier, exceptionnel exclu, épargne à part', () => {
    const may = rows.find((r) => r.month === '2026-05')!;
    expect(may.exceptional).toBe(2500);
    expect(may.unknown).toBe(40);
    expect(may.optionnel).toBeCloseTo(12.99 + 55); // Netflix est optionnel malgré sa catégorie
    expect(may.spend).toBeCloseTo(may.utile + may.optionnel + may.unknown);
    expect(rows.find((r) => r.month === '2026-02')!.saved).toBe(300);
    const withEx = monthRows(sample(), s, { includeExceptional: true }).find((r) => r.month === '2026-05')!;
    expect(withEx.spend - may.spend).toBe(2500);
  });
  it('coût des enfants : direct + part estimée', () => {
    const mar = rows.find((r) => r.month === '2026-03')!;
    expect(mar.kidsDirect).toBe(400 + 80); // crèche + Okaïdi
    const courses = (90 + 14) + (60 - 6);
    expect(mar.kidsEstimated).toBeCloseTo(courses * 0.3);
  });
  it('taux de superflu', () => {
    const t = totals(rows);
    expect(t.months).toBe(6);
    expect(superfluRate(t)).toBeCloseTo(t.optionnel / (t.utile + t.optionnel));
    expect(superfluRate({ utile: 0, optionnel: 0 })).toBe(0);
  });
});

describe('choix de l’utilisateur', () => {
  it('opération > commerçant > catégorie > défaut', () => {
    const t = tx('2026-01-01', -20, 'Restaurant Le Fictif', 'Restaurants et sorties');
    const s = defaultDashSettings();
    expect(natureOf(t, s)).toBe('optionnel');
    s.categoryNature['Restaurants et sorties'] = 'utile';
    expect(natureOf(t, s)).toBe('utile');
    s.merchantNature[merchant(t).key] = 'optionnel';
    expect(natureOf(t, s)).toBe('optionnel');
    expect(natureOf({ ...t, nature: 'utile' }, s)).toBe('utile');
    expect(isKid(t, s)).toBe(false);
    s.kidMerchant[merchant(t).key] = true;
    expect(isKid(t, s)).toBe(true);
  });
  it('règle mémorisée depuis une opération', () => {
    expect(ruleFromTx(tx('2026-01-01', -20, 'Boulangerie Du Coin 12', 'À classer'), 'Courses')).toEqual({ pattern: 'boulangerie du coin', category: 'Courses', sign: -1 });
  });
  it('réglages complétés pour un ancien profil', () => {
    const st = normalize({ rules: [] });
    expect(st.dash.kidsShare).toBe(0.3);
    expect(normalizeDash({ kidsShare: 4 }).kidsShare).toBe(1);
  });
});

describe('couverture des relevés', () => {
  it('compte les opérations par compte et par mois', () => {
    const csv = 'date;libelle;montant\n02/03/2026;A;-1\n28/03/2026;B;-2\n10/04/2026;C;-3\n';
    const c = coverage(parseFile(csv, []).rows);
    expect(c.accounts).toHaveLength(1);
    const mar = c.cells.get(`${c.accounts[0].id}|2026-03`)!;
    expect([mar.ops, mar.firstDay, mar.lastDay]).toEqual([2, 2, 28]);
  });
});
