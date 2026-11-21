// Tableau de bord des dépenses : agrégats mois par mois, commerçants, dépenses récurrentes,
// utiles ou optionnelles, coût des enfants, revenus réguliers ou ponctuels.
// Pur (aucun accès au navigateur) : testable isolément. Aucune donnée personnelle ici.
import { NON_EXPENSE, norm } from './categories';
import type { Tx } from './csv';

export type Nature = 'utile' | 'optionnel';
export type IncomeKind = 'regulier' | 'ponctuel';

/** Réglages du tableau de bord, gardés dans le profil (donc dans le navigateur). */
export interface DashSettings {
  /** Nature choisie par l'utilisateur pour une catégorie ('' = revenir au défaut). */
  categoryNature: Record<string, Nature | ''>;
  /** Nature choisie pour un commerçant (clé de `merchantKey`). */
  merchantNature: Record<string, Nature>;
  /** Commerçants dont les dépenses sont des dépenses pour les enfants (oui) ou pas (non). */
  kidMerchant: Record<string, boolean>;
  /** Part des enfants dans les courses, vêtements et santé non marqués (estimation, 0 à 1). */
  kidsShare: number;
  /** Revenu forcé régulier ou ponctuel, par commerçant/émetteur. */
  incomeKind: Record<string, IncomeKind>;
  /** Groupes écartés de la liste des dépenses récurrentes. */
  notRecurring: string[];
}

export const defaultDashSettings = (): DashSettings => ({ categoryNature: {}, merchantNature: {}, kidMerchant: {}, kidsShare: 0.3, incomeKind: {}, notRecurring: [] });

export function normalizeDash(raw: Partial<DashSettings> | undefined): DashSettings {
  const d = defaultDashSettings();
  return {
    categoryNature: { ...(raw?.categoryNature ?? {}) },
    merchantNature: { ...(raw?.merchantNature ?? {}) },
    kidMerchant: { ...(raw?.kidMerchant ?? {}) },
    kidsShare: typeof raw?.kidsShare === 'number' ? Math.min(1, Math.max(0, raw.kidsShare)) : d.kidsShare,
    incomeKind: { ...(raw?.incomeKind ?? {}) },
    notRecurring: [...(raw?.notRecurring ?? [])],
  };
}

/** Nature par défaut des catégories. Absente = à qualifier (espèces, divers, à classer). */
export const DEFAULT_NATURE: Record<string, Nature> = {
  Courses: 'utile',
  'Crèche et garde': 'utile',
  École: 'utile',
  'Enfants : activités et stages': 'utile',
  Voiture: 'utile',
  'Transports en commun': 'utile',
  Vêtements: 'utile',
  Santé: 'utile',
  Assurances: 'utile',
  'Énergie et eau': 'utile',
  'Chauffage (mazout, pellets)': 'utile',
  'Abonnements et télécom': 'utile',
  Crédits: 'utile',
  Loyer: 'utile',
  'Impôts et taxes': 'utile',
  'Coiffure et soins': 'utile',
  'Restaurants et sorties': 'optionnel',
  'Vacances et voyages': 'optionnel',
  Loisirs: 'optionnel',
  'Cadeaux et fêtes': 'optionnel',
  Babysitting: 'optionnel',
  'Maison et bricolage': 'optionnel',
  Dons: 'optionnel',
};

/** Services de divertissement : optionnels même rangés dans « Abonnements et télécom ». */
const OPTIONAL_WORDS = ['netflix', 'spotify', 'disney', 'streamz', 'deezer', 'youtube', 'amazon prime', 'apple music', 'playstation', 'nintendo', 'xbox', 'canal+', 'hbo'];

