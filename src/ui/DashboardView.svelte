<script lang="ts">
  // Onglet « Mes dépenses » : encodage mensuel des relevés et tableau de bord.
  // Tout est calculé dans le navigateur, à partir des opérations gardées dans le profil local.
  import { CATEGORIES, NON_EXPENSE } from '../import/categories';
  import { fullMonths, reclassify, type Tx } from '../import/csv';
  import {
    byMerchant,
    coverage,
    DEFAULT_NATURE,
    detectRecurring,
    isFamilyAllowance,
    isKid,
    isIncome,
    isSpending,
    merchant,
    monthRange,
    monthRows,
    natureOf,
    regularIncomeKeys,
    superfluRate,
    totals,
    type Nature,
  } from '../import/dashboard';
  import { importFiles, ruleFromTx, type FileReport } from '../import/files';
  import type { ProfileState } from '../profile';
  import { eur, monthLabel, pct } from './format';
  import MonthBars from './MonthBars.svelte';

  let { st = $bindable(), txs = $bindable(), gotoReleves }: { st: ProfileState; txs: Tx[]; gotoReleves: () => void } = $props();

  // ---------- Import ----------
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
    const latest = r.reports.map((x) => x.to).filter(Boolean).sort().at(-1);
    if (latest) reviewMonth = latest.slice(0, 7);
  }

  // ---------- Mois disponibles et période ----------
  const allMonths = $derived([...new Set(txs.map((t) => t.date.slice(0, 7)))].sort());
  const full = $derived(new Set(fullMonths(txs)));
  const complete = $derived(allMonths.filter((m) => full.has(m)));
  let period = $state('last12');
  let inclEx = $state(false);
  const periodMonths = $derived.by(() => {
    if (period.startsWith('m:')) return [period.slice(2)];
    if (period.startsWith('y:')) return allMonths.filter((m) => m.startsWith(period.slice(2)));
    const n = period === 'last3' ? 3 : period === 'last6' ? 6 : 12;
    const base = complete.length ? complete : allMonths;
    return base.slice(-n);
  });
  const periodLabel = $derived(
    periodMonths.length === 1 ? monthLabel(periodMonths[0]) : periodMonths.length ? `${monthLabel(periodMonths[0])} à ${monthLabel(periodMonths.at(-1)!)}` : '',
  );
  const prevMonths = $derived.by(() => {
    if (!periodMonths.length) return [];
    const first = periodMonths[0];
    const [y, m] = first.split('-').map(Number);
    const n = periodMonths.length;
    const d = new Date(Date.UTC(y, m - 1 - n, 1));
    const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const r = monthRange(from, first).slice(0, -1);
    return r.every((x) => allMonths.includes(x)) ? r : [];
  });

  // ---------- Calculs ----------
  const rec = $derived(detectRecurring(txs, st.dash));
  const rows = $derived(monthRows(txs, st.dash, { includeExceptional: inclEx }, rec));
  const pick = (ms: string[]) => rows.filter((r) => ms.includes(r.month));
  const cur = $derived(totals(pick(periodMonths)));
  const prev = $derived(prevMonths.length ? totals(pick(prevMonths)) : null);
  const n = $derived(Math.max(1, cur.months));
  const pn = $derived(Math.max(1, prev?.months ?? 1));
  const per = (v: number) => v / n;
  const multi = $derived(periodMonths.length > 1);
  const periodSet = $derived(new Set(periodMonths));
  const periodTxs = $derived(txs.filter((t) => periodSet.has(t.date.slice(0, 7))));
  const merchants = $derived(byMerchant(periodTxs, st.dash, { includeExceptional: inclEx }));
  const rate = $derived(superfluRate(cur));
  const kidsNet = $derived(cur.kidsDirect + cur.kidsEstimated - cur.allowances);
  const fixedRec = $derived(rec.filter((r) => r.sign < 0 && r.active));
  const fixedMonthly = $derived(fixedRec.reduce((a, r) => a + r.monthly, 0));
  const regKeys = $derived(regularIncomeKeys(rec, st.dash));

  function delta(curV: number, prevV: number | undefined, good: 'up' | 'down') {
    if (prevV === undefined || !prev) return null;
    const d = curV / n - prevV / pn;
    if (Math.abs(d) < 1) return null;
    const better = good === 'up' ? d > 0 : d < 0;
    return { text: `${d > 0 ? '+' : '−'}${eur(Math.abs(d))}`, better };
  }

  const cats = $derived(
    Object.entries(cur.byCat)
      .map(([c, v]) => ({ c, v, p: prev?.byCat[c] ?? 0 }))
      .filter((x) => Math.abs(x.v) > 0.5)
      .sort((a, b) => b.v - a.v),
  );
  const catMax = $derived(Math.max(1, ...cats.map((x) => x.v)));

  const incomes = $derived.by(() => {
    const m = new Map<string, { key: string; label: string; total: number; count: number; regular: boolean; allowance: boolean }>();
    for (const t of periodTxs) {
      if (!isIncome(t)) continue;
      const { key, label } = merchant(t);
      const e = m.get(key) ?? { key, label, total: 0, count: 0, regular: regKeys.has(key) || isFamilyAllowance(t), allowance: isFamilyAllowance(t) };
      e.total += t.amount;
      e.count++;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  });

  const kidsByCat = $derived.by(() => {
    const m = new Map<string, number>();
    for (const t of periodTxs) {
      if (!isSpending(t) || (t.exceptional && t.amount < 0 && !inclEx)) continue;
      if (isKid(t, st.dash)) m.set(t.category, (m.get(t.category) ?? 0) - t.amount);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  // Carte de chaleur : 12 derniers mois × principales catégories.
  const heatMonths = $derived(allMonths.slice(-12));
  const heatCats = $derived.by(() => {
    const t = totals(pick(heatMonths));
    return Object.entries(t.byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([c]) => c);
  });
  const rowOf = $derived(new Map(rows.map((r) => [r.month, r])));

  // ---------- Couverture des relevés ----------
  const cov = $derived(coverage(txs));
  const covMonths = $derived(allMonths.slice(-13));

  // ---------- File « à vérifier » ----------
  let reviewMonth = $state('');
  const reviewM = $derived(reviewMonth && allMonths.includes(reviewMonth) ? reviewMonth : (allMonths.at(-1) ?? ''));
  let memorize = $state(true);
  let showAllReview = $state(false);
  const toReview = $derived(
    txs.filter((t) => {
      if (!t.date.startsWith(reviewM)) return false;
      if (t.category === 'À classer') return true;
      if (isIncome(t)) return t.by === 'aucun';
      if (NON_EXPENSE.has(t.category) || t.amount > 0) return false;
      return showAllReview || natureOf(t, st.dash) === undefined;
    }),
  );
  const monthOps = $derived(txs.filter((t) => t.date.startsWith(reviewM)).length);

  function setCat(t: Tx, c: string) {
    t.category = c;
    t.manual = true;
    t.by = 'à la main';
    if (memorize) {
      const r = ruleFromTx(t, c);
      if (r) {
        st.rules = [r, ...st.rules.filter((x) => x.pattern !== r.pattern)];
        txs = reclassify(txs, st.rules, st.ownAccounts);
      }
    }
  }
  function setNature(t: Tx, v: Nature) {
    if (memorize) {
      st.dash.merchantNature[merchant(t).key] = v;
      delete t.nature;
    } else t.nature = v;
  }
  function setKid(t: Tx, v: boolean) {
    if (memorize) {
      st.dash.kidMerchant[merchant(t).key] = v;
      delete t.kid;
    } else t.kid = v;
  }
  function merchantNature(key: string, v: string) {
    if (v) st.dash.merchantNature[key] = v as Nature;
    else delete st.dash.merchantNature[key];
  }
  function catNature(c: string, v: string) {
    st.dash.categoryNature[c] = v as Nature | '';
  }
  const catNat = (c: string) => st.dash.categoryNature[c] || DEFAULT_NATURE[c] || '';

  // ---------- Détail ----------
  let detail: { kind: 'cat' | 'merchant'; value: string; label: string } | null = $state(null);
  let detailEl: HTMLElement | undefined = $state();
  const detailTxs = $derived(
    detail ? periodTxs.filter((t) => (detail!.kind === 'cat' ? t.category === detail!.value : merchant(t).key === detail!.value)).sort((a, b) => (a.date < b.date ? 1 : -1)) : [],
  );
  function show(kind: 'cat' | 'merchant', value: string, label: string) {
    detail = { kind, value, label };
    queueMicrotask(() => detailEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  let merchantLimit = $state(20);
  let allIncomes = $state(false);
  let merchantQ = $state('');
  const shownMerchants = $derived(merchants.filter((m) => !merchantQ || m.label.toLowerCase().includes(merchantQ.toLowerCase())).slice(0, merchantLimit));

  const FREQ = { mensuel: 'mensuel', trimestriel: 'trimestriel', annuel: 'annuel' } as const;
  const COLORS = { utile: 'var(--calc)', optionnel: 'var(--est)', unknown: 'var(--muted)', income: 'var(--pos)' };
</script>

<main class="wrap dash">
  <!-- ================= ENCODER UN MOIS ================= -->
  <section class="panel">
    <div class="head2">
      <h2>Encoder un mois</h2>
      <span class="hint">Les fichiers sont lus dans ce navigateur et ne sont envoyés nulle part.</span>
    </div>
    <div class="enc">
      <div class="steps">
        <ol>
          <li>Dans Beobank et dans CBC, exportez l’historique du compte en <strong>CSV</strong> (au moins le mois écoulé ; une période plus longue ne pose aucun problème).</li>
          <li>Déposez tous les fichiers ici en une fois. Les opérations déjà encodées sont reconnues et ignorées.</li>
          <li>Vérifiez la liste « À vérifier » ci-dessous : chaque choix peut être mémorisé pour les mois suivants.</li>
        </ol>
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
          <span>{busy ? 'Lecture…' : 'Choisir les CSV Beobank et CBC, ou les déposer ici'}</span>
        </label>
        {#if reports.length}
          <ul class="reports">
            {#each reports as r}
              <li>
                <strong>{r.name}</strong> ({r.format}{r.from ? `, du ${r.from.split('-').reverse().join('/')} au ${r.to!.split('-').reverse().join('/')}` : ''}) :
                {r.added} nouvelle{r.added > 1 ? 's' : ''}{r.duplicates ? `, ${r.duplicates} déjà encodée${r.duplicates > 1 ? 's' : ''}` : ''}{r.skipped ? `, ${r.skipped} ligne${r.skipped > 1 ? 's' : ''} ignorée${r.skipped > 1 ? 's' : ''}` : ''}.
                {#each r.warnings as w}<span class="warnline"> {w}</span>{/each}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if cov.accounts.length}
        <div class="cov">
          <h3>Mois encodés</h3>
          <div class="tablewrap">
            <table class="covt">
              <thead>
                <tr><th>Compte</th>{#each covMonths as m}<th class="c">{monthLabel(m).replace(/ 20(\d\d)/, ' $1')}</th>{/each}</tr>
              </thead>
              <tbody>
                {#each cov.accounts as a}
                  <tr>
                    <td class="nowrap">{a.bank}{a.account ? ` · …${a.account.replace(/\s/g, '').slice(-4)}` : ''}</td>
                    {#each covMonths as m}
                      {@const c = cov.cells.get(`${a.id}|${m}`)}
                      <td class="c cell" class:ok={c && c.firstDay <= 5 && c.lastDay >= 25} class:part={c && !(c.firstDay <= 5 && c.lastDay >= 25)} title={c ? `${c.ops} opérations, du ${c.firstDay} au ${c.lastDay}` : 'Aucune opération'}>
                        {c ? c.ops : '–'}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="hint"><span class="key ok"></span> mois complet <span class="key part"></span> mois partiel (début ou fin manquant) · nombre d’opérations par mois.</p>
        </div>
      {/if}
    </div>
  </section>

  {#if !txs.length}
    <section class="panel empty">
      <p>Aucune opération encodée dans ce profil. Déposez vos extraits CSV ci-dessus pour voir le tableau de bord : dépenses par catégorie et par magasin, dépenses récurrentes, part du superflu, coût des enfants et revenus.</p>
    </section>
  {:else}
    <!-- ================= À VÉRIFIER ================= -->
    <section class="panel">
      <div class="head2">
        <h2>À vérifier</h2>
        <div class="row">
          <select aria-label="Mois à vérifier" value={reviewM} onchange={(e) => (reviewMonth = e.currentTarget.value)}>
            {#each [...allMonths].reverse() as m}<option value={m}>{monthLabel(m)}</option>{/each}
          </select>
          <label class="check"><input type="checkbox" bind:checked={memorize} /> Mémoriser mes choix pour ce commerçant</label>
          <label class="check"><input type="checkbox" bind:checked={showAllReview} /> Revoir aussi les dépenses déjà qualifiées</label>
        </div>
      </div>
      <p class="hint">
        {monthLabel(reviewM)} : {monthOps} opérations, dont {toReview.length} à vérifier (catégorie inconnue, ou dépense ni utile ni optionnelle comme les retraits d’espèces).
        Avec « mémoriser », la catégorie devient une règle de classement, et utile/optionnel ou « enfants » s’appliquent à toutes les opérations de ce commerçant.
      </p>
      {#if toReview.length}
        <div class="tablewrap">
          <table class="ops">
            <thead><tr><th>Date</th><th>Commerçant</th><th class="r">Montant</th><th>Catégorie</th><th>Nature</th><th class="c">Enfants</th></tr></thead>
            <tbody>
              {#each toReview.slice(0, 80) as t (t.id)}
                {@const nat = natureOf(t, st.dash)}
                <tr>
                  <td class="nowrap">{t.date.slice(8)}/{t.date.slice(5, 7)}</td>
                  <td><span class="cp">{merchant(t).label}</span><span class="detail" title={t.text}>{t.bank} · {t.text.slice(0, 80)}</span></td>
                  <td class="r num" class:pos={t.amount > 0}>{eur(t.amount, true)}</td>
                  <td>
                    <select aria-label="Catégorie" value={t.category} onchange={(e) => setCat(t, e.currentTarget.value)}>
                      {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
                    </select>
                  </td>
                  <td>
                    {#if t.amount < 0 && !NON_EXPENSE.has(t.category)}
                      <span class="seg" role="group" aria-label="Nature">
                        <button class:on={nat === 'utile'} onclick={() => setNature(t, 'utile')}>Utile</button>
                        <button class:on={nat === 'optionnel'} onclick={() => setNature(t, 'optionnel')}>Optionnel</button>
                      </span>
                    {/if}
                  </td>
                  <td class="c">
                    {#if t.amount < 0 && !NON_EXPENSE.has(t.category)}
                      <input type="checkbox" aria-label="Dépense pour les enfants" checked={isKid(t, st.dash)} onchange={(e) => setKid(t, e.currentTarget.checked)} />
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if toReview.length > 80}<p class="hint">Les 80 premières sont affichées ; les autres apparaissent quand celles-ci sont traitées.</p>{/if}
      {:else}
        <p class="okline">Rien à vérifier pour ce mois.</p>
      {/if}
    </section>

    <!-- ================= PÉRIODE ================= -->
    <section class="panel sticky">
      <div class="row">
        <label for="period"><strong>Période analysée</strong></label>
        <select id="period" bind:value={period}>
          <option value="last12">12 derniers mois complets</option>
          <option value="last6">6 derniers mois complets</option>
          <option value="last3">3 derniers mois complets</option>
          {#each [...new Set(allMonths.map((m) => m.slice(0, 4)))].reverse() as y}<option value="y:{y}">Année {y}</option>{/each}
          {#each [...allMonths].reverse() as m}<option value="m:{m}">{monthLabel(m)}{full.has(m) ? '' : ' (partiel)'}</option>{/each}
        </select>
        <span class="hint">{periodLabel}{multi ? ` · ${periodMonths.length} mois · montants par mois en moyenne` : ''}{prev ? ' · écarts par rapport à la période précédente de même durée' : ''}</span>
        <label class="check"><input type="checkbox" bind:checked={inclEx} /> Inclure les dépenses exceptionnelles</label>
      </div>
    </section>

    <!-- ================= INDICATEURS ================= -->
    <section class="kpis" aria-label="Indicateurs">
      {#snippet tile(label: string, value: string, sub: string, d: { text: string; better: boolean } | null, tone = '')}
        <div class="kpi {tone}">
          <span class="kl">{label}</span>
          <span class="kv num">{value}</span>
          <span class="ks">{sub}</span>
          {#if d}<span class="kd num" class:good={d.better} class:bad={!d.better}>{d.text}/mois</span>{/if}
        </div>
      {/snippet}
      {@render tile('Revenus' + (multi ? ' /mois' : ''), eur(per(cur.income)), `réguliers ${eur(per(cur.incomeRegular))} · ponctuels ${eur(per(cur.incomeOneOff))}`, delta(cur.income, prev?.income, 'up'))}
      {@render tile('Dépenses' + (multi ? ' /mois' : ''), eur(per(cur.spend)), cur.exceptional && !inclEx ? `hors exceptionnel (${eur(per(cur.exceptional))})` : 'hors épargne et virements internes', delta(cur.spend, prev?.spend, 'down'))}
      {@render tile('Reste' + (multi ? ' /mois' : ''), eur(per(cur.income - cur.spend), true), `mis de côté : ${eur(per(cur.saved))}`, delta(cur.income - cur.spend, prev ? prev.income - prev.spend : undefined, 'up'), cur.income - cur.spend < 0 ? 'neg' : 'pos')}
      {@render tile('Superflu', pct(rate), `${eur(per(cur.optionnel))}${multi ? '/mois' : ''} optionnels${cur.unknown > 1 ? ` · ${eur(per(cur.unknown))} non qualifiés` : ''}`, delta(cur.optionnel, prev?.optionnel, 'down'), 'est')}
      {@render tile('Enfants' + (multi ? ' /mois' : ''), eur(per(kidsNet)), `direct ${eur(per(cur.kidsDirect))} + estimé ${eur(per(cur.kidsEstimated))} − allocations ${eur(per(cur.allowances))}`, delta(kidsNet, prev ? prev.kidsDirect + prev.kidsEstimated - prev.allowances : undefined, 'down'))}
      {@render tile('Charges récurrentes', eur(fixedMonthly), `${fixedRec.length} paiements actifs, en équivalent mensuel`, null)}
    </section>

    <!-- ================= ÉVOLUTION ================= -->
    <section class="panel">
      <h2>Évolution mois par mois</h2>
      <MonthBars
        months={allMonths}
        stacks={[
          { name: 'Utiles', color: COLORS.utile, values: allMonths.map((m) => rowOf.get(m)?.utile ?? 0) },
          { name: 'Optionnelles', color: COLORS.optionnel, values: allMonths.map((m) => rowOf.get(m)?.optionnel ?? 0) },
          { name: 'Non qualifiées', color: COLORS.unknown, values: allMonths.map((m) => rowOf.get(m)?.unknown ?? 0) },
        ]}
        line={{ name: 'Revenus', color: COLORS.income, values: allMonths.map((m) => rowOf.get(m)?.income ?? 0) }}
        label="Dépenses par nature et revenus"
        selected={periodMonths}
        onpick={(m) => (period = `m:${m}`)}
      />
      <details>
        <summary>Tableau mois par mois</summary>
        <div class="tablewrap">
          <table class="months">
            <thead><tr><th>Mois</th><th class="r">Revenus</th><th class="r">dont réguliers</th><th class="r">Dépenses</th><th class="r">Utiles</th><th class="r">Optionnelles</th><th class="r">Superflu</th><th class="r">Enfants (direct)</th><th class="r">Exceptionnel</th><th class="r">Reste</th></tr></thead>
            <tbody>
              {#each [...rows].reverse() as r}
                <tr class:sel={periodSet.has(r.month)}>
                  <td class="nowrap"><button class="link" onclick={() => (period = `m:${r.month}`)}>{monthLabel(r.month)}</button>{full.has(r.month) ? '' : ' *'}</td>
                  <td class="r num">{eur(r.income)}</td>
                  <td class="r num">{eur(r.incomeRegular)}</td>
                  <td class="r num">{eur(r.spend)}</td>
                  <td class="r num">{eur(r.utile)}</td>
                  <td class="r num">{eur(r.optionnel)}</td>
                  <td class="r num">{pct(superfluRate(r))}</td>
                  <td class="r num">{eur(r.kidsDirect)}</td>
                  <td class="r num">{r.exceptional ? eur(r.exceptional) : '—'}</td>
                  <td class="r num" class:pos={r.income - r.spend > 0} class:negc={r.income - r.spend < 0}>{eur(r.income - r.spend, true)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="hint">* mois partiel (relevés incomplets).</p>
      </details>
    </section>

    <div class="two">
      <!-- ================= CATÉGORIES ================= -->
      <section class="panel">
        <h2>Par type de dépense</h2>
        <p class="hint">Cliquez une catégorie pour voir ses opérations. La nature choisie ici vaut pour toute la catégorie ; un commerçant ou une opération peut la remplacer.</p>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Catégorie</th><th class="r">{multi ? 'Par mois' : 'Total'}</th><th class="bar-h"></th><th class="r">Écart</th><th>Nature</th></tr></thead>
            <tbody>
              {#each cats as x}
                {@const d = prev ? x.v / n - x.p / pn : 0}
                <tr>
                  <td><button class="link" onclick={() => show('cat', x.c, x.c)}>{x.c}</button></td>
                  <td class="r num">{eur(per(x.v))}</td>
                  <td class="bar-c"><span class="bar" style="width:{Math.max(0, (x.v / catMax) * 100)}%; background:{catNat(x.c) === 'optionnel' ? COLORS.optionnel : catNat(x.c) === 'utile' ? COLORS.utile : COLORS.unknown}"></span></td>
                  <td class="r num small" class:up={d > 5} class:down={d < -5}>{prev && Math.abs(d) >= 1 ? `${d > 0 ? '+' : '−'}${eur(Math.abs(d))}` : ''}</td>
                  <td>
                    <select class="mini" aria-label="Nature de {x.c}" value={st.dash.categoryNature[x.c] ?? ''} onchange={(e) => catNature(x.c, e.currentTarget.value)}>
                      <option value="">{DEFAULT_NATURE[x.c] ? `${DEFAULT_NATURE[x.c] === 'utile' ? 'Utile' : 'Optionnel'} (défaut)` : 'À qualifier'}</option>
                      <option value="utile">Utile</option>
                      <option value="optionnel">Optionnel</option>
                    </select>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <!-- ================= COMMERÇANTS ================= -->
      <section class="panel">
        <div class="head2">
          <h2>Par magasin et commerçant</h2>
          <input class="search" aria-label="Chercher un commerçant" placeholder="Chercher…" bind:value={merchantQ} />
        </div>
        <p class="hint">Les magasins d’une même enseigne sont regroupés (tous les Delhaize ensemble). Remboursements déduits.</p>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Commerçant</th><th class="r">{multi ? 'Par mois' : 'Total'}</th><th class="r">Achats</th><th class="r">Panier moyen</th><th>Nature</th><th class="c">Enfants</th></tr></thead>
            <tbody>
              {#each shownMerchants as m (m.key)}
                <tr>
                  <td><button class="link" onclick={() => show('merchant', m.key, m.label)}>{m.label}</button><span class="detail">{m.category}</span></td>
                  <td class="r num">{eur(per(m.total))}</td>
                  <td class="r num">{m.count}</td>
                  <td class="r num">{eur(m.average)}</td>
                  <td>
                    <select class="mini" aria-label="Nature de {m.label}" value={st.dash.merchantNature[m.key] ?? ''} onchange={(e) => merchantNature(m.key, e.currentTarget.value)}>
                      <option value="">{m.nature === 'utile' ? 'Utile (auto)' : m.nature === 'optionnel' ? 'Optionnel (auto)' : 'À qualifier'}</option>
                      <option value="utile">Utile</option>
                      <option value="optionnel">Optionnel</option>
                    </select>
                  </td>
                  <td class="c"><input type="checkbox" aria-label="Dépenses de {m.label} pour les enfants" checked={m.kid} onchange={(e) => (st.dash.kidMerchant[m.key] = e.currentTarget.checked)} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if merchants.length > merchantLimit && !merchantQ}<button onclick={() => (merchantLimit += 30)}>Afficher plus ({merchants.length} commerçants)</button>{/if}
      </section>
    </div>

    <!-- ================= DÉTAIL ================= -->
    {#if detail}
      <section class="panel" bind:this={detailEl}>
        <div class="head2">
          <h2>{detail.label} · {periodLabel}</h2>
          <button class="ghost" onclick={() => (detail = null)}>Fermer</button>
        </div>
        <p class="hint">{detailTxs.length} opérations, total {eur(detailTxs.reduce((a, t) => a + t.amount, 0), true)}. Changer une catégorie ici la mémorise si « Mémoriser mes choix » est coché plus haut.</p>
        <div class="tablewrap">
          <table class="ops">
            <thead><tr><th>Date</th><th>Commerçant</th><th class="r">Montant</th><th>Catégorie</th><th class="c" title="Exclue des moyennes">Except.</th></tr></thead>
            <tbody>
              {#each detailTxs.slice(0, 200) as t (t.id)}
                <tr>
                  <td class="nowrap">{t.date.split('-').reverse().join('/')}</td>
                  <td><span class="cp">{merchant(t).label}</span><span class="detail" title={t.text}>{t.bank} · {t.text.slice(0, 80)}</span></td>
                  <td class="r num" class:pos={t.amount > 0}>{eur(t.amount, true)}</td>
                  <td>
                    <select aria-label="Catégorie" value={t.category} onchange={(e) => setCat(t, e.currentTarget.value)}>
                      {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
                    </select>
                  </td>
                  <td class="c"><input type="checkbox" aria-label="Exceptionnelle" bind:checked={t.exceptional} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <!-- ================= RÉCURRENTS ================= -->
    <section class="panel">
      <div class="head2">
        <h2>Dépenses récurrentes détectées</h2>
        {#if st.dash.notRecurring.length}<button class="ghost" onclick={() => (st.dash.notRecurring = [])}>Rétablir les {st.dash.notRecurring.length} écartées</button>{/if}
      </div>
      <p class="hint">Même bénéficiaire, montant stable, chaque mois, trimestre ou année (sur tout l’historique encodé). Les courses, dont le montant varie, n’en font pas partie. Une hausse de plus de 3 % du dernier paiement est signalée.</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Bénéficiaire</th><th>Catégorie</th><th>Rythme</th><th class="r">Montant</th><th class="r">Par mois</th><th>Dernier</th><th></th></tr></thead>
          <tbody>
            {#each rec.filter((r) => r.sign < 0) as r (r.key)}
              <tr class:stopped={!r.active}>
                <td>
                  {r.label}
                  {#if r.isNew}<span class="tag">nouveau</span>{/if}
                  {#if !r.active}<span class="tag">arrêté ?</span>{/if}
                  {#if r.change > 0.03}<span class="tag up">+{Math.round(r.change * 100)} %</span>{/if}
                </td>
                <td class="small">{r.category}</td>
                <td class="small">{FREQ[r.frequency]} · {r.count}×</td>
                <td class="r num">{eur(r.amount)}</td>
                <td class="r num">{eur(r.monthly)}</td>
                <td class="nowrap small">{r.last.split('-').reverse().join('/')}</td>
                <td><button class="ghost" title="Ce n’est pas une dépense récurrente" onclick={() => st.dash.notRecurring.push(r.key)}>Écarter</button></td>
              </tr>
            {/each}
          </tbody>
          <tfoot><tr><td colspan="4">Total des paiements récurrents actifs</td><td class="r num">{eur(fixedMonthly)}</td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>
    </section>

    <div class="two">
      <!-- ================= REVENUS ================= -->
      <section class="panel">
        <h2>Revenus réguliers et ponctuels</h2>
        <p class="hint">Régulier : versé chaque mois (salaires, allocations, ONEM). Ponctuel : remboursements, primes isolées, cadeaux, ventes. Corrigez si besoin ; le choix vaut pour cet émetteur.</p>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Émetteur</th><th class="r">{multi ? 'Par mois' : 'Total'}</th><th class="r">Versements</th><th>Type</th></tr></thead>
            <tbody>
              {#each allIncomes ? incomes : incomes.slice(0, 8) as i (i.key)}
                <tr>
                  <td>{i.label}{#if i.allowance}<span class="tag">allocations familiales</span>{/if}</td>
                  <td class="r num">{eur(per(i.total))}</td>
                  <td class="r num">{i.count}</td>
                  <td>
                    {#if i.allowance}
                      <span class="small">Régulier</span>
                    {:else}
                      <select class="mini" aria-label="Type de revenu" value={i.regular ? 'regulier' : 'ponctuel'} onchange={(e) => (st.dash.incomeKind[i.key] = e.currentTarget.value as 'regulier' | 'ponctuel')}>
                        <option value="regulier">Régulier</option>
                        <option value="ponctuel">Ponctuel</option>
                      </select>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              {#if incomes.length > 8 && !allIncomes}<tr><td colspan="4"><button class="link" onclick={() => (allIncomes = true)}>Afficher les {incomes.length - 8} autres émetteurs</button></td></tr>{/if}
              <tr><td>Réguliers</td><td class="r num">{eur(per(cur.incomeRegular))}</td><td colspan="2"></td></tr>
              <tr><td>Ponctuels</td><td class="r num">{eur(per(cur.incomeOneOff))}</td><td colspan="2"></td></tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- ================= ENFANTS ================= -->
      <section class="panel">
        <h2>Coût des enfants</h2>
        <p class="hint">
          Direct : crèche, école, stages et activités, babysitting, et les magasins ou opérations cochés « enfants ». Estimé : une part des courses, vêtements et santé.
        </p>
        <div class="tablewrap">
          <table>
            <tbody>
              {#each kidsByCat as [c, v]}
                <tr><td>{c}</td><td class="r num">{eur(per(v))}</td></tr>
              {/each}
              <tr class="sub"><td>Coûts directs</td><td class="r num">{eur(per(cur.kidsDirect))}</td></tr>
              <tr>
                <td>
                  Part estimée des courses, vêtements et santé :
                  <input class="pctin" type="number" min="0" max="100" step="5" aria-label="Part des enfants en pour cent" value={Math.round(st.dash.kidsShare * 100)} onchange={(e) => (st.dash.kidsShare = Math.min(1, Math.max(0, Number(e.currentTarget.value) / 100)))} /> %
                </td>
                <td class="r num est">{eur(per(cur.kidsEstimated))}</td>
              </tr>
              <tr><td>Allocations familiales reçues</td><td class="r num pos">−{eur(per(cur.allowances))}</td></tr>
              <tr class="sub"><td><strong>Coût net{multi ? ' par mois' : ''}</strong></td><td class="r num"><strong>{eur(per(kidsNet))}</strong></td></tr>
            </tbody>
          </table>
        </div>
        {#if st.existing.length}<p class="hint">Soit {eur(per(kidsNet) / st.existing.length)} par enfant et par mois pour {st.existing.length} enfants (profil).</p>{/if}
      </section>
    </div>

    <!-- ================= CARTE DE CHALEUR ================= -->
    <section class="panel">
      <h2>Catégories mois par mois</h2>
      <p class="hint">12 derniers mois encodés. Plus la case est foncée, plus le mois est élevé pour cette catégorie (comparé à ses autres mois).</p>
      <div class="tablewrap">
        <table class="heat">
          <thead><tr><th>Catégorie</th>{#each heatMonths as m}<th class="r">{monthLabel(m).replace(/ 20(\d\d)/, ' $1')}</th>{/each}<th class="r">Moyenne</th></tr></thead>
          <tbody>
            {#each heatCats as c}
              {@const vals = heatMonths.map((m) => rowOf.get(m)?.byCat[c] ?? 0)}
              {@const mx = Math.max(1, ...vals)}
              <tr>
                <td class="nowrap">{c}</td>
                {#each vals as v}
                  <td class="r num hc" style="--a:{Math.round(Math.max(0, v / mx) * 45)}%">{v ? Math.round(v).toLocaleString('fr-BE') : ''}</td>
                {/each}
                <td class="r num"><strong>{Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)).toLocaleString('fr-BE')}</strong></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="hint">Liste complète des opérations, règles de classement et vos comptes : onglet <button class="link" onclick={gotoReleves}>Relevés bancaires</button>.</p>
    </section>
  {/if}
</main>

<style>
  .wrap { max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .dash { display: grid; gap: 16px; padding-block: 20px 48px; }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px; min-width: 0; align-content: start; }
  .sticky { padding-block: 10px; }
  @media (min-width: 860px) { .sticky { position: sticky; top: 0; z-index: 2; } }
  .hint { font-size: 0.82rem; color: var(--muted); }
  .head2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .enc { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; }
  @media (max-width: 860px) { .enc { grid-template-columns: minmax(0, 1fr); } }
  .steps { display: grid; gap: 10px; align-content: start; }
  ol { margin: 0; padding-left: 1.2em; font-size: 0.88rem; display: grid; gap: 4px; }
  .drop { display: grid; place-items: center; gap: 8px; border: 2px dashed var(--line); border-radius: var(--radius); padding: 22px 12px; text-align: center; cursor: pointer; background: var(--bg); }
  .drop.on { border-color: var(--calc); background: var(--calc-soft); }
  .drop input { max-width: 100%; }
  .reports { margin: 0; padding-left: 1.1em; font-size: 0.86rem; display: grid; gap: 4px; }
  .warnline { color: var(--neg); }
  .okline { color: var(--pos); font-size: 0.9rem; }
  .cov { display: grid; gap: 6px; min-width: 0; align-content: start; }
  .covt td, .covt th { padding: 4px 5px; font-size: 0.76rem; }
  .cell { color: var(--muted); }
  .cell.ok { background: var(--calc-soft); color: var(--ink); }
  .cell.part { background: var(--est-soft); color: var(--ink); }
  .key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: -1px; margin-left: 6px; }
  .key.ok { background: var(--calc-soft); border: 1px solid var(--calc); }
  .key.part { background: var(--est-soft); border: 1px solid var(--est); }
  .empty p { font-size: 0.95rem; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 0.78rem; border-bottom: 1px solid var(--line); padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tfoot td { font-weight: 600; border-bottom: none; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; }
  .nowrap { white-space: nowrap; }
  .small { font-size: 0.8rem; color: var(--muted); }
  .pos { color: var(--pos); }
  .negc { color: var(--neg); }
  .est { color: var(--est); }
  .up { color: var(--neg); }
  .down { color: var(--pos); }
  .cp { font-weight: 500; }
  .detail { display: block; font-size: 0.74rem; color: var(--muted); max-width: 46ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ops select { max-width: 14em; }
  .mini { font-size: 0.8rem; padding: 3px 4px; max-width: 11em; }
  .row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
  .check { display: inline-flex; gap: 6px; align-items: center; font-size: 0.86rem; }
  .seg { display: inline-flex; }
  .seg button { padding: 3px 8px; font-size: 0.78rem; border-radius: 0; }
  .seg button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
  .seg button:last-child { border-radius: 0 var(--radius) var(--radius) 0; margin-left: -1px; }
  .seg button.on { background: var(--calc); color: var(--surface); border-color: var(--calc); }
  .seg button.on:last-child { background: var(--est); border-color: var(--est); }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 2px; align-content: start; }
  .kl { font-size: 0.8rem; color: var(--muted); font-weight: 600; }
  .kv { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; line-height: 1.15; }
  .kpi.pos .kv { color: var(--pos); }
  .kpi.neg .kv { color: var(--neg); }
  .kpi.est .kv { color: var(--est); }
  .ks { font-size: 0.76rem; color: var(--muted); }
  .kd { font-size: 0.76rem; }
  .kd.good { color: var(--pos); }
  .kd.bad { color: var(--neg); }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 16px; }
  .bar-h { width: 30%; }
  .bar-c { width: 30%; vertical-align: middle; }
  .bar { display: block; height: 8px; border-radius: 2px; min-width: 2px; }
  .months tr.sel td { background: var(--calc-soft); }
  .stopped td { color: var(--muted); }
  .tag { display: inline-block; font-size: 0.7rem; padding: 0 6px; margin-left: 6px; border-radius: 9px; background: var(--bg); border: 1px solid var(--line); color: var(--muted); }
  .tag.up { color: var(--neg); border-color: var(--neg); }
  tr.sub td { border-top: 1px solid var(--ink); }
  .pctin { width: 4.5em; padding: 2px 4px; }
  .search { max-width: 14em; }
  .heat td, .heat th { padding: 4px 6px; font-size: 0.78rem; }
  .hc { background: color-mix(in srgb, var(--calc) var(--a), transparent); }
  .ghost { border-color: transparent; color: var(--muted); padding: 4px 6px; }
  .link { border: none; background: none; padding: 0; color: var(--calc); text-decoration: underline; cursor: pointer; font: inherit; text-align: left; }
  summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; }
  h2 { font-size: 1.15rem; }
  h3 { font-size: 0.95rem; }
</style>
