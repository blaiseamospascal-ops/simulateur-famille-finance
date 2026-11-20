<script lang="ts">
  import { budgetYears, holdFor, monthlyTotal, spendingCeiling, VARIANTS, type Variant } from '../engine/budget';
  import { ymIndex } from '../engine/simulate';
  import type { Comparison, Household, Situation } from '../engine/types';
  import { CATEGORIES } from '../import/categories';
  import type { ProfileState, Scen } from '../profile';
  import { eur, uid } from './format';
  import MultiLine from './MultiLine.svelte';

  let {
    st = $bindable(),
    all,
    household,
    base,
    toSituation,
    colors,
  }: { st: ProfileState; all: Comparison[]; household: Household; base: Situation; toSituation: (s: Scen) => Situation; colors: string[] } = $props();

  const NONE: Variant = { cutLevel: 0, oneCar: false };
  const b = $derived(st.budget);
  const parents = $derived<('A' | 'B')[]>(household.B ? ['A', 'B'] : ['A']);
  const baseRows = $derived(budgetYears(b, all[0].base, base, NONE, parents));
  const scenRows = $derived(all.map((c, i) => budgetYears(b, c.scenario, toSituation(st.scenarios[i]), st.scenarios[i].variant ?? NONE, parents)));
  const ai = $derived(Math.min(st.active, st.scenarios.length - 1));
  const cur = $derived(st.scenarios[ai]);
  const rows = $derived(scenRows[ai]);
  const years = $derived(baseRows.map((r) => r.year));
  const N = $derived(Math.max(1, Math.min(b.holdYears, years.length)));

  const matrix = $derived(
    VARIANTS.map((v) => {
      const r = budgetYears(b, all[ai].scenario, toSituation(cur), v.v, parents);
      return { ...v, hold: holdFor(r, N, b.cushion, b.liquid), firstFull: r[1] ?? r[0] };
    }),
  );
  const ceiling = $derived(spendingCeiling(rows, N, b.liquid, b.cushion));
  const credits0 = $derived(rows[0] ? rows[0].credits / 12 : 0);
  const today = $derived(monthlyTotal(b.items, ymIndex(`${b.startYear - 1}-11`)));
  const variantLabel = (v?: Variant) => VARIANTS.find((x) => x.v.cutLevel === (v?.cutLevel ?? 0) && x.v.oneCar === (v?.oneCar ?? false))?.label ?? '';
  const cutTotal = $derived(b.items.reduce((a, it) => a + (it.cut ?? 0), 0));

  const curVariant = $derived(cur.variant ?? NONE);
  const curHold = $derived(holdFor(rows, N, b.cushion, b.liquid));
  const firstDeficit = $derived(rows.find((r) => r.surplus < 0));

  // Impôt : avantage enfants à charge et quotient conjugal, pour une année choisie.
  let taxYear = $state(0);
  const taxIdx = $derived.by(() => {
    const i = all[ai].scenario.findIndex((y) => y.year === (taxYear || b.startYear + 1));
    return i >= 0 ? i : 0;
  });
  const tb = $derived(all[ai].base[taxIdx]);
  const ts = $derived(all[ai].scenario[taxIdx]);

  function setVariant(v: Variant) {
    st.scenarios[ai].variant = { ...v };
  }
  function addItem() {
    st.budget.items.push({ id: uid(), label: 'Nouveau poste', category: 'Divers', monthly: 0 });
  }
</script>

