// Types communs au moteur. Ils ne connaissent aucun pays : un module pays
// (src/countries/<pays>) implémente CountryModule et lit ses barèmes datés.

/** Mois au format 'AAAA-MM'. */
export type YM = string;

export type LeaveType = 'aucun' | 'conge-parental' | 'credit-temps';

/** Fiabilité d'un montant affiché. */
export type Reliability =
  | 'officiel' // règle publique, montant lu dans une source officielle
  | 'publie' // règle publique, montant lu dans une source secondaire sérieuse (en attente de l'avis officiel)
  | 'projection' // année future : dernier montant connu, indexé ou réforme votée
  | 'approximation' // règle publique simplifiée par le simulateur
  | 'estime'; // hypothèse de coût, propre à chaque ménage

export interface Parent {
  label: string;
  /** Salaire brut mensuel à temps plein, année de départ. */
  grossMonthlyFT: number;
  /** Âge au 1er janvier de l'année de départ. */
  age: number;
  /**
   * Évolution connue du brut mensuel temps plein (ancienneté, barème, indexation), par année : { '2028': 5801 }.
   * Après la dernière année connue, le brut suit l'indexation et la progression de carrière.
   */
  grossByYear?: Record<string, number>;
}

export interface Child {
  id: string;
  /** Naissance, 'AAAA-MM'. */
  birth: YM;
  /** Enfant à venir (scénario) ou déjà né. */
  planned: boolean;
  /** Parent qui accouche (congé de maternité), si enfant à venir. */
  birthParent?: 'A' | 'B';
}

export interface WorkPeriod {
  parent: 'A' | 'B';
  from: YM;
  to: YM;
  /** Fraction de temps de travail : 1, 0.8, 0.5, 0. */
  fraction: number;
  /** Interruption indemnisée par l'ONEM, ou aucune (réduction ou arrêt non indemnisé). */
  leave: LeaveType;
}

export interface Situation {
  label: string;
  children: Child[];
  periods: WorkPeriod[];
}

export interface Household {
  country: 'be';
  region: 'wal';
  couple: boolean; // marié ou cohabitant légal (imposition commune)
  /** Taxe communale additionnelle, en fraction (Namur : 0.08). */
  communalRate: number;
  A: Parent;
  B?: Parent;
}

export interface CostLevels {
  low: number;
  mid: number;
  high: number;
}

export interface Assumptions {
  startYear: number;
  years: number;
  /** Indexation annuelle supposée des salaires, barèmes et allocations (ex. 0.02). */
  indexRate: number;
  /** Croissance réelle annuelle des salaires (carrière), en plus de l'index. */
  realWageGrowth: number;
  /** Perte de progression salariale par année-équivalent temps plein non travaillée (ex. 0.01 = 1 %). */
  careerPenaltyPerYear: number;
  /** Âge de fin des allocations familiales (18 sans études, jusqu'à 24 en études). */
  allowanceEndAge: number;
  creche: {
    use: boolean;
    type: 'one' | 'prive';
    privateDaily: number;
    daysPerYear: number;
    /** Pas de crèche quand un parent ne travaille pas ; jours réduits au prorata en 4/5 ou mi-temps. */
    adaptToParentTime: boolean;
  };
  /** Coûts de consommation de l'enfant, par mois et par tranche d'âge (niveau moyen). */
  childMonthly: { age0_2: number; age3_5: number; age6_11: number; age12_17: number; age18_24: number };
  /** Multiplicateurs bas et haut appliqués aux coûts moyens. */
  costRange: { low: number; high: number };
  /** Facteur de coût selon le rang : 2e enfant, 3e et suivants (économies d'échelle). */
  rankFactor: { second: number; thirdPlus: number };
  /** Stages et garderies (3 à 12 ans), par an et par enfant, niveau moyen. */
  extracurricularYearly: number;
  /** Les stages tombent quand un parent est à la maison. */
  extracurricularDropIfParentHome: boolean;
  /** Équipement de naissance, une fois. */
  birthEquipment: number;
  /** Logement : surcoût mensuel par enfant à venir (chambre en plus), 0 si rien ne change. */
  housingPerNewChildMonthly: number;
}

export interface Line {
  key: string;
  label: string;
  /** Positif = entrée d'argent, négatif = sortie. */
  amount: number;
  group: 'travail' | 'impots' | 'allocations' | 'couts';
  reliability: Reliability;
  detail?: string;
  source?: string;
}

export interface YearResult {
  year: number;
  lines: Line[];
  /** Somme des lignes calculées (argent public et travail), hors coûts estimés. */
  computedNet: number;
  /** Coûts estimés de l'enfant (crèche ONE incluse dans les lignes calculées). */
  estimatedCosts: CostLevels;
  /** Revenu disponible = computedNet - coûts estimés. */
  disposable: CostLevels;
  /** Indicateurs hors revenu disponible. */
  indicators: {
    pensionLossYearly: number;
    notes: string[];
    /** Avantage fiscal des enfants à charge compris dans l'impôt (€/an), compté une seule fois pour le ménage. */
    childTaxBenefit: number;
    /** Avantage de l'imposition commune : quotient conjugal et transfert de la quotité exemptée inutilisée (€/an d'impôt en moins). */
    quotientGain: number;
  };
  /** Ventilation utile au module budget (montants positifs, €/an). */
  parts: {
    /** Crèche des enfants déjà nés (le budget réel du ménage la contient souvent déjà). */
    crecheExisting: number;
    /** Crèche des enfants à venir. */
    crechePlanned: number;
    /** Coûts estimés (hypothèse moyenne) des enfants à venir uniquement. */
    plannedEstimated: number;
  };
}

export interface CountryModule {
  id: string;
  computeYear(ctx: YearContext): YearResult;
}

export interface YearContext {
  year: number;
  household: Household;
  situation: Situation;
  assumptions: Assumptions;
  /** Facteur de salaire cumulé (index, carrière, pénalité) par parent pour cette année. */
  wageFactor: { A: number; B: number };
  /** Brut mensuel temps plein de l'année, par parent (évolution connue ou projetée, pénalité de carrière comprise). */
  grossMonthly: { A: number; B: number };
  /** Années-équivalent temps plein non travaillées cumulées avant cette année. */
  cumulativeNotWorked: { A: number; B: number };
}

export interface Comparison {
  base: YearResult[];
  scenario: YearResult[];
  diff: { year: number; computed: number; costs: CostLevels; disposable: CostLevels; cumulative: CostLevels }[];
}
