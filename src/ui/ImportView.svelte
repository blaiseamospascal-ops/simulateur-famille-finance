<script lang="ts">
  import { ymIndex } from '../engine/simulate';
  import { CATEGORIES, NON_EXPENSE } from '../import/categories';
  import { reclassify, summarize, toGenericCsv, type Tx } from '../import/csv';
  import { importFiles, ruleFromTx, type FileReport } from '../import/files';
  import { offerFile, type ProfileState } from '../profile';
  import { eur, monthLabel, uid } from './format';

  let { st = $bindable(), txs = $bindable() }: { st: ProfileState; txs: Tx[] } = $props();

  let reports: FileReport[] = $state([]);
  let busy = $state(false);
  let dragging = $state(false);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    busy = true;
    const r = await importFiles(files, txs, st.rules, st.ownAccounts);
    st.ownAccounts = r.ownAccounts;
    txs = r.all;
    reports = r.reports;
    busy = false;
  }

  // ---------- Synthèse ----------
  const summary = $derived(summarize(txs));
  const todayIdx = $derived(ymIndex(`${st.budget.startYear - 1}-11`));
  const budgetByCat = $derived.by(() => {
    const m = new Map<string, number>();
    for (const it of st.budget.items) {
      const active = (!it.from || ymIndex(it.from) <= todayIdx) && (!it.to || ymIndex(it.to) >= todayIdx);
      if (active) m.set(it.category, (m.get(it.category) ?? 0) + it.monthly);
    }
    return m;
  });
  let pick: Record<string, boolean> = $state({});
  const isPicked = (c: string) => pick[c] ?? !(c === 'Crédits' || c === 'Crèche et garde' || c === 'À classer');
  let applyMsg = $state('');
  function applyToBudget() {
    const notes: string[] = [];
    let n = 0;
    for (const c of summary.cats) {
      if (!isPicked(c.category)) continue;
      const items = st.budget.items.filter((it) => it.category === c.category && !it.credit);
      const v = Math.round(c.monthly);
      if (items.length === 0) {
        st.budget.items.push({ id: uid(), label: c.category, category: c.category, monthly: v, note: `Moyenne des relevés (${summary.months.length} mois)` });
        n++;
      } else if (items.length === 1) {
        items[0].monthly = v;
        items[0].note = `Moyenne des relevés (${summary.months.length} mois)`;
        n++;
      } else notes.push(c.category);
    }
    applyMsg = `${n} poste${n > 1 ? 's' : ''} mis à jour dans « Budget et épargne ».` + (notes.length ? ` À ajuster à la main (plusieurs postes) : ${notes.join(', ')}.` : '');
  }

  // ---------- Opérations ----------
  let fCat = $state('');
  let fMonth = $state('');
  let fText = $state('');
  let limit = $state(150);
  const months = $derived([...new Set(txs.map((t) => t.date.slice(0, 7)))].sort().reverse());
  const filtered = $derived(
    txs.filter((t) => (!fCat || t.category === fCat) && (!fMonth || t.date.startsWith(fMonth)) && (!fText || `${t.text} ${t.counterparty}`.toLowerCase().includes(fText.toLowerCase()))),
  );
  const filteredTotal = $derived(filtered.reduce((a, t) => a + t.amount, 0));

  function setCategory(t: Tx, c: string) {
    t.category = c;
    t.manual = true;
    t.by = 'à la main';
  }
  function ruleFrom(t: Tx) {
    const r = ruleFromTx(t, t.category);
    if (!r) return;
    st.rules = [r, ...st.rules.filter((x) => x.pattern !== r.pattern)];
    txs = reclassify(txs, st.rules, st.ownAccounts);
  }
  function rerun() {
    txs = reclassify(txs, st.rules, st.ownAccounts);
  }
  async function exportCsv() {
    await offerFile('operations.csv', toGenericCsv(txs), 'text/csv');
  }
  function clearTx() {
    if (confirmClear) {
      txs = [];
      reports = [];
      confirmClear = false;
    } else confirmClear = true;
  }
  let confirmClear = $state(false);
</script>