/** Catégories entièrement consacrées aux enfants. */
export const KID_CATEGORIES = new Set(['Crèche et garde', 'École', 'Enfants : activités et stages', 'Babysitting']);
/** Enseignes ou mots qui désignent une dépense pour les enfants. */
const KID_WORDS = ['okaidi', 'vertbaudet', 'sergent major', 'jacadi', 'petit bateau', 'du pareil au meme', 'dpam', 'catimini', 'tape a l oeil', 'orchestra', 'bel&bo kids', 'dreamland', 'king jouet', 'maxi toys', 'intertoys', 'jouet', 'pediatre', 'pampers', 'aubert', 'bebe', 'baby'];
/** Parts du budget où les enfants ont une quote-part estimée. */
export const SHARED_KID_CATEGORIES = new Set(['Courses', 'Vêtements', 'Santé']);
/** Allocations familiales (caisses wallonnes, bruxelloises et flamandes). */
const FAMILY_ALLOWANCE = ['allocations familiales', 'famiwal', 'parentia', 'camille', 'kidslife', 'infino', 'groeipakket', 'fons', 'brupartners', 'myfamily'];

// ---------------- Commerçants ----------------

/** Enseignes : un seul nom quel que soit le magasin (« AD Delhaize Salzinnes 5000 Namur » → « Delhaize »). */
const BRANDS: [string, string][] = [
  ['delhaize', 'Delhaize'], ['colruyt', 'Colruyt'], ['okay ', 'Okay'], ['bio-planet', 'Bio-Planet'], ['carrefour', 'Carrefour'], ['aldi', 'Aldi'], ['lidl', 'Lidl'],
  ['intermarche', 'Intermarché'], ['cora ', 'Cora'], ['spar ', 'Spar'], ['albert heijn', 'Albert Heijn'], ['match ', 'Match'], ['leclerc', 'Leclerc'], ['hellofresh', 'HelloFresh'],
  ['ikea', 'IKEA'], ['brico', 'Brico'], ['hubo', 'Hubo'], ['gamma', 'Gamma'], ['action ', 'Action'], ['hema', 'HEMA'], ['blokker', 'Blokker'], ['trafic', 'Trafic'], ['casa ', 'Casa'],
  ['mediamarkt', 'MediaMarkt'], ['krefel', 'Krëfel'], ['vanden borre', 'Vanden Borre'], ['coolblue', 'Coolblue'], ['fnac', 'Fnac'], ['bol.com', 'bol.com'], ['amazon', 'Amazon'],
  ['decathlon', 'Decathlon'], ['zara', 'Zara'], ['h&m', 'H&M'], ['primark', 'Primark'], ['c&a', 'C&A'], ['kiabi', 'Kiabi'], ['jbc', 'JBC'], ['zeb', 'ZEB'], ['vinted', 'Vinted'], ['zalando', 'Zalando'],
  ['okaidi', 'Okaïdi'], ['vertbaudet', 'Vertbaudet'], ['torfs', 'Torfs'], ['kruidvat', 'Kruidvat'], ['di ', 'Di'], ['ici paris', 'ICI Paris XL'], ['dreamland', 'Dreamland'],
  ['proximus', 'Proximus'], ['orange', 'Orange'], ['telenet', 'Telenet'], ['voo', 'VOO'], ['scarlet', 'Scarlet'], ['mobile vikings', 'Mobile Vikings'],
  ['netflix', 'Netflix'], ['spotify', 'Spotify'], ['disney', 'Disney+'], ['streamz', 'Streamz'], ['apple.com', 'Apple'], ['google', 'Google'], ['youtube', 'YouTube'],
  ['engie', 'Engie'], ['luminus', 'Luminus'], ['totalenergies', 'TotalEnergies'], ['eneco', 'Eneco'], ['mega ', 'Mega'], ['swde', 'SWDE'], ['societe wallonne des ea', 'SWDE'],
  ['shell', 'Shell'], ['esso', 'Esso'], ['q8', 'Q8'], ['lukoil', 'Lukoil'], ['texaco', 'Texaco'], ['dats 24', 'DATS 24'], ['maes ', 'Maes'],
  ['sncb', 'SNCB'], ['nmbs', 'SNCB'], ['stib', 'STIB'], ['de lijn', 'De Lijn'],
  ['mcdonald', "McDonald's"], ['quick ', 'Quick'], ['exki', 'Exki'], ['panos', 'Panos'], ['deliveroo', 'Deliveroo'], ['uber eats', 'Uber Eats'], ['takeaway', 'Takeaway'], ['kinepolis', 'Kinepolis'],
  ['ethias', 'Ethias'], ['ag insurance', 'AG Insurance'], ['axa ', 'AXA'], ['allianz', 'Allianz'], ['baloise', 'Baloise'], ['yuzzu', 'Yuzzu'], ['dkv', 'DKV'],
  ['partenamut', 'Partenamut'], ['solidaris', 'Solidaris'], ['mutualite chretienne', 'Mutualité chrétienne'], ['famiwal', 'Famiwal'], ['parentia', 'Parentia'], ['camille', 'Camille'], ['kidslife', 'Kidslife'], ['infino', 'Infino'],
  ['airbnb', 'Airbnb'], ['booking.com', 'Booking.com'], ['ryanair', 'Ryanair'], ['brussels airlines', 'Brussels Airlines'], ['tui', 'TUI'],
  ['basic-fit', 'Basic-Fit'], ['pairi daiza', 'Pairi Daiza'], ['walibi', 'Walibi'], ['batopin', 'Retrait Batopin'], ['bancontact cash', 'Retrait Bancontact'],
];

