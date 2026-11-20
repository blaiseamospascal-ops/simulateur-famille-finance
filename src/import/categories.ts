// Catégories de budget et classement automatique des opérations bancaires.
// Ordre d'application : règles de l'utilisateur, mots-clés ci-dessous, catégorie fournie par la banque, « À classer ».
// Les mots-clés sont des enseignes et organismes publics courants en Belgique : aucune donnée personnelle ici.

export const CATEGORIES = [
  'Courses',
  'Restaurants et sorties',
  'Enfants : activités et stages',
  'Crèche et garde',
  'École',
  'Babysitting',
  'Vacances et voyages',
  'Voiture',
  'Transports en commun',
  'Vêtements',
  'Santé',
  'Assurances',
  'Énergie et eau',
  'Chauffage (mazout, pellets)',
  'Abonnements et télécom',
  'Crédits',
  'Loyer',
  'Maison et bricolage',
  'Cadeaux et fêtes',
  'Loisirs',
  'Coiffure et soins',
  'Dons',
  'Impôts et taxes',
  "Retraits d'espèces",
  'Divers',
  'Revenus',
  'Épargne et virements internes',
  'À classer',
] as const;
export type Category = (typeof CATEGORIES)[number] | string;

/** Catégories qui ne sont pas des dépenses du ménage. */
export const NON_EXPENSE = new Set<string>(['Revenus', 'Épargne et virements internes']);

/** Règle : si le texte (libellé + contrepartie) contient `pattern` (sans tenir compte des accents ni de la casse). */
export interface Rule {
  pattern: string;
  category: string;
  /** Limiter aux débits (-1) ou aux crédits (+1). */
  sign?: -1 | 1;
}

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const K = (category: string, words: string[], sign?: -1 | 1): Rule[] => words.map((pattern) => ({ pattern, category, sign }));

