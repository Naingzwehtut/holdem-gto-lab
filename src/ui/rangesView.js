/** Preflop range charts, hand detail and range builder. */
import { COMBOS, HAND_CLASSES, comboCount, compressRange, parseRange, rangeStats } from '../engine/ranges.js';
import { calculateEquity } from '../engine/equity.js';
import { SPOTS, SPOT, describeSpot } from '../data/spots.js';
import { handNotes } from '../data/notes.js';
import { $, $$, cardsHTML, esc, freqBackground, freqBars, jobCounter, pct } from './dom.js';
import { go, nav } from './nav.js';

const state = { spot: 'BBvBTN', sel: 'A5s', mode: 'chart', brush: 1, build: new Map(), painting: false, paintW: 1 };
const nextJob = jobCounter();

export function init() {
  const groups = [
    ['open', 'Open (RFI)'],
    ['vs', 'Facing an open'],
  ];
  $('#spotBar').innerHTML = groups
    .map(
      ([g, lbl]) =>
        `<div class="chips"><span class="lbl">${lbl}</span>${SPOTS.filter((s) => s.group === g)
          .map((s) => `<button type="button" class="chip" data-spot="${s.id}" aria-pressed="false">${s.label}</button>`)
          .join('')}</div>`,
    )
    .join('');
  $('#spotBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-spot]');
    if (!b) return;
    state.spot = b.dataset.spot;
    render();
  });

  const grid = $('#rgGrid');
  grid.innerHTML = HAND_CLASSES.map(
    (cls) =>
      `<button type="button" class="cell" data-c="${cls}">${cls.length === 3 ? cls.slice(0, 2) + '<small>' + cls[2] + '</small>' : cls}</button>`,
  ).join('');
  grid.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.cell');
    if (!b || state.mode !== 'build') return;
    e.preventDefault();
    state.painting = true;
    const cur = state.build.get(b.dataset.c) || 0;
    state.paintW = cur === state.brush ? 0 : state.brush;
    paint(b.dataset.c);
  });
  grid.addEventListener('pointerover', (e) => {
    if (!state.painting) return;
    const b = e.target.closest('.cell');
    if (b) paint(b.dataset.c);
  });
  window.addEventListener('pointerup', () => {
    if (!state.painting) return;
    state.painting = false;
    $('#bdText').value = compressRange(state.build);
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.cell');
    if (!b || state.mode !== 'chart') return;
    state.sel = b.dataset.c;
    renderGrid();
    renderDetail();
  });
  grid.addEventListener('keydown', (e) => {
    if (state.mode !== 'build' || (e.key !== 'Enter' && e.key !== ' ')) return;
    const b = e.target.closest('.cell');
    if (!b) return;
    e.preventDefault();
    const cur = state.build.get(b.dataset.c) || 0;
    state.paintW = cur === state.brush ? 0 : state.brush;
    paint(b.dataset.c);
    $('#bdText').value = compressRange(state.build);
  });

  $$('#v-ranges [data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      render();
    }),
  );
  $('#brush').addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    state.brush = +b.dataset.w;
    $$('#brush button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
  $('#bdLoad').onclick = () => {
    const { map, errors } = parseRange($('#bdText').value);
    state.build = map;
    render();
    if (errors.length) $('#rgSub').innerHTML = `<span class="err">Couldn't read: ${esc(errors.join(', '))}</span>`;
  };
  $('#bdClear').onclick = () => {
    state.build = new Map();
    $('#bdText').value = '';
    render();
  };
  $('#bdFromSpot').onclick = () => {
    const s = SPOT[state.spot];
    state.build = new Map(s.raiseEff);
    for (const [k, v] of s.callEff) state.build.set(k, Math.min(1, (state.build.get(k) || 0) + v));
    $('#bdText').value = compressRange(state.build);
    render();
  };
  $('#bdCopy').onclick = async () => {
    const t = $('#bdText');
    try {
      await navigator.clipboard.writeText(t.value);
      $('#bdCopy').textContent = 'Copied';
      setTimeout(() => ($('#bdCopy').textContent = 'Copy'), 1400);
    } catch {
      t.select();
    }
  };
  $('#bdToEq').onclick = () => {
    if (!state.build.size) return;
    nav.openEquity([
      { mode: 'cards', cards: [null, null] },
      { mode: 'range', range: compressRange(state.build), preset: 'custom' },
    ]);
  };

  nav.openRanges = (spotId, cls) => {
    state.spot = spotId;
    state.sel = cls;
    state.mode = 'chart';
    go('ranges');
  };
}

function paint(cls) {
  if (state.paintW > 0) state.build.set(cls, state.paintW);
  else state.build.delete(cls);
  styleBuildCell($(`#rgGrid [data-c="${cls}"]`), cls);
  renderBuildStats();
}

