/** Interactive widgets inside the GTO lessons. */
import { parseCards } from '../engine/cards.js';
import { COMBOS, parseRange } from '../engine/ranges.js';
import { $, $$, fmt, pct } from './dom.js';

export function init() {
  $$('.toc [data-to]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.to).scrollIntoView({ behavior: 'smooth' });
    }),
  );

  const potOdds = () => {
    const P = Math.max(0, +$('#poP').value || 0);
    const B = Math.max(0, +$('#poB').value || 0);
    $('#poOut').innerHTML =
      B && P
        ? `<div class="stat-row"><div class="stat"><div class="k">Equity needed</div><div class="n">${pct(B / (P + 2 * B))}</div></div><div class="stat"><div class="k">Final pot</div><div class="n">${fmt(P + 2 * B)}bb</div></div><div class="stat"><div class="k">Price</div><div class="n">${((P + B) / B).toFixed(2)} : 1</div></div></div>`
        : '<p class="muted">Enter a pot and a bet.</p>';
  };
  $('#poP').oninput = potOdds;
  $('#poB').oninput = potOdds;
  potOdds();

  const betSize = () => {
    const b = +$('#bsSlider').value / 100;
    $('#bsLabel').textContent = `${Math.round(b * 100)}% of the pot`;
    const series = [
      ['Bluff needs folds', (v) => v / (1 + v), 'var(--raise)'],
      ['Defender MDF', (v) => 1 / (1 + v), 'var(--call)'],
      ['River bluff share', (v) => v / (1 + 2 * v), 'var(--accent)'],
    ];
    $('#bsStats').innerHTML = series
      .map(
        ([k, f, c]) =>
          `<div class="stat"><div class="k"><span class="sw" style="background:${c}"></span>${k}</div><div class="n">${pct(f(b))}</div></div>`,
      )
      .join('');
    const W = 600;
    const H = 250;
    const L = 42;
    const R = 20;
    const T = 14;
    const BM = 34;
    const x = (v) => L + ((v - 0.1) / 1.9) * (W - L - R);
    const y = (v) => T + (1 - v) * (H - T - BM);
    const line = (fn, col) => {
      let d = '';
      for (let v = 0.1; v <= 2.0001; v += 0.02) d += (d ? 'L' : 'M') + x(v).toFixed(1) + ' ' + y(fn(v)).toFixed(1);
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5"/>`;
    };
    let grid = '';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
    }
    for (const v of [0.25, 0.5, 1, 1.5, 2]) grid += `<text x="${x(v)}" y="${H - 12}" text-anchor="middle">${v * 100}%</text>`;
    $('#bsChart').innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fold equity needed, MDF and river bluff share by bet size">${grid}
      ${series.map(([, f, c]) => line(f, c)).join('')}
      <line x1="${x(b)}" x2="${x(b)}" y1="${T}" y2="${H - BM}" stroke="var(--ink)" stroke-dasharray="3 3"/>
      ${series.map(([, f, c]) => `<circle cx="${x(b)}" cy="${y(f(b))}" r="4.5" fill="${c}" stroke="var(--surface)" stroke-width="2"/>`).join('')}
      <text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle">bet size as % of pot</text></svg>`;
  };
  $('#bsSlider').oninput = betSize;
  betSize();

  const combos = () => {
    const { map, errors } = parseRange($('#ccHand').value);
    const dead = parseCards($('#ccDead').value || '');
    if (errors.length || !map.size) return void ($('#ccOut').innerHTML = `<p class="err">Enter hands like AA, AKs or KQo+.</p>`);
    if (!dead) return void ($('#ccOut').innerHTML = `<p class="err">Enter cards like As Kd (no repeats).</p>`);
    const ds = new Set(dead);
    let before = 0;
    let after = 0;
    const rows = [];
    for (const [cls, w] of map) {
      const all = COMBOS[cls].length * w;
      const left = COMBOS[cls].filter(([a, b]) => !ds.has(a) && !ds.has(b)).length * w;
      before += all;
      after += left;
      rows.push([cls, all, left]);
    }
    $('#ccOut').innerHTML =
      `<div class="stat-row"><div class="stat"><div class="k">Combos before</div><div class="n">${fmt(before)}</div></div><div class="stat"><div class="k">After removal</div><div class="n">${fmt(after)}</div><div class="s">${before ? pct(1 - after / before, 0) + ' fewer' : ''}</div></div></div>
      ${rows.length <= 12 ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Hand</th><th>Before</th><th>After</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${fmt(r[1])}</td><td>${fmt(r[2])}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  };
  $('#ccHand').oninput = combos;
  $('#ccDead').oninput = combos;
  combos();
}

export function show() {}