export const BUILTIN_RULES: Rule[] = [
  // Épargne, placements et virements entre comptes : pas des dépenses.
  ...K('Épargne et virements internes', ['keytrade', 'bolero', 'degiro', 'saxo bank', 'trade republic', 'compte epargne', 'spaarrekening', 'livret a', 'vers votre compte', 'virement interne']),
  // Revenus (crédits uniquement).
  ...K('Revenus', ['salaire', 'loon', 'remuneration', 'office national de l\'emploi', 'onem', 'rva', 'allocations familiales', 'famiwal', 'parentia', 'camille', 'kidslife', 'infino', 'mutualite', 'mutualiteit', 'mutualité', 'partenamut', 'solidaris', 'mc.be', 'mutualite chretienne', 'spf finances', 'remboursement'], 1),
  ...K('Crédits', ['ech pret', 'echeance pret', 'remboursement pret', 'credit hypothecaire', 'hypotheek', 'fonds du logement', 'alpha credit', 'cofidis', 'buy way', 'santander consumer', 'beobank nv/sa pret', 'pret a temperament', 'amortissement']),
  ...K('Impôts et taxes', ['spf finances', 'fod financien', 'precompte immobilier', 'service public de wallonie', 'taxe ', 'belastingen', 'ville de ', 'commune de ', 'administration communale']),
  ...K('Énergie et eau', ['engie', 'electrabel', 'luminus', 'totalenergies power', 'mega ', 'octa+', 'eneco', 'bolt energie', 'swde', 'inbw', 'vivaqua', 'ores ', 'resa ', 'societe wallonne des eaux']),
  ...K('Chauffage (mazout, pellets)', ['mazout', 'gasoil chauffage', 'pellets', 'stookolie']),
  ...K('Abonnements et télécom', ['proximus', 'orange belgium', 'orange ', 'telenet', 'voo', 'base ', 'scarlet', 'mobile vikings', 'netflix', 'spotify', 'disney', 'apple.com', 'google', 'amazon prime', 'youtube', 'deezer', 'streamz', 'anthropic', 'openai']),
  ...K('Assurances', ['ethias', 'ag insurance', 'axa', 'p&v', 'belfius assurances', 'allianz', 'baloise', 'dkv', 'yuzzu', 'vivium', 'federale assurance', 'acm belgium', 'assurance', 'verzekering']),
  ...K('Courses', ['delhaize', 'colruyt', 'okay ', 'bio-planet', 'carrefour', 'lidl', 'aldi', 'intermarche', 'match ', 'cora ', 'spar ', 'proxy delhaize', 'shop&go', 'boucherie', 'boulangerie', 'fromagerie', 'hellofresh', 'albert heijn', 'jumbo', 'leclerc', 'super u', 'marche ', 'primeur', 'nad ', 'crf ', 'carrefour express']),
  ...K('Restaurants et sorties', ['restaurant', 'resto', 'brasserie', 'pizzeria', 'pizza', 'mcdonald', 'quick ', 'burger', 'exki', 'panos', 'cafe ', 'snack', 'friterie', 'frituur', 'sushi', 'deliveroo', 'uber eats', 'takeaway', 'bar ', 'cinema', 'kinepolis']),
  ...K('Voiture', ['shell', 'esso', 'total ', 'totalenergies', 'q8', 'lukoil', 'texaco', 'gulf', 'dats 24', 'maes ', 'octa+ station', 'parking', 'parkeren', 'peage', 'toll', 'renault', 'peugeot', 'dacia', 'volkswagen', 'toyota', 'norauto', 'carglass', 'vroomly', 'autosecurite', 'controle technique', 'lavage', 'car wash', 'taxe de circulation']),
  ...K('Transports en commun', ['sncb', 'nmbs', 'tec ', 'stib', 'de lijn', 'thalys', 'eurostar', 'sncf', 'ouigo', 'flixbus', 'blablacar']),
  ...K('Vacances et voyages', ['airbnb', 'booking.com', 'hotel', 'camping', 'gite', 'ryanair', 'brussels airlines', 'tui', 'transavia', 'easyjet', 'vacances', 'pierre et vacances', 'center parcs', 'worldpay']),
  ...K('Santé', ['pharmacie', 'apotheek', 'docteur', 'medecin', 'dentiste', 'kine', 'hopital', 'chu ', 'chr ', 'clinique', 'laboratoire', 'opticien', 'pearle', 'hans anders', 'logopede', 'psycholog', 'osteo']),
  ...K('Crèche et garde', ['creche', 'kinderdagverblijf', 'accueillante', 'co-accueil', 'garderie', 'one.be']),
  ...K('École', ['ecole', 'enseign', 'athenee', 'college', 'institut', 'lycee', 'enseignement', 'school', 'repas scolaire', 'cantine']),
  ...K('Enfants : activités et stages', ['stage', 'academie', 'conservatoire', 'rugby', 'football', 'judo', 'natation', 'piscine', 'tennis', 'danse', 'scout', 'patro', 'guides', 'mouvement de jeunesse', 'violon', 'piano', 'atout sport', 'plaine de jeux']),
  ...K('Vêtements', ['zara', 'h&m', 'h & m', 'primark', 'c&a', 'kiabi', 'jbc', 'zeb', 'vinted', 'decathlon', 'okaidi', 'vertbaudet', 'sergent major', 'bel&bo', 'chaussures', 'torfs', 'brantano', 'veritas', 'zalando']),
  ...K('Maison et bricolage', ['ikea', 'brico', 'gamma', 'hubo', 'mr bricolage', 'leroy merlin', 'action ', 'hema', 'blokker', 'kitchenaid', 'mediamarkt', 'krefel', 'vanden borre', 'coolblue', 'fnac', 'amazon', 'bol.com', 'trafic', 'casa ', 'maisons du monde']),
  ...K('Cadeaux et fêtes', ['cadeau', 'jouet', 'dreamland', 'intertoys', 'fleuriste', 'mariage', 'king jouet', 'maxi toys', 'librairie', 'club ']),
  ...K('Loisirs', ['fitness', 'basic-fit', 'musee', 'theatre', 'concert', 'ticketmaster', 'walibi', 'pairi daiza', 'sport']),
  ...K('Coiffure et soins', ['coiffure', 'coiffeur', 'kapper', 'barbier', 'esthetique', 'institut de beaute', 'ici paris', 'kruidvat', 'rituals', 'yves rocher']),
  ...K('Dons', ['paroisse', 'eglise', 'don ', 'unicef', 'medecins sans frontieres', 'oxfam', 'croix-rouge', 'caritas', 'cotisation']),
  ...K("Retraits d'espèces", ['retrait', 'cash place', 'atm', 'geldopname', 'bancontact cash', 'batopin']),
];

