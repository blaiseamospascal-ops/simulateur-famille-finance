<script lang="ts">
  import type { Comparison } from '../engine/types';

  let { diff, selected = $bindable() }: { diff: Comparison['diff']; selected: number } = $props();

  const W = 720;
  const H = 240;
  const pad = { l: 64, r: 12, t: 14, b: 28 };

  const fmtK = (v: number) => {
    const a = Math.abs(v);
    const s = a >= 1000 ? `${(a / 1000).toLocaleString('fr-BE', { maximumFractionDigits: a >= 10000 ? 0 : 1 })} k` : `${Math.round(a)}`;
    return (v < 0 ? '−' : '') + s + ' €';
  };

  function niceTicks(min: number, max: number, n = 5) {
    const span = max - min || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const t: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v));
    return t;
  }

  const annual = $derived.by(() => {
    const vals = diff.flatMap((d) => [d.computed, -d.costs.high, -d.costs.low, d.computed - d.costs.mid, 0]);
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    const y = (v: number) => pad.t + ((max - v) / (max - min)) * (H - pad.t - pad.b);
    const band = (W - pad.l - pad.r) / diff.length;
    const x = (i: number) => pad.l + i * band;
    return { ticks, y, x, band };
  });

  const cumul = $derived.by(() => {
    const vals = diff.flatMap((d) => [d.cumulative.low, d.cumulative.high, 0]);
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    const y = (v: number) => pad.t + ((max - v) / (max - min)) * (H - pad.t - pad.b);
    const band = (W - pad.l - pad.r) / diff.length;
    const x = (i: number) => pad.l + (i + 0.5) * band;
    const area =
      diff.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.cumulative.high)}`).join(' ') +
      ' ' +
      [...diff].reverse().map((d, j) => `L${x(diff.length - 1 - j)},${y(d.cumulative.low)}`).join(' ') +
      ' Z';
    const line = diff.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.cumulative.mid)}`).join(' ');
    return { ticks, y, x, area, line, band };
  });

  const labelEvery = $derived(diff.length > 12 ? 5 : diff.length > 6 ? 2 : 1);
</script>

<div class="charts">
  <figure>
    <figcaption>
      <span>Écart par année, scénario moins situation actuelle</span>
      <span class="legend">
        <span class="key calc"></span> impôts, salaires et allocations (calculé)
        <span class="key est"></span> coûts de l'enfant (estimé, fourchette)
      </span>
    </figcaption>
    <div class="scroll">
      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Écart annuel">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--est-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--est)" stroke-width="2" />
          </pattern>
        </defs>
        {#each annual.ticks as t}
          <line x1={pad.l} x2={W - pad.r} y1={annual.y(t)} y2={annual.y(t)} stroke="var(--line)" stroke-width={t === 0 ? 1.5 : 1} />
          <text x={pad.l - 8} y={annual.y(t) + 4} text-anchor="end" class="tick">{fmtK(t)}</text>
        {/each}
        {#each diff as d, i}
          {@const bw = Math.max(3, annual.band * 0.36)}
          {@const x0 = annual.x(i) + annual.band / 2 - bw - 1}
          <rect
            role="button"
            tabindex="0"
            aria-label="Voir le détail {d.year}"
            class="hit"
            class:sel={selected === i}
            x={annual.x(i)}
            y={pad.t}
            width={annual.band}
            height={H - pad.t - pad.b}
            fill="transparent"
            onclick={() => (selected = i)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selected = i)}
          />
          <rect x={x0} y={Math.min(annual.y(0), annual.y(d.computed))} width={bw} height={Math.abs(annual.y(0) - annual.y(d.computed))} fill="var(--calc)" pointer-events="none" />
          <rect x={x0 + bw + 2} y={annual.y(0)} width={bw} height={Math.max(0, annual.y(-d.costs.mid) - annual.y(0))} fill="url(#hatch)" stroke="var(--est)" stroke-width="0.5" pointer-events="none" />
          {#if d.costs.high > 0}
            <line x1={x0 + bw * 1.5 + 2} x2={x0 + bw * 1.5 + 2} y1={annual.y(-d.costs.low)} y2={annual.y(-d.costs.high)} stroke="var(--est)" stroke-width="1.2" pointer-events="none" />
          {/if}
          {#if i % labelEvery === 0}
            <text x={annual.x(i) + annual.band / 2} y={H - 8} text-anchor="middle" class="tick">{d.year}</text>
          {/if}
        {/each}
      </svg>
    </div>
  </figure>

  <figure>
    <figcaption>
      <span>Écart cumulé de revenu disponible</span>
      <span class="legend"><span class="key line"></span> hypothèse moyenne <span class="key band"></span> fourchette coûts bas à hauts</span>
    </figcaption>
    <div class="scroll">
      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Écart cumulé">
        {#each cumul.ticks as t}
          <line x1={pad.l} x2={W - pad.r} y1={cumul.y(t)} y2={cumul.y(t)} stroke="var(--line)" stroke-width={t === 0 ? 1.5 : 1} />
          <text x={pad.l - 8} y={cumul.y(t) + 4} text-anchor="end" class="tick">{fmtK(t)}</text>
        {/each}
        <path d={cumul.area} fill="var(--est-soft)" opacity="0.9" />
        <path d={cumul.line} fill="none" stroke="var(--ink)" stroke-width="2" />
        {#each diff as d, i}
          {#if i % labelEvery === 0}
            <text x={cumul.x(i)} y={H - 8} text-anchor="middle" class="tick">{d.year}</text>
          {/if}
        {/each}
        {#if diff.length}
          {@const last = diff[diff.length - 1]}
          <circle cx={cumul.x(diff.length - 1)} cy={cumul.y(last.cumulative.mid)} r="4" fill="var(--ink)" />
        {/if}
      </svg>
    </div>
  </figure>
</div>

<style>
  .charts { display: grid; gap: 20px; }
  figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
  figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font-size: 0.85rem; font-weight: 600; }
  .legend { font-weight: 400; color: var(--muted); display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
  .key { display: inline-block; width: 12px; height: 12px; border-radius: 2px; }
  .key.calc { background: var(--calc); }
  .key.est { background: repeating-linear-gradient(45deg, var(--est) 0 2px, var(--est-soft) 2px 5px); border: 1px solid var(--est); }
  .key.line { height: 2px; background: var(--ink); }
  .key.band { background: var(--est-soft); }
  .scroll { overflow-x: auto; }
  svg { width: 100%; min-width: 480px; height: auto; display: block; }
  .tick { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
  .hit { cursor: pointer; }
  .hit.sel { fill: var(--calc-soft); }
  .hit:hover { fill: var(--calc-soft); opacity: 0.6; }
</style>