<main class="wrap budget">
  <section class="panel lead" aria-live="polite">
    <div class="scen-pick">
      <label for="b-scen">Scénario</label>
      <select id="b-scen" value={ai} onchange={(e) => (st.active = Number(e.currentTarget.value))}>
        {#each st.scenarios as sc, i}<option value={i}>{sc.name}</option>{/each}
      </select>
      <label for="b-var">avec</label>
      <select id="b-var" value={VARIANTS.findIndex((x) => x.v.cutLevel === curVariant.cutLevel && x.v.oneCar === curVariant.oneCar)} onchange={(e) => setVariant(VARIANTS[Number(e.currentTarget.value)].v)}>
        {#each VARIANTS as v, i}<option value={i}>{v.label}</option>{/each}
      </select>
    </div>
    <p class="v-lead">
      {#if firstDeficit}
        Avec « {cur.name} », le budget est en déficit dès {firstDeficit.year} :
        <strong class="neg num">{eur(firstDeficit.surplus / 12, true)} par mois</strong> avant placements.
      {:else}
        Avec « {cur.name} », le budget reste positif chaque année de {years[0]} à {years.at(-1)}.
      {/if}
      Pour tenir {N} ans ({years[0]}–{years[N - 1]}) sans rien verser aux placements, il faut
      <strong class="num">{eur(curHold.needed)}</strong> d’épargne au départ, coussin de {eur(b.cushion)} compris.
      Vous avez <strong class="num">{eur(b.liquid)}</strong> :
      {#if curHold.breaksIn}
        <span class="neg">l’épargne passerait sous le coussin en {curHold.breaksIn}.</span>
      {:else}
        <span class="pos">c’est suffisant{curHold.lowestYear ? `, avec un point bas en ${curHold.lowestYear}` : ''}.</span>
      {/if}
    </p>
    <div class="tiles">
      <div class="tile">
        <span class="t-label">Plafond de dépenses courantes pour tenir {N} ans</span>
        <span class="t-val num">{eur(ceiling)} /mois</span>
        <span class="t-sub">hors crédits, aux prix de {b.priceYear}, puis suit l’inflation. Tout compris en {years[0]} : {eur(ceiling + credits0)} /mois.</span>
      </div>
      <div class="tile">
        <span class="t-label">Dépenses actuelles (novembre {b.startYear - 1})</span>
        <span class="t-val num">{eur(today.living + today.credits)} /mois</span>
        <span class="t-sub">dont {eur(today.credits)} de crédits. Budget serré : {eur(today.living + today.credits - cutTotal)} /mois.</span>
      </div>
      <div class="tile">
        <span class="t-label">Épargne et placements</span>
        <span class="t-val num">{eur(b.liquid)}</span>
        <span class="t-sub">disponible ; placements {eur(b.invested)}, non comptés pour tenir.</span>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>Combien d’épargne pour tenir {N} ans ?</h2>
    <p class="hint">Scénario « {cur.name} ». Coupes du budget serré : {eur(cutTotal)} par mois au total (colonne « Économie possible » ci-dessous). Une seule voiture : {eur(b.oneCarSaving)} par mois en moins.</p>
    <div class="tablewrap">
      <table>
        <thead>
          <tr><th>Variante</th><th class="r">Solde {matrix[0]?.firstFull?.year ?? ''} /mois</th><th class="r">Épargne nécessaire</th><th class="r">Au plus bas</th><th class="r">Avec {eur(b.liquid)}</th></tr>
        </thead>
        <tbody>
          {#each matrix as m}
            <tr class:sel={m.v.cutLevel === curVariant.cutLevel && m.v.oneCar === curVariant.oneCar} onclick={() => setVariant(m.v)}>
              <td>{m.label}</td>
              <td class="r num" class:neg={m.firstFull.surplus < 0} class:pos={m.firstFull.surplus >= 0}>{eur(m.firstFull.surplus / 12, true)}</td>
              <td class="r num"><strong>{eur(m.hold.needed)}</strong></td>
              <td class="r">{m.hold.lowestYear ?? '—'}</td>
              <td class="r">{#if m.hold.breaksIn}<span class="neg">insuffisant ({m.hold.breaksIn})</span>{:else}<span class="pos">tient</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="hint">Calcul en fin d’année, versements aux placements suspendus, coussin de sécurité jamais entamé. Cliquez une ligne pour l’appliquer au scénario.</p>
  </section>

  <section class="panel">
    <MultiLine
      label="Épargne disponible projetée (après versements aux placements)"
      {years}
      series={[{ name: 'Situation actuelle', color: 'var(--ink)', values: baseRows.map((r) => Math.round(r.liquid)), dashed: true }, ...scenRows.map((r, i) => ({ name: `${st.scenarios[i].name}${st.scenarios[i].variant && (st.scenarios[i].variant!.cutLevel || st.scenarios[i].variant!.oneCar) ? ` (${variantLabel(st.scenarios[i].variant).toLowerCase()})` : ''}`, color: colors[i], values: r.map((x) => Math.round(x.liquid)) }))]}
    />
    <p class="hint">Coussin de sécurité : {eur(b.cushion)}. Placements : {eur(b.investYearly)} par an{b.investOnlyIfSurplus ? ', seulement les années où le budget le permet' : ''}, rendement {(b.investReturn * 100).toFixed(1)} %.</p>
  </section>

  <section class="panel">
    <div class="detail-head">
      <h2>Impôt : ce qui est déjà compté</h2>
      <select aria-label="Année" value={tb.year} onchange={(e) => (taxYear = Number(e.currentTarget.value))}>
        {#each all[ai].scenario as y}<option value={y.year}>{y.year}</option>{/each}
      </select>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Par mois, {tb.year}</th><th class="r">Situation actuelle</th><th class="r">{cur.name}</th></tr></thead>
        <tbody>
          <tr><td>Impôt en moins grâce aux enfants à charge</td><td class="r num">{eur(tb.indicators.childTaxBenefit / 12)}</td><td class="r num">{eur(ts.indicators.childTaxBenefit / 12)}</td></tr>
          <tr><td>Impôt en moins grâce à l’imposition commune (quotient conjugal, quotité exemptée transférée)</td><td class="r num">{eur(tb.indicators.quotientGain / 12)}</td><td class="r num">{eur(ts.indicators.quotientGain / 12)}</td></tr>
          <tr><td>Revenu net du ménage (salaires, ONEM, allocations, impôt final)</td><td class="r num">{eur((baseRows.find((r) => r.year === tb.year)?.publicNet ?? tb.computedNet) / 12)}</td><td class="r num">{eur((rows.find((r) => r.year === tb.year)?.publicNet ?? ts.computedNet) / 12)}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="hint">
      Le simulateur calcule l’impôt final du ménage : l’avantage des enfants à charge y est compté une seule fois, quel que soit le parent qui les a sur sa fiche de paie.
      Si un parent arrête, faites passer les enfants sur la fiche de paie de l’autre : sinon l’avantage arrive seulement au remboursement d’impôt, un an et demi plus tard.
      Quand un conjoint gagne peu ou rien, sa quotité exemptée inutilisée passe à l’autre et le quotient conjugal lui attribue une part du revenu ; ce dernier baisse avec la réforme votée (plafond 6 730 € dès 2029).
    </p>
  </section>

  <section class="panel">
    <h2>Année par année : {cur.name}</h2>
    <div class="tablewrap">
      <table class="years">
        <thead>
          <tr><th>Année</th><th class="r">Revenus nets</th><th class="r">Dépenses courantes</th><th class="r">Crédits</th><th class="r">Ponctuel et bébé</th><th class="r">Solde /mois</th><th class="r">Placé</th><th class="r">Épargne dispo</th><th class="r">Placements</th></tr>
        </thead>
        <tbody>
          {#each rows as r}
            <tr>
              <td>{r.year}</td>
              <td class="r num">{eur(r.income / 12)}</td>
              <td class="r num">{eur(r.living / 12)}</td>
              <td class="r num">{eur(r.credits / 12)}</td>
              <td class="r num">{r.oneOffs + r.newChildren ? eur(r.oneOffs + r.newChildren) : '—'}</td>
              <td class="r num" class:pos={r.surplus >= 0} class:neg={r.surplus < 0}>{eur(r.surplus / 12, true)}</td>
              <td class="r num">{r.invest ? eur(r.invest) : '—'}</td>
              <td class="r num" class:neg={r.liquid < b.cushion}>{eur(r.liquid)}</td>
              <td class="r num">{eur(r.invested)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>Vos dépenses</h2>
    <p class="hint">Montants par mois, aux prix de {b.priceYear}. Importez vos relevés dans « Relevés bancaires » pour remplir ces montants automatiquement. « Fin » = dernier mois payé (fin d’un crédit, de la crèche…).</p>
    <div class="tablewrap">
      <table class="edit">
        <thead>
          <tr><th>Poste</th><th>Catégorie</th><th class="r">€/mois</th><th class="r">Économie possible</th><th>Début</th><th>Fin</th><th title="Montant fixe, non indexé">Crédit</th><th title="S'arrête quand un parent ne travaille pas">Tombe si parent à la maison</th><th></th></tr>
        </thead>
        <tbody>
          {#each st.budget.items as it, i (it.id)}
            <tr>
              <td><input aria-label="Poste" bind:value={it.label} />{#if it.note}<span class="detail">{it.note}</span>{/if}</td>
              <td>
                <select aria-label="Catégorie" bind:value={it.category}>
                  {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
                  {#if !CATEGORIES.includes(it.category as any)}<option value={it.category}>{it.category}</option>{/if}
                </select>
              </td>
              <td class="r"><input class="num" aria-label="Montant mensuel" type="number" step="10" bind:value={it.monthly} /></td>
              <td class="r"><input class="num" aria-label="Économie possible en budget serré" type="number" min="0" step="10" bind:value={it.cut} placeholder="0" /></td>
              <td><input aria-label="Début" type="month" bind:value={it.from} /></td>
              <td><input aria-label="Fin" type="month" bind:value={it.to} /></td>
              <td class="c"><input aria-label="Crédit" type="checkbox" bind:checked={it.credit} /></td>
              <td class="c"><input aria-label="Tombe si un parent est à la maison" type="checkbox" bind:checked={it.dropsIfParentHome} /></td>
              <td><button class="ghost" aria-label="Retirer {it.label}" onclick={() => st.budget.items.splice(i, 1)}>×</button></td>
            </tr>
          {/each}
          <tr class="total"><td>Total aujourd’hui</td><td></td><td class="r num">{eur(today.living + today.credits)}</td><td class="r num">{eur(cutTotal)}</td><td colspan="5"></td></tr>
        </tbody>
      </table>
    </div>
    <button onclick={addItem}>Ajouter un poste</button>
  </section>

  <div class="two">
    <section class="panel">
      <h2>Autres revenus nets</h2>
      <p class="hint">Hors salaires, allocations familiales et ONEM, déjà calculés par le simulateur : charge de cours, remboursements de mutuelle, loyers…</p>
      {#each st.budget.incomes as inc, i (inc.id)}
        <div class="rowline">
          <input aria-label="Revenu" class="grow" bind:value={inc.label} />
          <label class="inline"><input class="num s" type="number" step="10" bind:value={inc.monthlyNet} /> €/mois</label>
          <label class="inline"><input class="num xs" type="number" min="1" max="12" bind:value={inc.monthsPerYear} /> mois/an</label>
          <label class="inline">du <input type="month" bind:value={inc.from} /></label>
          <label class="inline">au <input type="month" bind:value={inc.to} /></label>
          <button class="ghost" onclick={() => st.budget.incomes.splice(i, 1)}>×</button>
        </div>
      {/each}
      <button onclick={() => st.budget.incomes.push({ id: uid(), label: 'Autre revenu', monthlyNet: 0, monthsPerYear: 12 })}>Ajouter un revenu</button>
    </section>

    <section class="panel">
      <h2>Dépenses ponctuelles</h2>
      <p class="hint">Travaux, voiture à remplacer… Un montant négatif est une rentrée (prime, vente).</p>
      {#each st.budget.oneOffs as o, i (o.id)}
        <div class="rowline">
          <input aria-label="Dépense" class="grow" bind:value={o.label} />
          <label class="inline"><input class="num s" type="number" step="100" bind:value={o.amount} /> €</label>
          <label class="inline">en <input type="month" bind:value={o.date} /></label>
          <button class="ghost" onclick={() => st.budget.oneOffs.splice(i, 1)}>×</button>
        </div>
      {/each}
      <button onclick={() => st.budget.oneOffs.push({ id: uid(), label: 'Dépense', amount: 1000, date: `${b.startYear}-06` })}>Ajouter une dépense ponctuelle</button>
    </section>
  </div>

  <section class="panel">
    <h2>Épargne et hypothèses</h2>
    <div class="assump">
      <label for="b-liquid">Épargne disponible au 1er janvier</label>
      <div class="unit"><input id="b-liquid" type="number" step="500" bind:value={st.budget.liquid} /><span>€</span></div>
      <label for="b-start">Année de départ</label>
      <div class="unit"><input id="b-start" type="number" min={all[0].base[0].year} max={all[0].base.at(-1)!.year} bind:value={st.budget.startYear} /></div>
      <label for="b-cushion">Coussin de sécurité à garder</label>
      <div class="unit"><input id="b-cushion" type="number" step="500" bind:value={st.budget.cushion} /><span>€</span></div>
      <label for="b-hold">Années à tenir</label>
      <div class="unit"><input id="b-hold" type="number" min="1" max="30" bind:value={st.budget.holdYears} /><span>ans</span></div>
      <label for="b-inv">Placements (ETF…), à ne pas toucher</label>
      <div class="unit"><input id="b-inv" type="number" step="1000" bind:value={st.budget.invested} /><span>€</span></div>
      <label for="b-invy">Versement aux placements</label>
      <div class="unit"><input id="b-invy" type="number" step="500" bind:value={st.budget.investYearly} /><span>€/an</span></div>
      <label class="check wide"><input type="checkbox" bind:checked={st.budget.investOnlyIfSurplus} /> Ne verser aux placements que ce que le budget de l’année permet</label>
      <label for="b-ret">Rendement des placements</label>
      <div class="unit"><input id="b-ret" type="number" step="0.5" value={(st.budget.investReturn * 100).toFixed(1)} oninput={(e) => (st.budget.investReturn = Number(e.currentTarget.value) / 100)} /><span>%/an</span></div>
      <label for="b-infl">Inflation des dépenses courantes</label>
      <div class="unit"><input id="b-infl" type="number" step="0.1" value={(st.budget.inflation * 100).toFixed(1)} oninput={(e) => (st.budget.inflation = Number(e.currentTarget.value) / 100)} /><span>%/an</span></div>
      <label for="b-car">Économie d’une seule voiture</label>
      <div class="unit"><input id="b-car" type="number" step="10" bind:value={st.budget.oneCarSaving} /><span>€/mois</span></div>
      <label class="check wide"><input type="checkbox" bind:checked={st.budget.ownChildcare} /> Mes dépenses contiennent déjà la crèche des enfants nés (le simulateur ne la compte pas une deuxième fois)</label>
    </div>
    <p class="hint">Revenus : les salaires, l’impôt, l’ONEM et les allocations familiales viennent de l’onglet « Comparer des scénarios » (même ménage, mêmes scénarios). Les coûts d’un enfant à venir y sont estimés et ajoutés ici dans « Ponctuel et bébé ».</p>
  </section>
</main>

<style>
  .wrap { max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .budget { display: grid; gap: 16px; padding-block: 20px 48px; }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px; min-width: 0; }
  .lead { border-top: 3px solid var(--calc); }
  .scen-pick { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.9rem; color: var(--muted); }
  .v-lead { font-size: 1.08rem; line-height: 1.55; max-width: 75ch; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
  .tile { display: grid; gap: 2px; align-content: start; padding: 12px 14px; border-radius: var(--radius); background: var(--bg); border: 1px solid var(--line); }
  .t-label { font-size: 0.8rem; color: var(--muted); }
  .t-val { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; }
  .t-sub { font-size: 0.78rem; color: var(--muted); }
  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
  .hint { font-size: 0.82rem; color: var(--muted); }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 0.78rem; border-bottom: 1px solid var(--line); padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; }
  tbody tr.sel { background: var(--calc-soft); }
  tbody tr { cursor: default; }
  tr.total td { font-weight: 700; border-top: 2px solid var(--ink); border-bottom: none; }
  .edit input:not([type='checkbox']), .edit select { width: 100%; min-width: 7em; }
  .edit input.num { min-width: 5.5em; text-align: right; }
  .edit input[type='month'] { min-width: 9em; }
  .detail { display: block; font-size: 0.74rem; color: var(--muted); }
  .detail-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .rowline { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--line); }
  .grow { flex: 1; min-width: 10em; }
  .inline { display: inline-flex; gap: 4px; align-items: center; font-size: 0.85rem; color: var(--muted); }
  input.s { width: 6em; text-align: right; }
  input.xs { width: 3.5em; text-align: right; }
  .ghost { border-color: transparent; color: var(--muted); padding: 4px 6px; }
  .assump { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 10em); gap: 6px 12px; align-items: center; max-width: 640px; }
  .assump > label { font-size: 0.88rem; }
  .check { display: inline-flex; gap: 6px; align-items: center; font-size: 0.88rem; }
  .check.wide { grid-column: 1 / -1; }
  .unit { display: flex; align-items: center; gap: 6px; }
  .unit input { width: 100%; text-align: right; }
  .unit span { color: var(--muted); font-size: 0.85rem; white-space: nowrap; }
  h2 { font-size: 1.15rem; }
  @media (max-width: 520px) { .assump { grid-template-columns: minmax(0, 1fr); } }
</style>