/** Correspondance des catégories proposées par Beobank (« Catégorie » / « SousCatégorie »). */
export const BANK_CATEGORY_MAP: [string, string][] = [
  ['grande surface', 'Courses'],
  ['petit commercant', 'Courses'],
  ['alimentation', 'Courses'],
  ['sorties / cafe / restaurant', 'Restaurants et sorties'],
  ['restaurant', 'Restaurants et sorties'],
  ['carburant', 'Voiture'],
  ['parking', 'Voiture'],
  ['entretien vehicule', 'Voiture'],
  ['vehicule', 'Voiture'],
  ['vacances', 'Vacances et voyages'],
  ['abonnement multimedia', 'Abonnements et télécom'],
  ['telephon', 'Abonnements et télécom'],
  ['credits conso', 'Crédits'],
  ['credit immobilier', 'Crédits'],
  ['pret', 'Crédits'],
  ['assurance', 'Assurances'],
  ['habillement', 'Vêtements'],
  ['pharmacie', 'Santé'],
  ['sante', 'Santé'],
  ['soins', 'Santé'],
  ['decoration / equipement / ameublement', 'Maison et bricolage'],
  ['bricolage', 'Maison et bricolage'],
  ['habitation', 'Maison et bricolage'],
  ['retrait d\'argent', "Retraits d'espèces"],
  ['culture', 'Loisirs'],
  ['loisirs', 'Loisirs'],
  ['impots', 'Impôts et taxes'],
  ['taxes', 'Impôts et taxes'],
  ['enfants', 'Enfants : activités et stages'],
  ['scolarite', 'École'],
  ['cadeaux', 'Cadeaux et fêtes'],
  ['epargne', 'Épargne et virements internes'],
  ['virements internes', 'Épargne et virements internes'],
  ['salaire', 'Revenus'],
  ['revenus', 'Revenus'],
];

export interface Classified {
  category: string;
  /** D'où vient le classement. */
  by: 'utilisateur' | 'mot-clé' | 'banque' | 'aucun';
  rule?: string;
}

/** Codes BIC (« GEBABEBB », « AXABBE22XXX »…) : retirés avant les mots-clés pour éviter les faux positifs (AXA…). */
const BIC = /\b[A-Z]{4}(?:BE|FR|NL|LU|DE)[A-Z0-9]{2}(?:XXX|[A-Z0-9]{3})?\b/g;
/** Quelques BIC qui désignent à coup sûr un courtier en placements. */
const BROKER_BIC = /\b(KEYTBEBB|BOLEBEBB|DEGRNL2A|TRBKDEBB)/;

export const compactIban = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export function classify(text: string, amount: number, bankCategory: string | undefined, userRules: Rule[], ownAccounts: string[] = []): Classified {
  const compact = compactIban(text);
  for (const acc of ownAccounts) {
    const a = compactIban(acc);
    if (a.length >= 12 && compact.includes(a)) return { category: 'Épargne et virements internes', by: 'utilisateur', rule: acc };
  }
  const t = norm(text.replace(BIC, ' '));
  const sign = amount < 0 ? -1 : 1;
  for (const r of userRules) {
    if (r.pattern.trim() && t.includes(norm(r.pattern.trim())) && (!r.sign || r.sign === sign)) return { category: r.category, by: 'utilisateur', rule: r.pattern };
  }
  if (BROKER_BIC.test(text) && amount < 0) return { category: 'Épargne et virements internes', by: 'mot-clé', rule: 'courtier' };
  for (const r of BUILTIN_RULES) {
    if (r.sign && r.sign !== sign) continue;
    // Un débit ne peut pas être un revenu.
    if (r.category === 'Revenus' && sign < 0) continue;
    if (t.includes(r.pattern)) return { category: r.category, by: 'mot-clé', rule: r.pattern };
  }
  if (bankCategory) {
    const b = norm(bankCategory);
    // Fichier générique ou réexport : la catégorie est déjà l'une des nôtres.
    const own = CATEGORIES.find((c) => norm(c) === b);
    if (own) return { category: own, by: 'banque', rule: bankCategory };
    for (const [k, c] of BANK_CATEGORY_MAP) if (b.includes(k)) return { category: c === 'Revenus' && sign < 0 ? 'Divers' : c, by: 'banque', rule: bankCategory };
  }
  if (sign > 0) return { category: 'Revenus', by: 'aucun' };
  return { category: 'À classer', by: 'aucun' };
}
