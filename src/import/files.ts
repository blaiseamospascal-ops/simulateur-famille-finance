// Import de plusieurs fichiers CSV à la fois : lecture, fusion sans doublons, comptes détectés, reclassement.
import { compactIban, type Rule } from './categories';
import { decode, merge, ownIbans, parseFile, reclassify, type Tx } from './csv';

export interface FileReport {
  name: string;
  format: string;
  added: number;
  duplicates: number;
  skipped: number;
  warnings: string[];
  /** Première et dernière date du fichier. */
  from?: string;
  to?: string;
}

export async function importFiles(files: FileList | File[], txs: Tx[], rules: Rule[], ownAccounts: string[]): Promise<{ all: Tx[]; reports: FileReport[]; ownAccounts: string[] }> {
  const reports: FileReport[] = [];
  const own = [...ownAccounts];
  let all = txs;
  for (const f of Array.from(files)) {
    try {
      const parsed = parseFile(decode(await f.arrayBuffer()), rules, own);
      for (const acc of ownIbans(parsed.rows)) if (!own.map(compactIban).includes(acc)) own.push(acc);
      const m = merge(all, parsed.rows);
      all = m.all;
      const dates = parsed.rows.map((t) => t.date).sort();
      reports.push({ name: f.name, format: parsed.format, added: m.added, duplicates: m.duplicates, skipped: parsed.skipped, warnings: parsed.warnings, from: dates[0], to: dates.at(-1) });
    } catch {
      reports.push({ name: f.name, format: 'illisible', added: 0, duplicates: 0, skipped: 0, warnings: ['Fichier illisible : est-ce bien un CSV ?'] });
    }
  }
  return { all: reclassify(all, rules, own), reports, ownAccounts: own };
}

/** Règle « toujours cette catégorie » à partir de la contrepartie d'une opération (3 premiers mots sans chiffres). */
export function ruleFromTx(t: Tx, category: string): Rule | null {
  const pattern = t.counterparty
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !/\d/.test(w) && w.length > 1)
    .slice(0, 3)
    .join(' ');
  if (pattern.length < 3) return null;
  return { pattern, category, sign: t.amount < 0 ? -1 : 1 };
}