function styleBuildCell(b, cls) {
  const w = state.build.get(cls) || 0;
  b.style.cssText = w ? `background:linear-gradient(to top,var(--accent) 0 ${w * 100}%,var(--cell-empty) ${w * 100}% 100%)` : '';
  b.classList.toggle('zero', !w);
}

function renderBuildStats() {
  const st = rangeStats(state.build);
  $('#rgSub').textContent = `${st.combos.toFixed(0)} combos · ${st.pct.toFixed(1)}% of all hands`;
}

export function show() {
  render();
}

function render() {
  const s = SPOT[state.spot];
  $$('#spotBar [data-spot]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.spot === state.spot));
  $$('#v-ranges [data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
  $('#rgBuild').hidden = state.mode !== 'build';
  $('#rgDetail').hidden = state.mode === 'build';
  if (state.mode === 'build') {
    $('#rgTitle').textContent = 'Range builder';
    $$('#rgGrid .cell').forEach((b) => {
      b.classList.remove('sel');
      styleBuildCell(b, b.dataset.c);
    });
    $('#rgLegend').innerHTML = `<span><span class="sw" style="background:var(--accent)"></span>In range (fill height = weight)</span>`;
    renderBuildStats();
    return;
  }
  $('#rgTitle').textContent = s.label;
  renderGrid();
  const tot = [0, 0, 0];
  for (const cls of HAND_CLASSES) for (let k = 0; k < 3; k++) tot[k] += s.fr[cls][k] * comboCount(cls);
  $('#rgSub').textContent = describeSpot(s);
  $('#rgLegend').innerHTML = [
    [s.raiseName, 'raise', tot[0]],
    ...(s.callEff.size ? [['Call', 'call', tot[1]]] : []),
    ['Fold', 'fold', tot[2]],
  ]
    .map(
      ([n, v, c]) =>
        `<span><span class="sw" style="background:var(--${v})"></span>${n} <span class="mono">${(c / 13.26).toFixed(1)}%</span></span>`,
    )
    .join('');
  renderDetail();
}

function renderGrid() {
  const s = SPOT[state.spot];
  $$('#rgGrid .cell').forEach((b) => {
    const f = s.fr[b.dataset.c];
    b.style.cssText = freqBackground(f);
    b.classList.toggle('zero', f[2] >= 0.999);
    b.classList.toggle('sel', b.dataset.c === state.sel);
    b.title = `${b.dataset.c}: ${s.raiseName} ${pct(f[0], 0)}, ${s.callEff.size ? 'call ' + pct(f[1], 0) + ', ' : ''}fold ${pct(f[2], 0)}`;
  });
}

async function renderDetail() {
  const s = SPOT[state.spot];
  const cls = state.sel;
  const vsText = s.vs ? `${s.vs} opening range` : 'a random hand';
  $('#rgDetail').innerHTML = `
    <div class="row between start">
      <div><span class="eyebrow">${esc(s.label)}</span><h2 class="hand-title">${cls}</h2>
      <p class="muted">${comboCount(cls)} combos · ${cls.length === 2 ? 'pocket pair' : cls[2] === 's' ? 'suited' : 'offsuit'}</p></div>
      ${cardsHTML(COMBOS[cls][0])}
    </div>
    ${freqBars(s, s.fr[cls])}
    <div class="stat-row">
      <div class="stat"><div class="k">Equity vs ${esc(vsText)}</div><div class="n" id="rgEq">…</div><div class="s">all-in preflop, before card removal</div></div>
    </div>
    <div><h3 class="mb-6">Why</h3><ul class="notes">${handNotes(cls, s)
      .map((t) => `<li>${t}</li>`)
      .join('')}</ul></div>
    <div class="row"><button class="btn small" type="button" id="rgToEq">Open in equity calculator</button><button class="btn small" type="button" id="rgDrill">Drill this spot</button></div>`;
  $('#rgToEq').onclick = () =>
    nav.openEquity([
      { mode: 'range', range: cls, preset: 'custom' },
      s.vs ? { mode: 'range', range: compressRange(SPOT[s.vs].raiseEff), preset: 'open-' + s.vs } : { mode: 'random' },
    ]);
  $('#rgDrill').onclick = () => nav.openDrill(s.id);

  const isCancelled = nextJob();
  try {
    const r = await calculateEquity([{ map: new Map([[cls, 1]]) }, s.vs ? { map: SPOT[s.vs].raiseEff } : { random: true }], [], {
      iterations: 24000,
      isCancelled,
    });
    if (r && !isCancelled()) $('#rgEq').textContent = pct(r.eq[0] / r.total);
  } catch {
    if (!isCancelled()) $('#rgEq').textContent = 'n/a';
  }
}
