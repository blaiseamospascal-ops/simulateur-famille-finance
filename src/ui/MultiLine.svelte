<script lang="ts">
  let { years, series, label }: { years: number[]; series: { name: string; color: string; values: number[]; dashed?: boolean }[]; label: string } = $props();

  const W = 720;
  const H = 260;
  const pad = { l: 64, r: 12, t: 14, b: 28 };
  const fmtK = (v: number) => {
    const a = Math.abs(v);
    const s = a >= 1e6 ? `${(a / 1e6).toLocaleString('fr-BE', { maximumFractionDigits: 1 })} M` : a >= 1000 ? `${Math.round(a / 1000).toLocaleString('fr-BE')} k` : `${Math.round(a)}`;
    return (v < 0 ? '−' : '') + s + ' €';
  };
  function niceTicks(min: number, max: number, n = 5) {
    const span = max - min || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10;
    const t: number[] = [];
    for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) t.push(Math.round(v));
    return t;
  }
  const g = $derived.by(() => {
    const vals = series.flatMap((s) => s.values).concat(0);
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    const y = (v: number) => pad.t + ((max - v) / (max - min || 1)) * (H - pad.t - pad.b);
    const x = (i: number) => pad.l + (years.length <= 1 ? 0 : (i / (years.length - 1)) * (W - pad.l - pad.r));
    return { ticks, y, x };
  });
  const every = $derived(years.length > 12 ? 5 : years.length > 6 ? 2 : 1);
</script>

<figure>
  <figcaption>
    <span>{label}</span>
    <span class="legend">
      {#each series as s}<span class="item"><span class="key" class:dashed={s.dashed} style="--c:{s.color}"></span>{s.name}</span>{/each}
    </span>
  </figcaption>
  <div class="scroll">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={label}>
      {#each g.ticks as t}
        <line x1={pad.l} x2={W - pad.r} y1={g.y(t)} y2={g.y(t)} stroke="var(--line)" stroke-width={t === 0 ? 1.5 : 1} />
        <text x={pad.l - 8} y={g.y(t) + 4} text-anchor="end" class="tick">{fmtK(t)}</text>
      {/each}
      {#each years as yr, i}
        {#if i % every === 0}<text x={g.x(i)} y={H - 8} text-anchor="middle" class="tick">{yr}</text>{/if}
      {/each}
      {#each series as s}
        <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${g.x(i)},${g.y(v)}`).join(' ')} fill="none" stroke={s.color} stroke-width="2.2" stroke-dasharray={s.dashed ? '6 4' : undefined} />
        {#if s.values.length}
          <circle cx={g.x(s.values.length - 1)} cy={g.y(s.values[s.values.length - 1])} r="3.5" fill={s.color} />
        {/if}
      {/each}
    </svg>
  </div>
</figure>

<style>
  figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
  figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font-size: 0.85rem; font-weight: 600; }
  .legend { font-weight: 400; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .item { display: inline-flex; align-items: center; gap: 5px; }
  .key { display: inline-block; width: 16px; height: 0; border-top: 2.5px solid var(--c); }
  .key.dashed { border-top-style: dashed; }
  .scroll { overflow-x: auto; }
  svg { width: 100%; min-width: 480px; height: auto; display: block; }
  .tick { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
</style>
