// Profils : toutes les données d'un ménage, gardées uniquement dans ce navigateur (localStorage)
// ou dans un fichier que l'utilisateur exporte lui-même. Aucun envoi réseau.
import type { BudgetSetup, Variant } from './engine/budget';
import type { Assumptions, Household, LeaveType, WorkPeriod } from './engine/types';
import type { Rule } from './import/categories';
import type { Tx } from './import/csv';
import { defaultDashSettings, normalizeDash, type DashSettings } from './import/dashboard';
import { DEFAULT_ASSUMPTIONS, DEFAULT_HOUSEHOLD } from './defaults';

export type Planned = { birth: string; birthParent: 'A' | 'B' };
export type Scen = { name: string; planned: Planned[]; periods: WorkPeriod[]; variant?: Variant };
export type Wealth = { start: number; yearlySavings: number; returnRate: number };

export interface ProfileState {
  version: 3;
  household: Household;
  hasB: boolean;
  existing: { birth: string }[];
  baseFraction: { A: number; B: number };
  /** Changements déjà prévus dans la situation actuelle (fin d'un crédit-temps, retour à temps plein…). */
  basePeriods: WorkPeriod[];
  scenarios: Scen[];
  active: number;
  wealth: Wealth;
  assumptions: Assumptions;
  budget: BudgetSetup;
  rules: Rule[];
  ownAccounts: string[];
  /** Réglages du tableau de bord des dépenses (natures, enfants, revenus réguliers). */
  dash: DashSettings;
}

export interface StoredProfile {
  id: string;
  name: string;
  updated: string;
  state: ProfileState;
}

export const START = DEFAULT_ASSUMPTIONS.startYear;

export function typicalScenarios(p: 'A' | 'B', y: number): Scen[] {
  const child = { birth: `${y}-09`, birthParent: p };
  const stop = { parent: p, from: `${y}-01`, to: `${y + 30}-12`, fraction: 0, leave: 'aucun' as LeaveType };
  return [
    { name: 'Un enfant de plus', planned: [child], periods: [] },
    { name: 'Un parent arrête', planned: [], periods: [stop] },
    {
      name: 'Arrêt 2 ans puis 4/5',
      planned: [],
      periods: [
        { parent: p, from: `${y}-01`, to: `${y + 1}-12`, fraction: 0, leave: 'aucun' },
        { parent: p, from: `${y + 2}-01`, to: `${y + 30}-12`, fraction: 0.8, leave: 'aucun' },
      ],
    },
    {
      name: 'Enfant de plus et 4/5',
      planned: [child],
      periods: [
        { parent: p, from: `${y + 1}-01`, to: `${y + 2}-08`, fraction: 0.8, leave: 'conge-parental' },
        { parent: p, from: `${y + 2}-09`, to: `${y + 3}-12`, fraction: 0.8, leave: 'aucun' },
      ],
    },
  ];
}

/** Budget d'exemple : un ménage fictif de cinq personnes en Wallonie. Montants ronds, sans lien avec un ménage réel. */
export function exampleBudget(): BudgetSetup {
  const y = START + 1;
  return {
    startYear: y,
    priceYear: START,
    inflation: 0.02,
    ownChildcare: false,
    items: [
      { id: 'b1', label: 'Prêt hypothécaire', category: 'Crédits', monthly: 1100, to: '2044-06', credit: true },
      { id: 'b2', label: 'Prêt travaux', category: 'Crédits', monthly: 250, to: '2031-12', credit: true },
      { id: 'b3', label: 'Courses', category: 'Courses', monthly: 850, cut: 120 },
      { id: 'b4', label: 'Énergie et eau', category: 'Énergie et eau', monthly: 260 },
      { id: 'b5', label: 'Assurances', category: 'Assurances', monthly: 200 },
      { id: 'b6', label: 'Voitures (carburant, entretien)', category: 'Voiture', monthly: 300, cut: 40 },
      { id: 'b7', label: 'Abonnements et télécom', category: 'Abonnements et télécom', monthly: 80, cut: 20 },
      { id: 'b8', label: 'Stages et garderies', category: 'Enfants : activités et stages', monthly: 220, dropsIfParentHome: true },
      { id: 'b9', label: 'École (repas, sorties)', category: 'École', monthly: 90 },
      { id: 'b10', label: 'Vêtements', category: 'Vêtements', monthly: 150, cut: 60 },
      { id: 'b11', label: 'Santé (après mutuelle)', category: 'Santé', monthly: 80 },
      { id: 'b12', label: 'Vacances', category: 'Vacances et voyages', monthly: 350, cut: 180 },
      { id: 'b13', label: 'Restaurants et sorties', category: 'Restaurants et sorties', monthly: 150, cut: 80 },
      { id: 'b14', label: 'Cadeaux et fêtes', category: 'Cadeaux et fêtes', monthly: 120, cut: 60 },
      { id: 'b15', label: 'Maison et petits achats', category: 'Maison et bricolage', monthly: 180, cut: 100 },
      { id: 'b16', label: 'Divers et espèces', category: 'Divers', monthly: 200, cut: 100 },
    ],
    incomes: [],
    oneOffs: [{ id: 'o1', label: 'Remplacement d’une voiture', amount: 12000, date: `${y + 3}-06` }],
    liquid: 25000,
    cushion: 10000,
    invested: 20000,
    investYearly: 3000,
    investReturn: 0.06,
    investOnlyIfSurplus: true,
    oneCarSaving: 250,
    holdYears: 10,
  };
}