<main class="wrap imp">
  <section class="panel">
    <h2>Importer des relevés bancaires</h2>
    <p class="hint">
      Les fichiers sont lus dans ce navigateur et ne sont envoyés nulle part. Formats reconnus : <strong>Beobank</strong> (export CSV de l’historique),
      <strong>CBC et KBC</strong> (français ou néerlandais), et tout CSV qui a une colonne de date, de montant (ou débit et crédit) et de libellé
      (Belfius, BNP Paribas Fortis, ING, Argenta, Crelan… le plus souvent reconnus ; sinon, voir le format générique ci-dessous).
      Vous pouvez importer des fichiers qui se recouvrent : les opérations déjà présentes ne sont pas ajoutées deux fois.
    </p>
    <label
      class="drop"
      class:on={dragging}
      ondragover={(e) => {
        e.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={(e) => {
        e.preventDefault();
        dragging = false;
        handleFiles(e.dataTransfer?.files ?? null);
      }}
    >
      <input type="file" accept=".csv,.txt,text/csv" multiple onchange={(e) => handleFiles(e.currentTarget.files)} />
      <span>{busy ? 'Lecture…' : 'Choisir des fichiers CSV, ou les déposer ici'}</span>
    </label>
    {#if reports.length}
      <ul class="reports">
        {#each reports as r}
          <li>
            <strong>{r.name}</strong> : format {r.format}, {r.added} opération{r.added > 1 ? 's' : ''} ajoutée{r.added > 1 ? 's' : ''}{r.duplicates ? `, ${r.duplicates} déjà présente${r.duplicates > 1 ? 's' : ''}` : ''}{r.skipped ? `, ${r.skipped} ligne${r.skipped > 1 ? 's' : ''} ignorée${r.skipped > 1 ? 's' : ''}` : ''}.
            {#each r.warnings as w}<span class="warnline"> {w}</span>{/each}
          </li>
        {/each}
      </ul>
    {/if}
    <details>
      <summary>Format générique (pour toute autre banque ou un tableur)</summary>
      <div class="doc">
        <p>Un fichier texte CSV, séparateur point-virgule (ou virgule, ou tabulation), première ligne = en-têtes. Colonnes reconnues, dans n’importe quel ordre :</p>
        <ul>
          <li><code>date</code> : JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA ou AAAA-MM-JJ (obligatoire)</li>
          <li><code>montant</code> : négatif pour une dépense, virgule ou point décimal, « 1.234,56 » accepté (obligatoire ; ou deux colonnes <code>debit</code> et <code>credit</code>)</li>
          <li><code>libelle</code> : description de l’opération (fortement conseillé)</li>
          <li><code>contrepartie</code>, <code>categorie</code>, <code>compte</code> : facultatifs. Une catégorie qui porte exactement le nom d’une catégorie du simulateur est reprise telle quelle.</li>
        </ul>
        <pre>date;libelle;montant;categorie
02/11/2026;Delhaize Bouge;-83,03;Courses
05/11/2026;Allocations familiales;601,53;Revenus</pre>
        <p>Encodage UTF-8 ou Windows-1252. L’export « Exporter en CSV » ci-dessous produit ce même format.</p>
      </div>
    </details>
  </section>

  {#if txs.length}
    <section class="panel">
      <h2>Dépenses moyennes par mois</h2>
      <p class="hint">
        Sur {summary.months.length} mois complets ({monthLabel(summary.months[0])} à {monthLabel(summary.months.at(-1)!)}), hors épargne, virements entre vos comptes et dépenses marquées exceptionnelles.
        Revenus moyens : {eur(summary.income)} par mois ; dépenses : {eur(summary.spending)} par mois.
      </p>
      <div class="tablewrap">
        <table>
          <thead><tr><th></th><th>Catégorie</th><th class="r">Relevés /mois</th><th class="r">Budget actuel /mois</th><th class="r">Opérations</th><th class="r">Exceptionnel exclu</th></tr></thead>
          <tbody>
            {#each summary.cats as c}
              <tr>
                <td><input type="checkbox" aria-label="Reporter {c.category} dans le budget" checked={isPicked(c.category)} onchange={(e) => (pick[c.category] = e.currentTarget.checked)} /></td>
                <td><button class="link" onclick={() => (fCat = c.category)}>{c.category}</button></td>
                <td class="r num">{eur(c.monthly)}</td>
                <td class="r num">{budgetByCat.has(c.category) ? eur(budgetByCat.get(c.category)!) : '—'}</td>
                <td class="r">{c.count}</td>
                <td class="r num">{c.exceptional ? eur(c.exceptional) : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="row">
        <button onclick={applyToBudget}>Reporter les catégories cochées dans le budget</button>
        <span class="hint">Les crédits et la crèche restent décochés par défaut : leurs dates de fin sont dans le budget.</span>
      </div>
      {#if applyMsg}<p class="hint" role="status">{applyMsg}</p>{/if}
    </section>

    <section class="panel">
      <div class="detail-head">
        <h2>Opérations ({txs.length})</h2>
        <div class="row">
          <button onclick={exportCsv}>Exporter en CSV</button>
          <button class="ghost" onclick={clearTx}>{confirmClear ? 'Confirmer : tout effacer' : 'Effacer les opérations'}</button>
        </div>
      </div>
      <div class="row filters">
        <select aria-label="Catégorie" bind:value={fCat}>
          <option value="">Toutes les catégories</option>
          {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
        </select>
        <select aria-label="Mois" bind:value={fMonth}>
          <option value="">Tous les mois</option>
          {#each months as m}<option value={m}>{monthLabel(m)}</option>{/each}
        </select>
        <input aria-label="Rechercher" placeholder="Rechercher…" bind:value={fText} />
        <span class="hint">{filtered.length} opérations, total {eur(filteredTotal, true)}</span>
      </div>
      <div class="tablewrap">
        <table class="ops">
          <thead><tr><th>Date</th><th>Contrepartie</th><th class="r">Montant</th><th>Catégorie</th><th title="Exclue des moyennes">Except.</th><th></th></tr></thead>
          <tbody>
            {#each filtered.slice(0, limit) as t (t.id)}
              <tr class:nonexp={NON_EXPENSE.has(t.category)}>
                <td class="nowrap">{t.date.split('-').reverse().join('/')}</td>
                <td><span class="cp">{t.counterparty}</span><span class="detail" title={t.text}>{t.bank} · {t.text.slice(0, 90)}</span></td>
                <td class="r num" class:pos={t.amount > 0}>{eur(t.amount, true)}</td>
                <td>
                  <select aria-label="Catégorie" value={t.category} onchange={(e) => setCategory(t, e.currentTarget.value)}>
                    {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
                  </select>
                  <span class="detail">{t.by}</span>
                </td>
                <td class="c"><input type="checkbox" aria-label="Exceptionnelle" bind:checked={t.exceptional} /></td>
                <td><button class="ghost" title="Classer toujours cette contrepartie dans cette catégorie" onclick={() => ruleFrom(t)}>Toujours</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if filtered.length > limit}<button onclick={() => (limit += 300)}>Afficher plus</button>{/if}
    </section>
  {/if}

  <div class="two">
    <section class="panel">
      <h2>Vos règles de classement ({st.rules.length})</h2>
      <p class="hint">Appliquées avant les règles intégrées. « Toujours » dans la liste des opérations en crée une. Le texte est cherché dans le libellé et la contrepartie, sans tenir compte des accents ni des majuscules.</p>
      <div class="rules">
        {#each st.rules as r, i}
          <div class="row">
            <input aria-label="Texte cherché" bind:value={r.pattern} />
            <select aria-label="Catégorie" bind:value={r.category}>
              {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
            </select>
            <button class="ghost" aria-label="Retirer la règle" onclick={() => st.rules.splice(i, 1)}>×</button>
          </div>
        {/each}
      </div>
      <div class="row">
        <button onclick={() => st.rules.unshift({ pattern: '', category: 'Divers' })}>Ajouter une règle</button>
        <button onclick={rerun} disabled={!txs.length}>Reclasser les opérations</button>
      </div>
    </section>
    <section class="panel">
      <h2>Vos comptes</h2>
      <p class="hint">Les virements vers ou depuis ces comptes sont des virements internes, pas des dépenses. Les IBAN complets trouvés dans les relevés sont ajoutés tout seuls.</p>
      {#each st.ownAccounts as a, i}
        <div class="row"><input aria-label="IBAN" bind:value={st.ownAccounts[i]} /><button class="ghost" aria-label="Retirer" onclick={() => st.ownAccounts.splice(i, 1)}>×</button></div>
      {/each}
      <button onclick={() => st.ownAccounts.push('')}>Ajouter un compte</button>
    </section>
  </div>
</main>

<style>
  .wrap { max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .imp { display: grid; gap: 16px; padding-block: 20px 48px; }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px; min-width: 0; }
  .hint { font-size: 0.82rem; color: var(--muted); }
  .drop { display: grid; place-items: center; gap: 8px; border: 2px dashed var(--line); border-radius: var(--radius); padding: 22px 12px; text-align: center; cursor: pointer; background: var(--bg); }
  .drop.on { border-color: var(--calc); background: var(--calc-soft); }
  .drop input { max-width: 100%; }
  .reports { margin: 0; padding-left: 1.1em; font-size: 0.88rem; display: grid; gap: 4px; }
  .warnline { color: var(--neg); }
  .doc { font-size: 0.88rem; display: grid; gap: 6px; }
  .doc ul { margin: 0; padding-left: 1.1em; }
  pre { background: var(--bg); padding: 8px; border-radius: var(--radius); overflow-x: auto; font-size: 0.8rem; }
  summary { cursor: pointer; font-weight: 600; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 0.78rem; border-bottom: 1px solid var(--line); padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; }
  .nowrap { white-space: nowrap; }
  .pos { color: var(--pos); }
  .cp { font-weight: 500; }
  .detail { display: block; font-size: 0.74rem; color: var(--muted); max-width: 52ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ops select { max-width: 14em; }
  tr.nonexp td { color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .filters input { flex: 1; min-width: 10em; }
  .detail-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .rules { display: grid; gap: 6px; max-height: 360px; overflow-y: auto; }
  .rules input { flex: 1; min-width: 8em; }
  .ghost { border-color: transparent; color: var(--muted); padding: 4px 6px; }
  .link { border: none; background: none; padding: 0; color: var(--calc); text-decoration: underline; cursor: pointer; font: inherit; text-align: left; }
  h2 { font-size: 1.15rem; }
</style>