const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Clé stable d'un commerçant (minuscules) et nom affiché. */
export function merchant(t: Pick<Tx, 'counterparty' | 'text'> & { category?: string }): { key: string; label: string } {
  if (t.category === "Retraits d'espèces") return { key: 'retraits d especes', label: "Retraits d'espèces" };
  const raw = (t.counterparty || t.text || '')
    .trim()
    .replace(/^(virement( instantane| europeen| sepa)?|ordre permanent|domiciliation|paiement)\s+(de|vers|a|en faveur de)?\s*/i, '');
  const n = ` ${norm(`${raw}`)} `;
  for (const [p, label] of BRANDS) if (n.includes(p.trim().length <= 3 ? ` ${p.trim()} ` : p)) return { key: label.toLowerCase(), label };
  let s = raw
    .replace(/\b[A-Z]{2}\d{4,5}\b.*$/i, '') // « BE1348 LOUVAIN LA NE » (CBC)
    .replace(/\s\d{4,5}\s.*$/, '') // « 5000 Namur Be » (Beobank)
    .replace(/\b(sa|nv|bv|srl|sprl|bvba|sas|sarl|scrl|asbl|vzw|gmbh|ltd|inc)\b\.?/gi, '')
    .replace(/[*#/_:;,()]|\s-\s|\s-$|\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.split(' ').filter((w) => /\p{L}/u.test(w)).slice(0, 3).join(' ');
  if (!s) s = raw.slice(0, 30) || 'Sans libellé';
  return { key: norm(s).trim(), label: title(s) };
}

// ---------------- Qualification d'une opération ----------------

export const isSpending = (t: Tx) => !NON_EXPENSE.has(t.category);
export const isIncome = (t: Tx) => t.category === 'Revenus';

export function natureOf(t: Tx, s: DashSettings, key = merchant(t).key): Nature | undefined {
  if (t.nature) return t.nature;
  if (s.merchantNature[key]) return s.merchantNature[key];
  const c = s.categoryNature[t.category];
  if (c) return c;
  const txt = norm(`${t.text} ${t.counterparty}`);
  if (OPTIONAL_WORDS.some((w) => txt.includes(w))) return 'optionnel';
  return DEFAULT_NATURE[t.category];
}

export function isKid(t: Tx, s: DashSettings, key = merchant(t).key): boolean {
  if (t.kid !== undefined) return t.kid;
  if (s.kidMerchant[key] !== undefined) return s.kidMerchant[key];
  if (KID_CATEGORIES.has(t.category)) return true;
  const txt = norm(`${t.text} ${t.counterparty}`);
  return KID_WORDS.some((w) => txt.includes(w));
}

export const isFamilyAllowance = (t: Tx) => t.amount > 0 && FAMILY_ALLOWANCE.some((w) => norm(`${t.text} ${t.counterparty}`).includes(w));

// ---------------- Récurrences ----------------

export type Frequency = 'mensuel' | 'trimestriel' | 'annuel';
export interface Recurring {
  key: string;
  label: string;
  category: string;
  /** -1 dépense, +1 revenu. */
  sign: -1 | 1;
  frequency: Frequency;
  /** Montant habituel (médiane, positif). */
  amount: number;
  /** Équivalent mensuel (positif). */
  monthly: number;
  count: number;
  first: string;
  last: string;
  lastAmount: number;
  /** Dernier montant comparé au montant habituel des précédents (0,05 = +5 %). */
  change: number;
  /** Toujours en cours à la date du dernier relevé. */
  active: boolean;
  /** Apparue dans les deux derniers mois. */
  isNew: boolean;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/**
 * Dépenses et revenus récurrents : même commerçant, montant stable, rythme mensuel, trimestriel ou annuel.
 * Les courses au même magasin (montants très variables) ne sont pas des récurrences.
 */
export function detectRecurring(txs: Tx[], s: DashSettings = defaultDashSettings()): Recurring[] {
  if (!txs.length) return [];
  const lastDate = txs.reduce((m, t) => (t.date > m ? t.date : m), txs[0].date);
  const groups = new Map<string, { label: string; sign: -1 | 1; items: Tx[] }>();
  for (const t of txs) {
    if (t.category === 'Épargne et virements internes') continue;
    const income = isIncome(t);
    if (!income && t.amount > 0) continue; // remboursement
    const sign: -1 | 1 = income ? 1 : -1;
    const m = merchant(t);
    const k = `${sign}|${m.key}`;
    const g = groups.get(k) ?? { label: m.label, sign, items: [] };
    g.items.push(t);
    groups.set(k, g);
  }
  const out: Recurring[] = [];
  for (const [k, g] of groups) {
    if (s.notRecurring.includes(k)) continue;
    const items = g.items.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (items.length < 2) continue;
    // Plusieurs paiements le même mois au même bénéficiaire (deux enfants à l'école…) : additionnés.
    const byMonth = new Map<string, { date: string; amount: number }>();
    for (const t of items) {
      const mo = t.date.slice(0, 7);
      const e = byMonth.get(mo) ?? { date: t.date, amount: 0 };
      e.amount += Math.abs(t.amount);
      byMonth.set(mo, e);
    }
    const pts = [...byMonth.values()];
    const amounts = pts.map((p) => p.amount);
    const med = median(amounts);
    if (med < 1) continue;
    const tol = g.sign > 0 ? 0.35 : 0.2;
    const stable = amounts.filter((a) => Math.abs(a - med) <= tol * med).length / amounts.length;
    const perMonth = items.length / pts.length;
    // Dépenses : chaque paiement doit aussi être stable (deux courses par mois ne font pas une récurrence).
    // Exception : total du mois quasi identique (deux prêts chez la même banque).
    if (g.sign < 0 && perMonth > 1 && !amounts.every((a) => Math.abs(a - med) <= 0.03 * med)) {
      const each = items.map((t) => Math.abs(t.amount));
      const m1 = median(each);
      if (each.filter((a) => Math.abs(a - m1) <= 0.2 * m1).length / each.length < 0.75) continue;
    }
    const span = monthsBetween(pts[0].date, pts[pts.length - 1].date) + 1;
    const gaps = pts.slice(1).map((p, i) => days(pts[i].date, p.date));
    const gap = gaps.length ? median(gaps) : 0;
    let frequency: Frequency | null = null;
    if (pts.length >= 3 && pts.length / span >= 0.75 && gap >= 20 && gap <= 45 && stable >= (g.sign > 0 ? 0.6 : 0.75) && perMonth <= 3) frequency = 'mensuel';
    else if (pts.length >= 3 && gap >= 75 && gap <= 105 && stable >= 0.75) frequency = 'trimestriel';
    else if (pts.length >= 2 && gap >= 330 && gap <= 400 && amounts.every((a) => Math.abs(a - med) <= 0.1 * med)) frequency = 'annuel';
    if (!frequency) continue;
    const period = frequency === 'mensuel' ? 1 : frequency === 'trimestriel' ? 3 : 12;
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? median(pts.slice(Math.max(0, pts.length - 4), -1).map((p) => p.amount)) : last.amount;
    const cat = mostFrequent(items.map((t) => t.category));
    out.push({
      key: k,
      label: g.label,
      category: cat,
      sign: g.sign,
      frequency,
      amount: med,
      monthly: med / period,
      count: items.length,
      first: pts[0].date,
      last: last.date,
      lastAmount: last.amount,
      change: prev ? last.amount / prev - 1 : 0,
      active: monthsBetween(last.date, lastDate) <= period + (period === 1 ? 1 : 2),
      isNew: monthsBetween(pts[0].date, lastDate) <= 2,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

function mostFrequent(a: string[]): string {
  const m = new Map<string, number>();
  for (const x of a) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
}

// ---------------- Agrégats ----------------

export interface MonthRow {
  month: string;
  income: number;
  incomeRegular: number;
  incomeOneOff: number;
  allowances: number;
  /** Dépenses (positif), hors épargne et virements internes, hors exceptionnel sauf demande. */
  spend: number;
  utile: number;
  optionnel: number;
  /** Dépenses sans nature (espèces, divers, à classer). */
  unknown: number;
  exceptional: number;
  kidsDirect: number;
  kidsEstimated: number;
  /** Mis de côté (épargne, placements), net. */
  saved: number;
  byCat: Record<string, number>;
  ops: number;
}

export interface DashOptions {
  includeExceptional?: boolean;
}

/** Groupes de revenus réguliers : récurrences de revenus + choix de l'utilisateur. */
export function regularIncomeKeys(rec: Recurring[], s: DashSettings): Set<string> {
  const set = new Set(rec.filter((r) => r.sign > 0).map((r) => r.key.slice(2)));
  for (const [k, v] of Object.entries(s.incomeKind)) v === 'regulier' ? set.add(k) : set.delete(k);
  return set;
}

export function monthRows(txs: Tx[], s: DashSettings, o: DashOptions = {}, rec = detectRecurring(txs, s)): MonthRow[] {
  const reg = regularIncomeKeys(rec, s);
  const rows = new Map<string, MonthRow>();
  const row = (m: string) => {
    let r = rows.get(m);
    if (!r) {
      r = { month: m, income: 0, incomeRegular: 0, incomeOneOff: 0, allowances: 0, spend: 0, utile: 0, optionnel: 0, unknown: 0, exceptional: 0, kidsDirect: 0, kidsEstimated: 0, saved: 0, byCat: {}, ops: 0 };
      rows.set(m, r);
    }
    return r;
  };
  for (const t of txs) {
    const r = row(t.date.slice(0, 7));
    r.ops++;
    const key = merchant(t).key;
    if (isIncome(t)) {
      r.income += t.amount;
      if (isFamilyAllowance(t)) r.allowances += t.amount;
      if (reg.has(key) || isFamilyAllowance(t)) r.incomeRegular += t.amount;
      else r.incomeOneOff += t.amount;
      continue;
    }
    if (t.category === 'Épargne et virements internes') {
      r.saved += -t.amount;
      continue;
    }
    const v = -t.amount; // dépense positive, remboursement négatif
    if (t.exceptional && t.amount < 0) {
      r.exceptional += v;
      if (!o.includeExceptional) continue;
    }
    r.spend += v;
    r.byCat[t.category] = (r.byCat[t.category] ?? 0) + v;
    const n = natureOf(t, s, key);
    if (n === 'utile') r.utile += v;
    else if (n === 'optionnel') r.optionnel += v;
    else r.unknown += v;
    if (isKid(t, s, key)) r.kidsDirect += v;
    else if (SHARED_KID_CATEGORIES.has(t.category)) r.kidsEstimated += v * s.kidsShare;
  }
  return [...rows.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface Totals extends Omit<MonthRow, 'month' | 'byCat'> {
  months: number;
  byCat: Record<string, number>;
}

/** Somme de plusieurs mois. Diviser par `months` pour une moyenne mensuelle. */
export function totals(rows: MonthRow[]): Totals {
  const t: Totals = { months: rows.length, income: 0, incomeRegular: 0, incomeOneOff: 0, allowances: 0, spend: 0, utile: 0, optionnel: 0, unknown: 0, exceptional: 0, kidsDirect: 0, kidsEstimated: 0, saved: 0, byCat: {}, ops: 0 };
  for (const r of rows) {
    for (const k of ['income', 'incomeRegular', 'incomeOneOff', 'allowances', 'spend', 'utile', 'optionnel', 'unknown', 'exceptional', 'kidsDirect', 'kidsEstimated', 'saved', 'ops'] as const) t[k] += r[k];
    for (const [c, v] of Object.entries(r.byCat)) t.byCat[c] = (t.byCat[c] ?? 0) + v;
  }
  return t;
}

/** Taux de superflu : part optionnelle des dépenses qualifiées (utiles + optionnelles). */
export const superfluRate = (t: Pick<Totals, 'utile' | 'optionnel'>) => (t.utile + t.optionnel > 0 ? t.optionnel / (t.utile + t.optionnel) : 0);

export interface MerchantRow {
  key: string;
  label: string;
  category: string;
  total: number;
  count: number;
  /** Ticket moyen (positif). */
  average: number;
  nature?: Nature;
  kid: boolean;
}

/** Dépenses par commerçant sur un ensemble d'opérations (remboursements déduits). */
export function byMerchant(txs: Tx[], s: DashSettings, o: DashOptions = {}): MerchantRow[] {
  const m = new Map<string, { label: string; total: number; count: number; cats: string[]; nat: (Nature | undefined)[]; kid: number }>();
  for (const t of txs) {
    if (!isSpending(t) || (t.exceptional && t.amount < 0 && !o.includeExceptional)) continue;
    const { key, label } = merchant(t);
    const e = m.get(key) ?? { label, total: 0, count: 0, cats: [], nat: [], kid: 0 };
    e.total += -t.amount;
    if (t.amount < 0) e.count++;
    e.cats.push(t.category);
    e.nat.push(natureOf(t, s, key));
    if (isKid(t, s, key)) e.kid++;
    m.set(key, e);
  }
  return [...m.entries()]
    .map(([key, e]) => {
      const nat = mostFrequent(e.nat.map((x) => x ?? '')) as Nature | '';
      return { key, label: e.label, category: mostFrequent(e.cats), total: e.total, count: e.count, average: e.count ? e.total / e.count : 0, nature: nat || undefined, kid: e.kid > e.cats.length / 2 };
    })
    .filter((r) => r.total > 0.005)
    .sort((a, b) => b.total - a.total);
}

/** Mois couverts par chaque compte (banque + compte) : nombre d'opérations et dernier jour vu. */
export function coverage(txs: Tx[]): { accounts: { id: string; bank: string; account: string }[]; cells: Map<string, { ops: number; firstDay: number; lastDay: number }> } {
  const accounts = new Map<string, { id: string; bank: string; account: string }>();
  const cells = new Map<string, { ops: number; firstDay: number; lastDay: number }>();
  for (const t of txs) {
    const id = `${t.bank}|${t.account}`;
    if (!accounts.has(id)) accounts.set(id, { id, bank: t.bank, account: t.account });
    const k = `${id}|${t.date.slice(0, 7)}`;
    const d = Number(t.date.slice(8, 10));
    const c = cells.get(k) ?? { ops: 0, firstDay: 31, lastDay: 0 };
    c.ops++;
    c.firstDay = Math.min(c.firstDay, d);
    c.lastDay = Math.max(c.lastDay, d);
    cells.set(k, c);
  }
  return { accounts: [...accounts.values()].sort((a, b) => a.id.localeCompare(b.id)), cells };
}

/** Liste de mois AAAA-MM de `from` à `to` inclus. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
