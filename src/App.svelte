<script lang="ts">
  import { untrack } from 'svelte';
  import { compare, wealthPath } from './engine/simulate';
  import type { Assumptions, Household, Line, LeaveType, Situation, WorkPeriod } from './engine/types';
  import { belgiumWallonia, pensionLossUntilRetirement } from './countries/be/module';
  import { loadStore, loadTx, saveStore, saveTx, START, typicalScenarios, type ProfileState, type Scen, type Store } from './profile';
  import type { Tx } from './import/csv';
  import BudgetView from './ui/BudgetView.svelte';
  import ImportView from './ui/ImportView.svelte';
  import DashboardView from './ui/DashboardView.svelte';
  import ProfilesView from './ui/ProfilesView.svelte';
  import Chart from './ui/Chart.svelte';
  import MultiLine from './ui/MultiLine.svelte';

  // ---------- Profils (stockés seulement dans ce navigateur) ----------
  const STORE = loadStore();
  let store: Store = $state(STORE);
  let st: ProfileState = $state(structuredClone(STORE.profiles.find((p) => p.id === STORE.activeId)!.state));
  let txs: Tx[] = $state(loadTx(STORE.activeId));
  let saveOk = $state(true);
  const isExample = $derived(store.profiles.find((p) => p.id === store.activeId)?.name === 'Exemple');
  const MAX_SCEN = 4;
  const SCEN_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

  function persist() {
    saveOk = saveStore($state.snapshot(store) as Store);
  }
  $effect(() => {
    const snap = $state.snapshot(st) as ProfileState;
    untrack(() => {
      const p = store.profiles.find((x) => x.id === store.activeId);
      if (p) {
        p.state = snap;
        p.updated = new Date().toISOString();
      }
      persist();
    });
  });
  $effect(() => {
    const snap = $state.snapshot(txs) as Tx[];
    untrack(() => saveTx(store.activeId, snap));
  });
  function switchProfile(id: string) {
    const p = store.profiles.find((x) => x.id === id);
    if (!p) return;
    store.activeId = id;
    st = structuredClone($state.snapshot(p.state) as ProfileState);
    txs = loadTx(id);
    persist();
  }

  type Tab = 'scen' | 'budget' | 'depenses' | 'releves' | 'profils';
  let tab: Tab = $state('budget');
  const TABS: { id: Tab; label: string }[] = [
    { id: 'budget', label: 'Budget et épargne' },
    { id: 'depenses', label: 'Mes dépenses' },
    { id: 'scen', label: 'Comparer des scénarios' },
    { id: 'releves', label: 'Relevés bancaires' },
    { id: 'profils', label: 'Profils et données' },
  ];

  // ---------- Scénarios types ----------
  const nextYear = START + 1;
  const cur = $derived(st.scenarios[Math.min(st.active, st.scenarios.length - 1)]);
  function preset(kind: 'enfant' | '45' | 'mi' | 'arret' | 'combo') {
    const p = st.hasB ? 'B' : 'A';
    const work = (fraction: number) => [{ parent: p, from: `${nextYear}-01`, to: `${nextYear + 30}-12`, fraction, leave: 'aucun' as LeaveType }];
    const t = typicalScenarios(p, nextYear);
    if (kind === 'enfant') Object.assign(cur, { name: 'Un enfant de plus', planned: t[0].planned, periods: [] });
    else if (kind === '45') Object.assign(cur, { name: 'Passage à 4/5', planned: [], periods: work(0.8) });
    else if (kind === 'mi') Object.assign(cur, { name: 'Passage à mi-temps', planned: [], periods: work(0.5) });
    else if (kind === 'arret') Object.assign(cur, { name: 'Un parent arrête', planned: [], periods: work(0) });
    else Object.assign(cur, { name: 'Enfant de plus et 4/5', planned: t[3].planned, periods: t[3].periods });
  }
  function addScenario() {
    if (st.scenarios.length >= MAX_SCEN) return;
    st.scenarios.push({ name: `Scénario ${st.scenarios.length + 1}`, planned: [], periods: [] });
    st.active = st.scenarios.length - 1;
  }
  function removeScenario(i: number) {
    if (st.scenarios.length <= 1) return;
    st.scenarios.splice(i, 1);
    st.active = Math.min(st.active, st.scenarios.length - 1);
  }

  // ---------- Situations ----------
  const household = $derived<Household>({ ...st.household, B: st.hasB ? st.household.B : undefined, couple: st.hasB && st.household.couple });

  const basePeriods = $derived<WorkPeriod[]>(
    (['A', 'B'] as const)
      .filter((p) => st.baseFraction[p] !== 1)
      .map((p) => ({ parent: p, from: `${START}-01`, to: `${START + 60}-12`, fraction: st.baseFraction[p], leave: 'aucun' as LeaveType })),
  );

  const base = $derived<Situation>({
    label: 'Situation actuelle',
    children: st.existing.map((c, i) => ({ id: `e${i}`, birth: c.birth, planned: false })),
    periods: [...basePeriods, ...st.basePeriods.filter((x) => st.hasB || x.parent === 'A')],
  });
  const toSituation = (sc: Scen): Situation => ({
    label: sc.name,
    children: [
      ...base.children,
      ...sc.planned.map((c, i) => ({ id: `p${i}`, birth: c.birth, planned: true, birthParent: st.hasB ? c.birthParent : ('A' as const) })),
    ],
    periods: [...base.periods, ...sc.periods.filter((x) => st.hasB || x.parent === 'A')],
  });

  const all = $derived(st.scenarios.map((sc) => compare(belgiumWallonia, household, base, toSituation(sc), st.assumptions)));
  const cmp = $derived(all[Math.min(st.active, all.length - 1)]);
  const years = $derived(cmp.diff.map((d) => d.year));

  // ---------- Patrimoine ----------
  const wealthOf = (diffs: number[]) => wealthPath(diffs, st.wealth.start, st.wealth.yearlySavings, st.wealth.returnRate, st.assumptions.indexRate);
  const baseWealth = $derived(wealthOf(years.map(() => 0)));
  const summaries = $derived(
    all.map((c, i) => {
      const fc = c.diff.findIndex((d) => Math.abs(d.computed) > 1 || Math.abs(d.costs.mid) > 1);
      const lastD = c.diff[c.diff.length - 1];
      const w = wealthOf(c.diff.map((d) => d.disposable.mid));
      const wLow = wealthOf(c.diff.map((d) => d.disposable.low));
      const wHigh = wealthOf(c.diff.map((d) => d.disposable.high));
      const ps = pensionLossUntilRetirement(household, toSituation(st.scenarios[i]), st.assumptions);
      const pb = pensionLossUntilRetirement(household, base, st.assumptions);
      const pension = ps.A + ps.B - pb.A - pb.B;
      const deficitYears = w.savings.filter((x) => x < 0).length;
      return {
        name: st.scenarios[i].name,
        color: SCEN_COLORS[i],
        firstYear: fc >= 0 ? c.diff[fc].year : null,
        firstMonthly: fc >= 0 ? c.diff[fc].disposable.mid / 12 : 0,
        avgMonthly: lastD.cumulative.mid / c.diff.length / 12,
        cumul: lastD.cumulative,
        wealth: w,
        wealthGap: { mid: w.wealth.at(-1)! - baseWealth.wealth.at(-1)!, low: wLow.wealth.at(-1)! - baseWealth.wealth.at(-1)!, high: wHigh.wealth.at(-1)! - baseWealth.wealth.at(-1)! },
        pensionMonthly: pension / 12,
        deficitYears,
      };
    }),
  );

  let selected = $state(-1);
  const firstChange = $derived(Math.max(0, cmp.diff.findIndex((d) => Math.abs(d.computed) > 1 || Math.abs(d.costs.mid) > 1)));
  const sel = $derived(selected >= 0 && selected < cmp.diff.length ? selected : firstChange);

  const last = $derived(cmp.diff[cmp.diff.length - 1]);
  const first = $derived(cmp.diff[firstChange]);

  // ---------- D'où vient l'écart (sur tout l'horizon) ----------
  const GROUPS: { id: string; label: string; keys: (k: string) => boolean; kind: 'calc' | 'est' }[] = [
    { id: 'sal', label: 'Salaires, après cotisations ONSS', keys: (k) => k.startsWith('salaire') || k.startsWith('onss'), kind: 'calc' },
    { id: 'repl', label: 'Allocations ONEM et indemnité de maternité', keys: (k) => k.startsWith('onem') || k.startsWith('mat'), kind: 'calc' },
    { id: 'tax', label: 'Impôt et cotisation spéciale', keys: (k) => k === 'ipp' || k === 'csss', kind: 'calc' },
    { id: 'af', label: 'Allocations familiales et prime de naissance', keys: (k) => k === 'af' || k === 'prime', kind: 'calc' },
    { id: 'creche', label: 'Crèche', keys: (k) => k === 'creche', kind: 'calc' },
    { id: 'est', label: "Coûts de l'enfant (hypothèse moyenne)", keys: (k) => ['conso', 'stages', 'equip', 'logement'].includes(k), kind: 'est' },
  ];
  const breakdown = $derived(
    GROUPS.map((g) => {
      const sum = (rs: typeof cmp.base) => rs.reduce((s, y) => s + y.lines.filter((l) => g.keys(l.key)).reduce((a, l) => a + l.amount, 0), 0);
      return { ...g, value: sum(cmp.scenario) - sum(cmp.base) };
    }).filter((g) => Math.abs(g.value) >= 1),
  );
  const maxAbs = $derived(Math.max(1, ...breakdown.map((g) => Math.abs(g.value))));

  const pensionLoss = $derived(summaries[Math.min(st.active, summaries.length - 1)].pensionMonthly * 12);
  const notes = $derived([...new Set(cmp.scenario.flatMap((y) => y.indicators.notes))]);

  // ---------- Format ----------
  const eur = (v: number, sign = false) =>
    (sign && v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('fr-BE') + ' €';
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const RELIA: Record<string, string> = {
    officiel: 'officiel',
    publie: 'publié',
    projection: 'projection',
    approximation: 'approché',
    estime: 'estimé',
  };
  const RELIA_HELP: Record<string, string> = {
    officiel: 'Règle publique, montant lu dans une source officielle.',
    publie: 'Règle publique votée, montant lu dans une source professionnelle en attendant l’avis officiel.',
    projection: 'Année future : réforme votée ou dernier montant connu indexé.',
    approximation: 'Règle publique simplifiée par le simulateur.',
    estime: 'Hypothèse de coût propre à chaque ménage : modifiez-la.',
  };

  function pairLines(i: number) {
    const keys = new Map<string, { label: string; base?: Line; scen?: Line }>();
    for (const l of cmp.base[i].lines) keys.set(l.key, { label: l.label, base: l });
    for (const l of cmp.scenario[i].lines) keys.set(l.key, { ...(keys.get(l.key) ?? { label: l.label }), scen: l });
    return [...keys.values()];
  }

  const FRACTIONS = [
    { v: 1, l: 'Temps plein' },
    { v: 0.9, l: '9/10' },
    { v: 0.8, l: '4/5' },
    { v: 0.5, l: 'Mi-temps' },
    { v: 0, l: 'Arrêt' },
  ];
  const LEAVES: { v: LeaveType; l: string }[] = [
    { v: 'aucun', l: 'Sans allocation' },
    { v: 'conge-parental', l: 'Congé parental (ONEM)' },
    { v: 'credit-temps', l: 'Crédit-temps (ONEM)' },
  ];
  const activeParents = $derived<('A' | 'B')[]>(st.hasB ? ['A', 'B'] : ['A']);
</script>

<header class="top">
  <div class="wrap head">
    <div class="titles">
      <p class="eyebrow">Belgique · Wallonie · salariés du privé · barèmes 2026</p>
      <h1>Un enfant de plus, moins travailler : combien ça change, et combien de temps tenir ?</h1>
      <p class="lede">
        Comparez des scénarios année par année après impôts, cotisations et allocations, branchez votre budget réel et vos relevés bancaires,
        et voyez combien d’épargne il faut pour tenir. Vos données restent dans ce navigateur : rien n’est envoyé.
      </p>
    </div>
    <div class="profilebar">
      <label for="profile-select">Profil</label>
      <select id="profile-select" value={store.activeId} onchange={(e) => switchProfile(e.currentTarget.value)}>
        {#each store.profiles as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
      {#if !saveOk}<span class="warnline">Ce navigateur refuse l’enregistrement : exportez votre profil pour le garder.</span>{/if}
    </div>
  </div>
  <nav class="wrap tabsbar" aria-label="Sections">
    {#each TABS as t}
      <button class="navtab" class:on={tab === t.id} aria-current={tab === t.id ? 'page' : undefined} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </nav>
</header>

{#if tab === 'budget'}
  <BudgetView bind:st {all} {household} {base} toSituation={toSituation} colors={SCEN_COLORS} />
{:else if tab === 'depenses'}
  <DashboardView bind:st bind:txs gotoReleves={() => (tab = 'releves')} />
{:else if tab === 'releves'}
  <ImportView bind:st bind:txs />
{:else if tab === 'profils'}
  <ProfilesView bind:store {st} {txs} {switchProfile} {persist} />
{:else}
<main class="wrap grid">
  <!-- ================= SAISIE ================= -->
  <section class="inputs" aria-label="Votre situation">
    {#if isExample}
      <p class="example">Exemple fictif : un couple avec trois enfants et quatre scénarios. Créez votre propre profil dans « Profils et données », ou modifiez directement les chiffres.</p>
    {/if}

    <fieldset>
      <legend>Votre ménage</legend>
      <div class="row">
        <label class="check"><input id="hasB" type="checkbox" bind:checked={st.hasB} /> Deux parents</label>
        {#if st.hasB}
          <label class="check"><input id="couple" type="checkbox" bind:checked={st.household.couple} /> Mariés ou cohabitants légaux</label>
        {/if}
      </div>
      <div class="parents">
        {#each activeParents as p}
          {@const par = p === 'A' ? st.household.A : st.household.B!}
          <div class="parent">
            <input id="name-{p}" class="name" aria-label="Nom du parent {p}" bind:value={par.label} />
            <label for="gross-{p}">Brut mensuel temps plein</label>
            <div class="unit"><input id="gross-{p}" type="number" min="0" step="50" bind:value={par.grossMonthlyFT} /><span>€</span></div>
            <label for="base-{p}">Temps de travail actuel</label>
            <select id="base-{p}" bind:value={st.baseFraction[p]}>
              {#each FRACTIONS as f}<option value={f.v}>{f.l}</option>{/each}
            </select>
          </div>
        {/each}
      </div>
      <div class="row">
        <label for="communal">Taxe communale</label>
        <div class="unit small"><input id="communal" type="number" min="0" max="10" step="0.1" value={(st.household.communalRate * 100).toFixed(1)} oninput={(e) => (st.household.communalRate = Number(e.currentTarget.value) / 100)} /><span>%</span></div>
      </div>
      <details class="inner">
        <summary>Évolution connue du salaire brut <span class="tag est">optionnel</span></summary>
        <p class="hint">Brut mensuel temps plein par année (ancienneté, barème, indexation). Après la dernière année, le brut suit l’indexation et la progression de carrière.</p>
        {#each activeParents as p}
          {@const par = p === 'A' ? st.household.A : st.household.B!}
          <div class="sched">
            <span class="sched-name">{par.label}</span>
            {#each Object.keys(par.grossByYear ?? {}).sort() as y}
              <label class="inline">{y} <input type="number" min="0" step="10" value={par.grossByYear![y]} oninput={(e) => (par.grossByYear![y] = Number(e.currentTarget.value))} /></label>
              <button class="ghost" aria-label="Retirer {y}" onclick={() => delete par.grossByYear![y]}>×</button>
            {/each}
            <button class="ghost" onclick={() => { par.grossByYear ??= {}; const ys = Object.keys(par.grossByYear).map(Number); const y = ys.length ? Math.max(...ys) + 1 : START + 1; par.grossByYear[String(y)] = Math.round((par.grossByYear[String(y - 1)] ?? par.grossMonthlyFT) * 1.02); }}>+ année</button>
          </div>
        {/each}
      </details>
      <details class="inner">
        <summary>Changements déjà prévus ({st.basePeriods.length})</summary>
        <p class="hint">Dans la situation actuelle : fin d’un crédit-temps, retour à temps plein… Ils s’appliquent aussi à tous les scénarios.</p>
        {#each st.basePeriods as per, i}
          <div class="period">
            <select aria-label="Parent" bind:value={per.parent}>
              <option value="A">{st.household.A.label}</option>
              {#if st.hasB}<option value="B">{st.household.B?.label}</option>{/if}
            </select>
            <select aria-label="Temps de travail" bind:value={per.fraction}>
              {#each FRACTIONS as f}<option value={f.v}>{f.l}</option>{/each}
            </select>
            <select aria-label="Allocation" bind:value={per.leave} disabled={per.fraction === 1}>
              {#each LEAVES as l}<option value={l.v}>{l.l}</option>{/each}
            </select>
            <label class="inline">du <input type="month" bind:value={per.from} /></label>
            <label class="inline">au <input type="month" bind:value={per.to} /></label>
            <button class="ghost" onclick={() => st.basePeriods.splice(i, 1)}>Retirer</button>
          </div>
        {/each}
        <button onclick={() => st.basePeriods.push({ parent: st.hasB ? 'B' : 'A', from: `${START}-01`, to: `${START + 1}-04`, fraction: 0.8, leave: 'credit-temps' })}>Ajouter un changement prévu</button>
      </details>
    </fieldset>

    <fieldset>
      <legend>Enfants déjà nés</legend>
      {#each st.existing as c, i}
        <div class="row">
          <label for="ex-{i}">Enfant {i + 1}, né en</label>
          <input id="ex-{i}" type="month" bind:value={c.birth} />
          <button class="ghost" aria-label="Retirer l’enfant {i + 1}" onclick={() => st.existing.splice(i, 1)}>Retirer</button>
        </div>
      {/each}
      <button onclick={() => st.existing.push({ birth: '2024-01' })}>Ajouter un enfant</button>
    </fieldset>

    <fieldset class="scenario" style="--sc:{SCEN_COLORS[st.active]}">
      <legend>Scénarios à comparer</legend>
      <div class="tabs" role="tablist" aria-label="Scénarios">
        {#each st.scenarios as sc, i}
          <button role="tab" aria-selected={i === st.active} class="tab" class:on={i === st.active} style="--c:{SCEN_COLORS[i]}" onclick={() => (st.active = i)}>
            <span class="dot"></span>{sc.name}
          </button>
        {/each}
        {#if st.scenarios.length < MAX_SCEN}<button class="ghost" onclick={addScenario}>+ Scénario</button>{/if}
      </div>
      <div class="row">
        <label for="scen-name">Nom</label>
        <input id="scen-name" class="grow" bind:value={cur.name} />
        {#if st.scenarios.length > 1}<button class="ghost" onclick={() => removeScenario(st.active)}>Supprimer</button>{/if}
      </div>
      <p class="hint">Remplir ce scénario avec :</p>
      <div class="presets" role="group" aria-label="Scénarios types">
        <button onclick={() => preset('enfant')}>Un enfant de plus</button>
        <button onclick={() => preset('45')}>Passer à 4/5</button>
        <button onclick={() => preset('mi')}>Mi-temps</button>
        <button onclick={() => preset('arret')}>Arrêter</button>
        <button onclick={() => preset('combo')}>Enfant + 4/5</button>
      </div>

      <h3>Enfants à venir</h3>
      {#each cur.planned as c, i}
        <div class="row">
          <label for="pl-{i}">Naissance prévue</label>
          <input id="pl-{i}" type="month" bind:value={c.birth} />
          {#if st.hasB}
            <select id="pl-parent-{i}" aria-label="Parent en congé de maternité" bind:value={c.birthParent}>
              <option value="A">Maternité : {st.household.A.label}</option>
              <option value="B">Maternité : {st.household.B?.label}</option>
            </select>
          {/if}
          <button class="ghost" onclick={() => cur.planned.splice(i, 1)}>Retirer</button>
        </div>
      {/each}
      <button onclick={() => cur.planned.push({ birth: `${nextYear}-06`, birthParent: st.hasB ? 'B' : 'A' })}>Ajouter un enfant à venir</button>

      <h3>Changements de temps de travail</h3>
      {#each cur.periods as per, i}
        <div class="period">
          <select id="per-p-{i}" aria-label="Parent" bind:value={per.parent}>
            <option value="A">{st.household.A.label}</option>
            {#if st.hasB}<option value="B">{st.household.B?.label}</option>{/if}
          </select>
          <select id="per-f-{i}" aria-label="Temps de travail" bind:value={per.fraction}>
            {#each FRACTIONS as f}<option value={f.v}>{f.l}</option>{/each}
          </select>
          <select id="per-l-{i}" aria-label="Allocation" bind:value={per.leave} disabled={per.fraction === 1}>
            {#each LEAVES as l}<option value={l.v}>{l.l}</option>{/each}
          </select>
          <label class="inline" for="per-from-{i}">du <input id="per-from-{i}" type="month" bind:value={per.from} /></label>
          <label class="inline" for="per-to-{i}">au <input id="per-to-{i}" type="month" bind:value={per.to} /></label>
          <button class="ghost" onclick={() => cur.periods.splice(i, 1)}>Retirer</button>
        </div>
      {/each}
      <button onclick={() => cur.periods.push({ parent: st.hasB ? 'B' : 'A', from: `${nextYear}-01`, to: `${nextYear + 2}-12`, fraction: 0.8, leave: 'aucun' })}>Ajouter une période</button>
      <p class="hint">Congé parental : par enfant de moins de 12 ans, 4 mois à l’arrêt, 8 mois à mi-temps, 20 mois à 4/5 ou 40 mois à 9/10. Crédit-temps avec motif : selon votre ancienneté et votre employeur.</p>
    </fieldset>

    <details>
      <summary>Hypothèses de coûts de l’enfant <span class="tag est">estimé</span></summary>
      <div class="assump">
        <p class="hint">Par mois et par enfant, hors crèche et logement. Le 2e enfant coûte {pct(st.assumptions.rankFactor.second)} du 1er, les suivants {pct(st.assumptions.rankFactor.thirdPlus)}.</p>
        {#each [['age0_2', '0 à 2 ans'], ['age3_5', '3 à 5 ans'], ['age6_11', '6 à 11 ans'], ['age12_17', '12 à 17 ans'], ['age18_24', '18 à 24 ans']] as [k, l]}
          <label for="cm-{k}">{l}</label>
          <div class="unit"><input id="cm-{k}" type="number" min="0" step="10" bind:value={st.assumptions.childMonthly[k as keyof Assumptions['childMonthly']]} /><span>€/mois</span></div>
        {/each}
        <label for="stages">Stages et garderies (3 à 12 ans)</label>
        <div class="unit"><input id="stages" type="number" min="0" step="50" bind:value={st.assumptions.extracurricularYearly} /><span>€/an</span></div>
        <label class="check wide"><input id="stagesdrop" type="checkbox" bind:checked={st.assumptions.extracurricularDropIfParentHome} /> Plus de stages quand un parent ne travaille pas</label>
        <label for="equip">Équipement de naissance</label>
        <div class="unit"><input id="equip" type="number" min="0" step="100" bind:value={st.assumptions.birthEquipment} /><span>€</span></div>
        <label for="housing">Logement, par enfant à venir</label>
        <div class="unit"><input id="housing" type="number" min="0" step="25" bind:value={st.assumptions.housingPerNewChildMonthly} /><span>€/mois</span></div>
        <label for="range-low">Fourchette basse</label>
        <div class="unit"><input id="range-low" type="number" min="0" max="1" step="0.05" bind:value={st.assumptions.costRange.low} /><span>×</span></div>
        <label for="range-high">Fourchette haute</label>
        <div class="unit"><input id="range-high" type="number" min="1" max="3" step="0.05" bind:value={st.assumptions.costRange.high} /><span>×</span></div>
      </div>
    </details>

    <details>
      <summary>Crèche, projection et carrière</summary>
      <div class="assump">
        <label class="check wide"><input id="creche-use" type="checkbox" bind:checked={st.assumptions.creche.use} /> Crèche de 4 mois à 2 ans et demi</label>
        <label for="creche-type">Type de crèche</label>
        <select id="creche-type" bind:value={st.assumptions.creche.type}>
          <option value="one">Subventionnée ONE (tarif selon revenus)</option>
          <option value="prive">Privée (prix fixe)</option>
        </select>
        {#if st.assumptions.creche.type === 'prive'}
          <label for="creche-price">Prix par jour</label>
          <div class="unit"><input id="creche-price" type="number" min="0" step="1" bind:value={st.assumptions.creche.privateDaily} /><span>€</span></div>
        {/if}
        <label for="creche-days">Jours par an à temps plein</label>
        <div class="unit"><input id="creche-days" type="number" min="0" max="260" step="5" bind:value={st.assumptions.creche.daysPerYear} /><span>jours</span></div>
        <label class="check wide"><input id="creche-adapt" type="checkbox" bind:checked={st.assumptions.creche.adaptToParentTime} /> Moins de jours de crèche quand un parent travaille moins</label>
        <label for="years">Horizon</label>
        <div class="unit"><input id="years" type="number" min="3" max="30" step="1" bind:value={st.assumptions.years} /><span>ans</span></div>
        <label for="index">Indexation annuelle</label>
        <div class="unit"><input id="index" type="number" min="0" max="10" step="0.1" value={(st.assumptions.indexRate * 100).toFixed(1)} oninput={(e) => (st.assumptions.indexRate = Number(e.currentTarget.value) / 100)} /><span>%</span></div>
        <label for="growth">Progression de carrière</label>
        <div class="unit"><input id="growth" type="number" min="0" max="10" step="0.1" value={(st.assumptions.realWageGrowth * 100).toFixed(1)} oninput={(e) => (st.assumptions.realWageGrowth = Number(e.currentTarget.value) / 100)} /><span>%/an</span></div>
        <label for="penalty">Retard de carrière par année non travaillée <span class="tag est">indicatif</span></label>
        <div class="unit"><input id="penalty" type="number" min="0" max="20" step="0.5" value={(st.assumptions.careerPenaltyPerYear * 100).toFixed(1)} oninput={(e) => (st.assumptions.careerPenaltyPerYear = Number(e.currentTarget.value) / 100)} /><span>%</span></div>
        <label for="afend">Allocations familiales jusqu’à</label>
        <div class="unit"><input id="afend" type="number" min="18" max="25" step="1" bind:value={st.assumptions.allowanceEndAge} /><span>ans</span></div>
      </div>
    </details>

    <details>
      <summary>Épargne et patrimoine</summary>
      <div class="assump">
        <p class="hint">Pour voir l’effet de chaque scénario sur votre capital. Avec un écart négatif, vous épargnez moins ; si l’épargne devient négative, vous puisez dans le patrimoine.</p>
        <label for="w-start">Patrimoine financier actuel</label>
        <div class="unit"><input id="w-start" type="number" min="0" step="1000" bind:value={st.wealth.start} /><span>€</span></div>
        <label for="w-save">Épargne par an aujourd’hui</label>
        <div class="unit"><input id="w-save" type="number" step="500" bind:value={st.wealth.yearlySavings} /><span>€/an</span></div>
        <label for="w-ret">Rendement annuel moyen</label>
        <div class="unit"><input id="w-ret" type="number" min="-5" max="15" step="0.5" value={(st.wealth.returnRate * 100).toFixed(1)} oninput={(e) => (st.wealth.returnRate = Number(e.currentTarget.value) / 100)} /><span>%</span></div>
      </div>
    </details>

  </section>

  <!-- ================= RÉSULTATS ================= -->
  <section class="results" aria-label="Résultats" aria-live="polite">
    <div class="panel">
      <h2>Vos scénarios côte à côte</h2>
      <div class="tablewrap">
        <table class="side">
          <thead>
            <tr>
              <th>Scénario</th>
              <th class="r">1re année touchée</th>
              <th class="r">Moyenne sur {st.assumptions.years} ans</th>
              <th class="r">Cumulé ({START}–{years.at(-1)})</th>
              <th class="r">Patrimoine en {years.at(-1)}</th>
              <th class="r">Pension <span class="tag est">indicatif</span></th>
            </tr>
          </thead>
          <tbody>
            {#each summaries as sm, i}
              <tr class:sel={i === st.active} onclick={() => (st.active = i)}>
                <td><span class="dot" style="--c:{sm.color}"></span>{sm.name}</td>
                <td class="r num"><span class:pos={sm.firstMonthly >= 0} class:neg={sm.firstMonthly < 0}>{eur(sm.firstMonthly, true)}/mois</span>{#if sm.firstYear}<span class="sub">en {sm.firstYear}</span>{/if}</td>
                <td class="r num"><span class:pos={sm.avgMonthly >= 0} class:neg={sm.avgMonthly < 0}>{eur(sm.avgMonthly, true)}/mois</span></td>
                <td class="r num">{eur(sm.cumul.mid, true)}<span class="sub">{eur(sm.cumul.low, true)} à {eur(sm.cumul.high, true)}</span></td>
                <td class="r num">{eur(sm.wealth.wealth.at(-1) ?? 0)}<span class="sub" class:neg={sm.wealthGap.mid < 0}>{eur(sm.wealthGap.mid, true)} vs actuel</span></td>
                <td class="r num">{Math.abs(sm.pensionMonthly) >= 1 ? `${eur(-sm.pensionMonthly)}/mois` : '—'}</td>
              </tr>
            {/each}
            <tr class="basero">
              <td><span class="dot" style="--c:var(--ink)"></span>Situation actuelle</td>
              <td class="r">—</td><td class="r">—</td><td class="r">—</td>
              <td class="r num">{eur(baseWealth.wealth.at(-1) ?? 0)}</td>
              <td class="r">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      {#each summaries.filter((x) => x.deficitYears > 0) as sm}
        <p class="hint warnline">{sm.name} : l’épargne devient négative {sm.deficitYears} année{sm.deficitYears > 1 ? 's' : ''} sur {st.assumptions.years}, le ménage puise alors dans son patrimoine.</p>
      {/each}
      <MultiLine
        label="Patrimoine financier projeté (hypothèse moyenne de coûts)"
        {years}
        series={[{ name: 'Situation actuelle', color: 'var(--ink)', values: baseWealth.wealth, dashed: true }, ...summaries.map((sm) => ({ name: sm.name, color: sm.color, values: sm.wealth.wealth }))]}
      />
      <p class="hint">Rendement {(st.wealth.returnRate * 100).toFixed(1)} %/an, épargne actuelle {eur(st.wealth.yearlySavings)}/an indexée. Réglez-les dans « Épargne et patrimoine ». Pour un calcul à partir de vos dépenses réelles, crédits et coussin de sécurité, voyez l’onglet <button class="link" onclick={() => (tab = 'budget')}>Budget et épargne</button>.</p>
    </div>

    <div class="scen-head" style="--c:{SCEN_COLORS[st.active]}">
      <span class="dot"></span>
      <h2>{cur.name}</h2>
      <select id="scen-select" aria-label="Scénario détaillé" value={st.active} onchange={(e) => (st.active = Number(e.currentTarget.value))}>
        {#each st.scenarios as sc, i}<option value={i}>{sc.name}</option>{/each}
      </select>
    </div>
    {#if first}
      <div class="verdict">
        <p class="v-lead">
          En {first.year}, « {cur.name} » change votre revenu disponible de
          <strong class="num" class:pos={first.disposable.mid >= 0} class:neg={first.disposable.mid < 0}>{eur(first.disposable.mid / 12, true)} par mois</strong>.
          Sur {st.assumptions.years} ans ({START}–{last.year}), l’écart cumulé est de
          <strong class="num" class:pos={last.cumulative.mid >= 0} class:neg={last.cumulative.mid < 0}>{eur(last.cumulative.mid, true)}</strong>,
          entre <span class="num">{eur(last.cumulative.low, true)}</span> et <span class="num">{eur(last.cumulative.high, true)}</span> selon les coûts de l’enfant.
        </p>
        <div class="tiles">
          <div class="tile calc">
            <span class="t-label">Calculé : salaires, impôts, allocations, crèche</span>
            <span class="t-val num">{eur(cmp.diff.reduce((s, d) => s + d.computed, 0), true)}</span>
            <span class="t-sub">sur {st.assumptions.years} ans, d’après les règles publiques</span>
          </div>
          <div class="tile est">
            <span class="t-label">Estimé : coûts de l’enfant</span>
            <span class="t-val num">{eur(-cmp.diff.reduce((s, d) => s + d.costs.mid, 0), true)}</span>
            <span class="t-sub num">fourchette {eur(-cmp.diff.reduce((s, d) => s + d.costs.low, 0), true)} à {eur(-cmp.diff.reduce((s, d) => s + d.costs.high, 0), true)}</span>
          </div>
          {#if Math.abs(pensionLoss) > 0}
            <div class="tile">
              <span class="t-label">Pension perdue <span class="tag est">indicatif</span></span>
              <span class="t-val num">{eur(-pensionLoss / 12)} /mois</span>
              <span class="t-sub">à vie, en euros d’aujourd’hui : années réduites ou arrêtées sans allocation ONEM jusqu’à 67 ans</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="panel">
      <Chart diff={cmp.diff} bind:selected />
      <p class="hint">Cliquez une année pour voir le détail ligne par ligne.</p>
    </div>

    {#if breakdown.length}
      <div class="panel">
        <h2>D’où vient l’écart sur {st.assumptions.years} ans</h2>
        <ul class="bars">
          {#each breakdown as g}
            <li>
              <span class="b-label">{g.label} <span class="tag {g.kind}">{g.kind === 'calc' ? 'calculé' : 'estimé'}</span></span>
              <span class="b-track"><span class="b-fill {g.kind}" class:negfill={g.value < 0} style="width:{(Math.abs(g.value) / maxAbs) * 100}%"></span></span>
              <span class="b-val num" class:pos={g.value >= 0} class:neg={g.value < 0}>{eur(g.value, true)}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="panel">
      <div class="detail-head">
        <h2>Détail {cmp.diff[sel]?.year}</h2>
        <select id="year-select" aria-label="Année" value={sel} onchange={(e) => (selected = Number(e.currentTarget.value))}>
          {#each cmp.diff as d, i}<option value={i}>{d.year}</option>{/each}
        </select>
      </div>
      <div class="tablewrap">
        <table>
          <thead>
            <tr><th>Poste</th><th class="r">Actuel</th><th class="r">Scénario</th><th class="r">Écart</th></tr>
          </thead>
          <tbody>
            {#each pairLines(sel) as row}
              {@const l = row.scen ?? row.base!}
              {@const d = (row.scen?.amount ?? 0) - (row.base?.amount ?? 0)}
              <tr class:estrow={l.reliability === 'estime'}>
                <td>
                  <span class="poste">{row.label}</span>
                  <span class="tag {l.reliability}" title={RELIA_HELP[l.reliability]}>{RELIA[l.reliability]}</span>
                  {#if l.detail}<span class="detail">{l.detail}</span>{/if}
                  {#if l.source}<span class="detail src">Source : {l.source}</span>{/if}
                </td>
                <td class="r num">{row.base ? eur(row.base.amount) : '—'}</td>
                <td class="r num">{row.scen ? eur(row.scen.amount) : '—'}</td>
                <td class="r num" class:pos={d > 0} class:neg={d < 0}>{Math.abs(d) < 1 ? '0 €' : eur(d, true)}</td>
              </tr>
            {/each}
            <tr class="total">
              <td>Revenu disponible (hypothèse moyenne)</td>
              <td class="r num">{eur(cmp.base[sel].disposable.mid)}</td>
              <td class="r num">{eur(cmp.scenario[sel].disposable.mid)}</td>
              <td class="r num" class:pos={cmp.diff[sel].disposable.mid >= 0} class:neg={cmp.diff[sel].disposable.mid < 0}>{eur(cmp.diff[sel].disposable.mid, true)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h2>Année par année</h2>
      <div class="tablewrap">
        <table class="years">
          <thead>
            <tr><th>Année</th><th class="r">Calculé</th><th class="r">Coûts estimés</th><th class="r">Écart par mois</th><th class="r">Cumulé</th></tr>
          </thead>
          <tbody>
            {#each cmp.diff as d, i}
              <tr class:sel={i === sel} onclick={() => (selected = i)}>
                <td>{d.year}</td>
                <td class="r num">{eur(d.computed, true)}</td>
                <td class="r num">{eur(-d.costs.mid, true)}</td>
                <td class="r num" class:pos={d.disposable.mid > 0} class:neg={d.disposable.mid < 0}>{eur(d.disposable.mid / 12, true)}</td>
                <td class="r num">{eur(d.cumulative.mid, true)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if notes.length}
      <div class="panel warn">
        <h2>À vérifier</h2>
        <ul>{#each notes as n}<li>{n}</li>{/each}</ul>
      </div>
    {/if}

    <div class="panel about">
      <h2>Ce que le simulateur sait faire, et ses limites</h2>
      <ul>
        <li><span class="tag officiel">officiel</span> <span class="tag publie">publié</span> Impôt 2026 avec la réforme votée le 15 juillet 2026 : quotité exemptée, suppléments enfants, quotient conjugal plafonné à 11 780 € puis réduit chaque année jusqu’à 6 730 € en 2029, bonus à l’emploi. Cotisations ONSS, allocations ONEM, allocations familiales wallonnes et tarif ONE de septembre 2026.</li>
        <li><span class="tag projection">projection</span> Années suivantes : réforme votée, puis montants indexés au taux choisi. Les lois peuvent encore changer.</li>
        <li><span class="tag approximation">approché</span> Allocations ONEM et indemnités de maternité imposées comme un salaire (sans réduction pour revenus de remplacement) ; cotisation spéciale de sécurité sociale au barème du ménage ; supplément social des allocations familiales calculé sur le revenu de l’année.</li>
        <li><span class="tag estime">estimé</span> Coûts de consommation de l’enfant : ordres de grandeur à remplacer par les vôtres.</li>
        <li><span class="tag estime">indicatif</span> Pension : environ 60 % du salaire plafonné / 45 par année non travaillée sans allocation ONEM (congé parental et crédit-temps avec motif sont assimilés). Le taux ménage (75 %) peut compenser en partie. Patrimoine : projection à rendement constant, sans fiscalité de l’épargne.</li>
        <li>Hors champ : indépendants, fonctionnaires, voiture de société, revenus immobiliers ou mobiliers, épargne-pension, garde alternée, Bruxelles et Flandre.</li>
        <li>Validation : le moteur fiscal est testé sur 20 cas types à comparer avec Tax-Calc (SPF Finances). Ne remplace pas un conseil fiscal.</li>
      </ul>
    </div>
  </section>
</main>
{/if}

<style>
  .profilebar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; font-size: 0.9rem; }
  .profilebar label { color: var(--muted); }
  .tabsbar { display: flex; gap: 4px; overflow-x: auto; padding-top: 4px; }
  .navtab { border: none; border-bottom: 3px solid transparent; border-radius: 0; background: none; padding: 8px 12px; font-weight: 600; color: var(--muted); white-space: nowrap; }
  .navtab.on { color: var(--ink); border-bottom-color: var(--calc); }
  details.inner { padding: 8px 10px; background: var(--bg); }
  .sched { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.85rem; }
  .sched-name { font-weight: 600; min-width: 6em; }
  .sched input { width: 5.5em; }
  .inline { display: inline-flex; gap: 4px; align-items: center; font-size: 0.85rem; color: var(--muted); }
  .wrap { max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .top { border-bottom: 1px solid var(--line); background: var(--surface); }
  .head { padding-block: 28px 12px; }
  .titles { display: grid; gap: 10px; max-width: 70ch; }
  .eyebrow { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--calc); font-weight: 600; }
  .lede { color: var(--muted); }

  .grid { display: grid; grid-template-columns: minmax(0, 400px) minmax(0, 1fr); gap: 24px; padding-block: 24px 48px; align-items: start; }
  @media (max-width: 900px) { .grid { grid-template-columns: minmax(0, 1fr); } .results { order: -1; } }

  .inputs { display: grid; gap: 14px; min-width: 0; }
  .example { background: var(--calc-soft); border-radius: var(--radius); padding: 10px 12px; font-size: 0.9rem; }
  fieldset, details { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 12px 14px 14px; margin: 0; display: grid; gap: 10px; min-width: 0; }
  legend { font-family: var(--font-display); font-weight: 700; padding: 0 4px; }
  summary { cursor: pointer; font-family: var(--font-display); font-weight: 700; }
  details[open] summary { margin-bottom: 8px; }
  .scenario { border-width: 1.5px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .row > label:not(.check) { font-size: 0.88rem; color: var(--muted); }
  .check { display: inline-flex; gap: 6px; align-items: center; font-size: 0.9rem; }
  .check.wide { grid-column: 1 / -1; }
  .parents { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .parent { display: grid; gap: 4px; }
  .parent label { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
  .name { font-weight: 600; }
  .unit { display: flex; align-items: center; gap: 6px; }
  .unit input { width: 100%; text-align: right; }
  .unit span { color: var(--muted); font-size: 0.85rem; white-space: nowrap; }
  .unit.small input { width: 5em; }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; }
  .presets button { font-size: 0.85rem; padding: 5px 10px; }
  .period { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; border: 1px dashed var(--line); border-radius: var(--radius); }
  .period .inline { display: inline-flex; gap: 4px; align-items: center; font-size: 0.85rem; color: var(--muted); }
  .ghost { border-color: transparent; color: var(--muted); font-size: 0.85rem; padding: 4px 6px; }
  .hint { font-size: 0.82rem; color: var(--muted); }
  .assump { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 9.5em); gap: 6px 10px; align-items: center; }
  .assump > label { font-size: 0.88rem; }
  .assump > .hint { grid-column: 1 / -1; }
  .io { display: grid; gap: 8px; }

  .results { display: grid; gap: 16px; min-width: 0; }
  .verdict { display: grid; gap: 14px; }
  .v-lead { font-size: 1.12rem; line-height: 1.55; max-width: 62ch; }
  .v-lead strong { font-weight: 700; }
  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
  .tile { display: grid; gap: 2px; align-content: start; padding: 12px 14px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--line); }
  .tile.calc { border-top: 3px solid var(--calc); }
  .tile.est { border-top: 3px solid var(--est); }
  .t-label { font-size: 0.8rem; color: var(--muted); }
  .t-val { font-family: var(--font-display); font-size: 1.45rem; font-weight: 700; }
  .t-sub { font-size: 0.78rem; color: var(--muted); }

  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px; min-width: 0; }
  .panel.warn { border-color: var(--est); }
  .panel ul { margin: 0; padding-left: 1.1em; display: grid; gap: 6px; }

  .bars { list-style: none; padding: 0 !important; }
  .bars li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(60px, 1fr) auto; gap: 10px; align-items: center; font-size: 0.9rem; }
  .b-track { height: 10px; background: var(--bg); border-radius: 2px; overflow: hidden; }
  .b-fill { display: block; height: 100%; }
  .b-fill.calc { background: var(--calc); }
  .b-fill.est { background: repeating-linear-gradient(45deg, var(--est) 0 2px, var(--est-soft) 2px 5px); }
  .b-val { min-width: 7em; text-align: right; font-weight: 600; }
  @media (max-width: 520px) { .bars li { grid-template-columns: minmax(0, 1fr) auto; } .b-track { grid-column: 1 / -1; order: 3; } }

  .detail-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 0.78rem; border-bottom: 1px solid var(--line); padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .poste { font-weight: 500; margin-right: 6px; }
  .detail { display: block; font-size: 0.76rem; color: var(--muted); margin-top: 2px; max-width: 60ch; }
  .src { word-break: break-word; }
  tr.estrow td:first-child { box-shadow: inset 3px 0 0 var(--est); }
  tr.total td { font-weight: 700; border-bottom: none; border-top: 2px solid var(--ink); }
  .years tbody tr { cursor: pointer; }
  .years tbody tr:hover, .years tr.sel { background: var(--calc-soft); }

  .tag { display: inline-block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; padding: 1px 6px; border-radius: 3px; vertical-align: 1px; white-space: nowrap; }
  .tag.officiel, .tag.calc { background: var(--calc); color: var(--surface); }
  .tag.publie { background: var(--calc-soft); color: var(--calc); border: 1px solid var(--calc); }
  .tag.projection { background: transparent; color: var(--calc); border: 1px dashed var(--calc); }
  .tag.approximation { background: var(--bg); color: var(--muted); border: 1px solid var(--line); }
  .tag.estime, .tag.est { background: var(--est-soft); color: var(--est); border: 1px solid var(--est); }
  .about li { font-size: 0.88rem; }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .tab { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; padding: 5px 10px; }
  .tab.on { border-color: var(--c); box-shadow: inset 0 -2px 0 var(--c); font-weight: 600; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--c); margin-right: 6px; flex: none; }
  .tab .dot { margin-right: 0; }
  .scenario { border-color: var(--sc); }
  .grow { flex: 1; }
  .side td { white-space: nowrap; padding: 8px 6px; }
  .side th { padding: 6px; }
  .side { font-size: 0.84rem; }
  .side tbody tr { cursor: pointer; }
  .side tbody tr.sel { background: var(--calc-soft); }
  .side .sub { display: block; font-size: 0.75rem; color: var(--muted); }
  .basero td { color: var(--muted); }
  .warnline { color: var(--neg); }
  .link { border: none; background: none; padding: 0; color: var(--calc); text-decoration: underline; cursor: pointer; font: inherit; }
  .scen-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .scen-head h2 { font-size: 1.35rem; }
  .scen-head select { margin-left: auto; }
</style>
