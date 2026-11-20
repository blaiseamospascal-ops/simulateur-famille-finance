// Lecture des relevés bancaires CSV, entièrement dans le navigateur.
// Formats reconnus : Beobank, CBC/KBC (français et néerlandais), et tout CSV dont les en-têtes
// contiennent une date, un montant (ou débit/crédit) et un libellé (format générique, voir FORMATS.md).
import { classify, compactIban, NON_EXPENSE, type Rule } from './categories';

export interface Tx {
  /** Identifiant stable : date + montant + libellé (+ rang si plusieurs opérations identiques le même jour). */
  id: string;
  date: string; // AAAA-MM-JJ
  amount: number; // négatif = dépense
  text: string;
  counterparty: string;
  account: string;
  bank: string;
  bankCategory?: string;
  category: string;
  by: string;
  /** Dépense exceptionnelle, exclue des moyennes mensuelles. */
  exceptional?: boolean;
  /** Catégorie corrigée à la main. */
  manual?: boolean;
}

export interface ParsedFile {
  format: string;
  rows: Tx[];
  skipped: number;
  warnings: string[];
}

/** Décode un fichier : UTF-8 si valide, sinon Windows-1252 (exports Beobank et CBC). */
export function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Découpe un CSV (guillemets, séparateur détecté, fins de ligne \r\n, \n ou \r seul). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const sample = text.slice(0, 5000);
  const d = delimiter ?? ([';', '\t', ','] as const).map((c) => [c, sample.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"' && field.trim() === '') {
      q = true;
      field = '';
    } else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Montant belge ou international : « -1.234,56 », « 1 234,56 », « -89.67 », « 1,234.56 ». */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? '').replace(/[\s €]|EUR/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

/** Date en AAAA-MM-JJ : JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ/MM/AA, AAAA-MM-JJ, AAAAMMJJ. */
export function parseDate(raw: string): string | null {
  const s = (raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const N = (s: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\uFFFD/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Colonnes d'un format : index dans la ligne d'en-tête. */
export interface Mapping {
  date: number;
  amount?: number;
  debit?: number;
  credit?: number;
  text: number[];
  counterparty?: number;
  account?: number;
  category?: number[];
}

// Alias d'en-têtes, après normalisation (minuscules, sans accents ni ponctuation).
const ALIASES = {
  date: ['date operation', 'date', 'date comptable', 'date de comptabilisation', 'date d execution', 'date execution', 'datum', 'boekingsdatum', 'uitvoeringsdatum', 'booking date', 'transaction date', 'date valeur', 'valuta', 'value date'],
  amount: ['montant', 'bedrag', 'amount', 'montant eur', 'montant en eur', 'somme'],
  debit: ['debit', 'debet', 'sortie', 'uitgaven'],
  credit: ['credit', 'entree', 'inkomsten'],
  text: ['libelle operation', 'libelle', 'libelles', 'description', 'omschrijving', 'details', 'details du mouvement', 'communication', 'communication libre', 'communications', 'vrije mededeling', 'mededeling', 'message', 'transaction', 'type de transaction', 'memo', 'note personnelle'],
  counterparty: ['nom contrepartie', 'nom de la contrepartie', 'contrepartie', 'naam tegenpartij', 'tegenpartij', 'beneficiaire', 'payee', 'counterparty', 'nom contrepartie contient'],
  account: ['numero de compte', 'rekeningnummer', 'compte', 'rib', 'iban', 'account'],
  category: ['categorie', 'souscategorie', 'sous categorie', 'category', 'categorie bancaire'],
};

function findCol(h: string[], names: string[], exclude: number[] = []): number {
  for (const n of names) {
    const i = h.findIndex((x, k) => x === n && !exclude.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

/** Détecte la ligne d'en-tête et les colonnes. Renvoie null si le fichier n'a pas de date et de montant reconnaissables. */
export function detect(rows: string[][]): { header: number; map: Mapping; format: string } | null {
  for (let hi = 0; hi < Math.min(rows.length, 20); hi++) {
    const h = rows[hi].map(N);
    const date = findCol(h, ALIASES.date);
    const amount = findCol(h, ALIASES.amount);
    const debit = findCol(h, ALIASES.debit);
    const credit = findCol(h, ALIASES.credit);
    if (date < 0 || (amount < 0 && (debit < 0 || credit < 0))) continue;
    const text: number[] = [];
    for (const n of ALIASES.text) {
      const i = h.indexOf(n);
      if (i >= 0 && !text.includes(i)) text.push(i);
    }
    const category = ALIASES.category.map((n) => h.indexOf(n)).filter((i) => i >= 0);
    const map: Mapping = {
      date,
      amount: amount >= 0 ? amount : undefined,
      debit: amount < 0 ? debit : undefined,
      credit: amount < 0 ? credit : undefined,
      text,
      counterparty: findCol(h, ALIASES.counterparty) >= 0 ? findCol(h, ALIASES.counterparty) : undefined,
      account: findCol(h, ALIASES.account) >= 0 ? findCol(h, ALIASES.account) : undefined,
      category: category.length ? [...new Set(category)] : undefined,
    };
    const has = (...names: string[]) => names.every((n) => h.includes(n));
    const format = has('libelle operation', 'souscategorie')
      ? 'Beobank'
      : has('nom de la rubrique', 'nom contrepartie') || has('rubrieknaam', 'naam tegenpartij')
        ? 'CBC / KBC'
        : 'Générique';
    return { header: hi, map, format };
  }
  return null;
}

const cell = (r: string[], i?: number) => (i === undefined || i < 0 ? '' : (r[i] ?? '').replace(/\s+/g, ' ').trim());

/** Grosse dépense ponctuelle proposée comme exceptionnelle (modifiable) : plus de 1 500 € hors crédits, loyer, crèche et épargne. */
export const isExceptional = (amount: number, category: string) =>
  amount <= -1500 && !['Crédits', 'Loyer', 'Crèche et garde', 'Épargne et virements internes'].includes(category);

/** Contrepartie lisible à partir du libellé quand la banque ne la donne pas (Beobank). */
export function guessCounterparty(text: string): string {
  // CBC / KBC : « PAIEMENT PAR BANCONTACT 16-11 16-11-2026 A 12.22 HEURES COMMERÇANT BE1435 VILLE AVEC CARTE… »
  const card = text.match(/HEURES\s+(.+?)(?:\s+AVEC CARTE|\s+MET KAART|$)/i);
  if (card) return card[1].replace(/\s+[A-Z]{2}\d{4,5}\s.*$/, '').trim().slice(0, 60);
  const sdd = text.match(/CREANCIER\s*:\s*(.+?)\s+REF\./i);
  if (sdd) return sdd[1].trim().slice(0, 60);
  let t = text
    .replace(/^(paiement (bancontact|debit mastercard|maestro|visa)|retrait bancontact|domiciliation( pour sepa)?|virement (instantane )?(vers|de)|ordre permanent vers)\s*/i, '')
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}( \d{2}:\d{2})?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, 60);
}

export function toTransactions(rows: string[][], map: Mapping, header: number, bank: string, rules: Rule[], own: string[] = []): { rows: Tx[]; skipped: number } {
  const out: Tx[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();
  for (const r of rows.slice(header + 1)) {
    const date = parseDate(cell(r, map.date));
    let amount: number | null = null;
    if (map.amount !== undefined) amount = parseAmount(cell(r, map.amount));
    else {
      const d = parseAmount(cell(r, map.debit));
      const c = parseAmount(cell(r, map.credit));
      if (d !== null || c !== null) amount = (c ?? 0) - Math.abs(d ?? 0);
    }
    if (!date || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    const text = [...new Set(map.text.map((i) => cell(r, i)).filter(Boolean))].join(' · ');
    const counterparty = cell(r, map.counterparty) || guessCounterparty(text);
    const bankCategory = map.category?.map((i) => cell(r, i)).filter(Boolean).join(' / ') || undefined;
    const base = `${date}|${amount.toFixed(2)}|${text.slice(0, 120)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const c = classify(`${text} ${counterparty}`, amount, bankCategory, rules, own);
    out.push({ id: `${base}|${n}`, date, amount, text, counterparty, account: cell(r, map.account), bank, bankCategory, category: c.category, by: c.by, exceptional: isExceptional(amount, c.category) || undefined });
  }
  return { rows: out, skipped };
}

export function parseFile(text: string, rules: Rule[], own: string[] = []): ParsedFile {
  const rows = parseCsv(text);
  const det = detect(rows);
  if (!det) return { format: 'inconnu', rows: [], skipped: rows.length, warnings: ['Colonnes de date et de montant introuvables. Utilisez le format générique : date;libelle;montant.'] };
  const { rows: tx, skipped } = toTransactions(rows, det.map, det.header, det.format === 'Générique' ? 'Autre banque' : det.format, rules, own);
  const warnings: string[] = [];
  if (!det.map.text.length) warnings.push('Aucune colonne de libellé reconnue : le classement automatique sera moins bon.');
  return { format: det.format, rows: tx, skipped, warnings };
}

/**
 * Fusionne un nouveau fichier avec les opérations déjà importées. Une opération identique déjà présente
 * (même date, montant, libellé et rang dans la journée) n'est pas ajoutée deux fois : on peut réimporter
 * des relevés qui se recouvrent. Deux paiements identiques le même jour dans un même fichier sont gardés.
 */
export function merge(existing: Tx[], incoming: Tx[]): { all: Tx[]; added: number; duplicates: number } {
  const ids = new Set(existing.map((t) => t.id));
  const fresh = incoming.filter((t) => !ids.has(t.id));
  const all = [...existing, ...fresh].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { all, added: fresh.length, duplicates: incoming.length - fresh.length };
}

export function reclassify(txs: Tx[], rules: Rule[], own: string[] = []): Tx[] {
  return txs.map((t) => {
    if (t.manual) return t;
    const c = classify(`${t.text} ${t.counterparty}`, t.amount, t.bankCategory, rules, own);
    return { ...t, category: c.category, by: c.by };
  });
}

export interface CategorySummary {
  category: string;
  total: number;
  monthly: number;
  count: number;
  exceptional: number;
}

/** Mois complets couverts par les opérations (le premier et le dernier mois partiels sont exclus s'il en reste au moins un). */
export function fullMonths(txs: Tx[]): string[] {
  if (!txs.length) return [];
  // Plusieurs banques : seulement les mois couverts par toutes, sinon les moyennes seraient diluées.
  const banks = [...new Set(txs.map((t) => `${t.bank}|${t.account}`))];
  if (banks.length > 1) {
    const sets = banks.map((b) => new Set(fullMonths(txs.filter((t) => `${t.bank}|${t.account}` === b))));
    const common = [...sets[0]].filter((m) => sets.every((s) => s.has(m))).sort();
    if (common.length) return common;
  }
  const dates = txs.map((t) => t.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const months: string[] = [];
  let [y, m] = first.slice(0, 7).split('-').map(Number);
  const [ly, lm] = last.slice(0, 7).split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  const full = months.filter((mo, i) => !((i === 0 && first.slice(8) > '05') || (i === months.length - 1 && Number(last.slice(8)) < 25)));
  return full.length ? full : months;
}

/** Dépenses moyennes par mois et par catégorie, sur les mois complets, hors exceptionnel et hors épargne. */
export function summarize(txs: Tx[], months = fullMonths(txs)): { months: string[]; cats: CategorySummary[]; income: number; spending: number } {
  const set = new Set(months);
  const by = new Map<string, CategorySummary>();
  let income = 0;
  for (const t of txs) {
    if (!set.has(t.date.slice(0, 7))) continue;
    if (t.category === 'Revenus') {
      income += t.amount;
      continue;
    }
    if (NON_EXPENSE.has(t.category)) continue;
    const s = by.get(t.category) ?? { category: t.category, total: 0, monthly: 0, count: 0, exceptional: 0 };
    if (t.exceptional) s.exceptional += -t.amount;
    else {
      s.total += -t.amount;
      s.count++;
    }
    by.set(t.category, s);
  }
  const n = Math.max(1, months.length);
  const cats = [...by.values()].map((s) => ({ ...s, monthly: s.total / n })).sort((a, b) => b.monthly - a.monthly);
  return { months, cats, income: income / n, spending: cats.reduce((a, c) => a + c.monthly, 0) };
}

/** Export CSV générique (le même format que l'import générique), pour un tableur. */
export function toGenericCsv(txs: Tx[]): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['date;libelle;montant;categorie;contrepartie;banque;exceptionnel'];
  for (const t of txs) lines.push([t.date, esc(t.text), t.amount.toFixed(2).replace('.', ','), esc(t.category), esc(t.counterparty), esc(t.bank), t.exceptional ? 'oui' : ''].join(';'));
  return lines.join('\r\n');
}

/** IBAN complets trouvés dans la colonne « compte » des relevés : vos propres comptes. */
export function ownIbans(txs: Tx[]): string[] {
  return [...new Set(txs.map((t) => compactIban(t.account)).filter((a) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(a)))];
}