export function exampleState(): ProfileState {
  return {
    version: 3,
    household: structuredClone(DEFAULT_HOUSEHOLD),
    hasB: true,
    existing: [{ birth: '2018-05' }, { birth: '2021-04' }, { birth: '2023-09' }],
    baseFraction: { A: 1, B: 1 },
    basePeriods: [],
    scenarios: typicalScenarios('B', START + 1),
    active: 1,
    wealth: { start: 45000, yearlySavings: 12000, returnRate: 0.05 },
    assumptions: structuredClone(DEFAULT_ASSUMPTIONS),
    budget: exampleBudget(),
    rules: [],
    ownAccounts: [],
    dash: defaultDashSettings(),
  };
}

/** Complète un état ancien ou partiel avec les valeurs par défaut (fichiers v2, exports partiels). */
export function normalize(raw: any): ProfileState {
  const base = exampleState();
  const s = { ...base, ...(raw ?? {}) } as ProfileState;
  if (raw?.planned && !raw.scenarios) s.scenarios = [{ name: 'Scénario', planned: raw.planned, periods: raw.periods ?? [] }];
  s.assumptions = { ...base.assumptions, ...(raw?.assumptions ?? {}), creche: { ...base.assumptions.creche, ...(raw?.assumptions?.creche ?? {}) } };
  s.budget = { ...base.budget, ...(raw?.budget ?? {}) };
  if (!raw?.budget) s.budget = exampleBudget();
  s.basePeriods ??= [];
  s.rules ??= [];
  s.ownAccounts ??= [];
  s.dash = normalizeDash(raw?.dash);
  s.version = 3;
  return s;
}

// ---------------- Stockage local ----------------
const KEY = 'simulateur-famille:v3';
const TX = (id: string) => `simulateur-famille:tx:${id}`;
const OLD_KEY = 'simulateur-famille:v2';

export interface Store {
  activeId: string;
  profiles: StoredProfile[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Profil personnel injecté au build (version privée seulement) ; null dans la version publique. */
declare const __PRIVATE_PROFILE__: { name: string; state: unknown } | null;
const privateProfile = typeof __PRIVATE_PROFILE__ !== 'undefined' ? __PRIVATE_PROFILE__ : null;

export function newProfile(name: string, state: ProfileState): StoredProfile {
  return { id: uid(), name, updated: new Date().toISOString(), state };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const st = JSON.parse(raw) as Store;
      st.profiles = st.profiles.map((p) => ({ ...p, state: normalize(p.state) }));
      if (st.profiles.length) return st;
    }
  } catch {}
  const profiles: StoredProfile[] = [];
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old) profiles.push(newProfile('Mes données (version précédente)', normalize(JSON.parse(old))));
  } catch {}
  if (privateProfile) profiles.push(newProfile(privateProfile.name, normalize(privateProfile.state)));
  profiles.push(newProfile('Exemple', exampleState()));
  return { activeId: profiles[0].id, profiles };
}

export function saveStore(s: Store): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function loadTx(id: string): Tx[] {
  try {
    return JSON.parse(localStorage.getItem(TX(id)) ?? '[]');
  } catch {
    return [];
  }
}

export function saveTx(id: string, txs: Tx[]): boolean {
  try {
    if (txs.length) localStorage.setItem(TX(id), JSON.stringify(txs));
    else localStorage.removeItem(TX(id));
    return true;
  } catch {
    return false;
  }
}

/** Efface tout ce que le simulateur a gardé dans ce navigateur. */
export function wipeAll() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('simulateur-famille:')) localStorage.removeItem(k);
    }
  } catch {}
}

/** Fichier d'export : un profil, avec ou sans ses opérations bancaires. */
export interface ExportFile {
  app: 'simulateur-famille';
  version: 3;
  name: string;
  exported: string;
  state: ProfileState;
  transactions?: Tx[];
}

export function parseImport(text: string): { name: string; state: ProfileState; transactions: Tx[] } {
  const j = JSON.parse(text);
  if (j?.app === 'simulateur-famille' && j.state) return { name: j.name ?? 'Profil importé', state: normalize(j.state), transactions: Array.isArray(j.transactions) ? j.transactions : [] };
  // Ancien format « Copier le scénario » : l'état brut.
  if (j && (j.household || j.scenarios)) return { name: 'Profil importé', state: normalize(j), transactions: [] };
  throw new Error('format');
}

/** Propose un fichier à enregistrer : capacité « downloads » dans claude.ai, sinon lien de téléchargement. */
export async function offerFile(filename: string, data: string, type: string): Promise<'ok' | 'declined' | 'unavailable'> {
  const w = window as any;
  try {
    if (w.claude?.use) {
      const d = await Promise.race([w.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (d) {
        try {
          await (d as any).save({ filename, data });
          return 'ok';
        } catch (e: any) {
          if (e?.code === 'declined') return 'declined';
        }
      }
    }
  } catch {}
  try {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'ok';
  } catch {
    return 'unavailable';
  }
}
