<script lang="ts">
  // Barres empilées mois par mois (dépenses par nature) et une ligne (revenus).
  import { eur, monthLabel } from './format';

  type Stack = { name: string; color: string; values: number[] };
  let {
    months,
    stacks,
    line,
    label,
    selected = [],
    onpick,
  }: { months: string[]; stacks: Stack[]; line?: { name: string; color: string; values: number[] }; label: string; selected?: string[]; onpick?: (m: string) => void } = $props();

  const W = 760;
  const H = 260;
  const pad = { l: 60, r: 10, t: 12, b: 30 };
  const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`);
  function niceMax(v: number) {
    if (v <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= v) ?? mag * 10);
  }
  const g = $derived.by(() => {
    const tot = months.map((_, i) => stacks.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
    const max = niceMax(Math.max(1, ...tot, ...(line?.values ?? [])));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
    const band = (W - pad.l - pad.r) / Math.max(1, months.length);
    const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    return { max, ticks, band, y, tot };
  });
  const every = $derived(months.length > 18 ? 3 : months.length > 9 ? 2 : 1);
  let hover = $state(-1);
</script>

<figure>
  <figcaption>
    <span>{label}</span>
    <span class="legend">
      {#each stacks as s}<span class="item"><span class="sw" style="--c:{s.color}"></span>{s.name}</span>{/each}
      {#if line}<span class="item"><span class="ln" style="--c:{line.color}"></span>{line.name}</span>{/if}
    </span>
  </figcaption>
  <div class="scroll">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={label} onmouseleave={() => (hover = -1)}>
      {#each g.ticks as t}
        <line x1={pad.l} x2={W - pad.r} y1={g.y(t)} y2={g.y(t)} stroke="var(--line)" />
        <text x={pad.l - 6} y={g.y(t) + 4} text-anchor="end" class="tick">{fmtK(t)}</text>
      {/each}
      {#each months as m, i}
        {@const x = pad.l + i * g.band}
        {@const on = selected.includes(m)}
        <g
          class="col"
          class:dim={selected.length > 0 && !on}
          role="button"
          tabindex="-1"
          onmouseenter={() => (hover = i)}
          onclick={() => onpick?.(m)}
          onkeydown={(e) => e.key === 'Enter' && onpick?.(m)}
        >
          <rect x={x} y={pad.t} width={g.band} height={H - pad.t - pad.b} fill="transparent" />
          {#each stacks as s, k}
            {@const below = stacks.slice(0, k).reduce((a, z) => a + Math.max(0, z.values[i] ?? 0), 0)}
            {@const v = Math.max(0, s.values[i] ?? 0)}
            <rect x={x + g.band * 0.15} width={g.band * 0.7} y={g.y(below + v)} height={Math.max(0, g.y(below) - g.y(below + v))} fill={s.color} />
          {/each}
          {#if i % every === 0}<text x={x + g.band / 2} y={H - 10} text-anchor="middle" class="tick">{monthLabel(m).replace(/ 20(\d\d)/, ' $1')}</text>{/if}
        </g>
      {/each}
      {#if line}
        <path d={line.values.map((v, i) => `${i ? 'L' : 'M'}${pad.l + (i + 0.5) * g.band},${g.y(v)}`).join(' ')} fill="none" stroke={line.color} stroke-width="2.2" pointer-events="none" />
        {#each line.values as v, i}<circle cx={pad.l + (i + 0.5) * g.band} cy={g.y(v)} r="3" fill={line.color} pointer-events="none" />{/each}
      {/if}
    </svg>
  </div>
  <p class="readout num" aria-live="polite">
    {#if hover >= 0}
      <strong>{monthLabel(months[hover])}</strong> ·
      {#each stacks as s}{s.name} {eur(s.values[hover] ?? 0)} · {/each}total {eur(g.tot[hover])}{#if line} · {line.name} {eur(line.values[hover] ?? 0)}{/if}
    {:else}
      Survolez un mois pour le détail{onpick ? ', cliquez pour l’analyser' : ''}.
    {/if}
  </p>
</figure>

<style>
  figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
  figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font-size: 0.85rem; font-weight: 600; }
  .legend { font-weight: 400; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .item { display: inline-flex; align-items: center; gap: 5px; }
  .sw { width: 11px; height: 11px; border-radius: 2px; background: var(--c); }
  .ln { width: 16px; border-top: 2.5px solid var(--c); }
  .scroll { overflow-x: auto; }
  svg { width: 100%; min-width: 520px; height: auto; display: block; }
  .tick { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
  .col { cursor: pointer; outline: none; }
  .col.dim rect:not([fill='transparent']) { opacity: 0.35; }
  .col:hover rect[fill='transparent'] { fill: var(--calc-soft); }
  .readout { font-size: 0.8rem; color: var(--muted); min-height: 1.3em; }
</style>
