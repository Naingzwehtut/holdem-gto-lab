/** Practice drills: preflop trainer, pot math and equity guessing. */
import { COMBOS, HAND_CLASSES, classOf } from '../engine/ranges.js';
import { calculateEquity } from '../engine/equity.js';
import { SPOTS, SPOT, describeSpot } from '../data/spots.js';
import { handNotes } from '../data/notes.js';
import { $, $$, cardsHTML, esc, freqBars, loadStore, pct, saveStore } from './dom.js';
import { go, nav } from './nav.js';

const store = loadStore();
const stats = Object.assign({ pf: { n: 0, ok: 0, streak: 0, best: 0 }, math: { n: 0, ok: 0 }, eq: { n: 0, err: 0 } }, store.stats || {});
const saveStats = () => {
  store.stats = stats;
  saveStore(store);
};
const state = { drill: 'pf', pf: null, pfSpot: null, math: null, eqQ: null };

const randomCombo = (cls) => COMBOS[cls][(Math.random() * COMBOS[cls].length) | 0];

/** True when a hand and all its grid neighbours share one pure action (easy, so shown less often). */
function isBoring(spot, cls) {
  const i = HAND_CLASSES.indexOf(cls);
  const r = (i / 13) | 0;
  const c = i % 13;
  const f = spot.fr[cls];
  const around = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ]
    .filter(([a, b]) => a >= 0 && a < 13 && b >= 0 && b < 13)
    .map(([a, b]) => spot.fr[HAND_CLASSES[a * 13 + b]]);
  return around.every((g) => Math.abs(g[0] - f[0]) < 0.01 && Math.abs(g[1] - f[1]) < 0.01) && f.some((x) => x >= 0.999);
}

function newPreflop() {
  const s = SPOT[state.pfSpot] || SPOTS[(Math.random() * SPOTS.length) | 0];
  let cls;
  for (let t = 0; t < 30; t++) {
    const a = (Math.random() * 52) | 0;
    let b;
    do b = (Math.random() * 52) | 0;
    while (b === a);
    cls = classOf(a, b);
    if (!isBoring(s, cls) || Math.random() < 0.25) break;
  }
  state.pf = { spot: s.id, cls, cards: randomCombo(cls), answered: null };
}

function answerPreflop(act) {
  const q = state.pf;
  if (!q || q.answered) return;
  const x = SPOT[q.spot].fr[q.cls][{ raise: 0, call: 1, fold: 2 }[act]];
  const grade = x >= 0.5 ? 'good' : x >= 0.2 ? 'warn' : 'bad';
  q.answered = { act, grade };
  stats.pf.n++;
  if (grade !== 'bad') {
    stats.pf.ok++;
    stats.pf.streak++;
    stats.pf.best = Math.max(stats.pf.best, stats.pf.streak);
  } else stats.pf.streak = 0;
  saveStats();
  render();
}

const MATH_TYPES = [
  {
    k: 'odds',
    title: 'Pot odds',
    q: (P, B) => `The pot is <b>${P}bb</b> and your opponent bets <b>${B}bb</b>. What equity do you need to call?`,
    a: (P, B) => B / (P + 2 * B),
    f: (P, B) => `${B} ÷ (${P} + 2×${B}) = ${B} ÷ ${P + 2 * B}`,
  },
  {
    k: 'mdf',
    title: 'Minimum defense',
    q: (P, B) =>
      `Your opponent bets <b>${B}bb</b> into <b>${P}bb</b>. What share of your range must continue so their bluffs can't auto-profit (MDF)?`,
    a: (P, B) => P / (P + B),
    f: (P, B) => `${P} ÷ (${P} + ${B}) = ${P} ÷ ${P + B}`,
  },
  {
    k: 'fe',
    title: 'Fold equity',
    q: (P, B) =>
      `You bluff <b>${B}bb</b> into <b>${P}bb</b> with a hand that never wins at showdown. How often must they fold to break even?`,
    a: (P, B) => B / (P + B),
    f: (P, B) => `${B} ÷ (${P} + ${B}) = ${B} ÷ ${P + B}`,
  },
  {
    k: 'bluff',
    title: 'Bluff ratio',
    q: (P, B) =>
      `On the river you bet <b>${B}bb</b> into <b>${P}bb</b> with a polarized range. What share of your bets should be bluffs for balance?`,
    a: (P, B) => B / (P + 2 * B),
    f: (P, B) => `${B} ÷ (${P} + 2×${B}) = ${B} ÷ ${P + 2 * B}`,
  },
];

function newMath() {
  const t = MATH_TYPES[(Math.random() * MATH_TYPES.length) | 0];
  const P = [6, 8, 10, 12, 15, 20, 24, 30, 40, 50, 60, 80, 100][(Math.random() * 13) | 0];
  const B = Math.max(1, Math.round(P * [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2][(Math.random() * 9) | 0]));
  state.math = { t, P, B, ans: null };
}

function newEquityQuestion() {
  const used = new Set();
  const draw = () => {
    let c;
    do c = (Math.random() * 52) | 0;
    while (used.has(c));
    used.add(c);
    return c;
  };
  const hero = [draw(), draw()];
  const vill = [draw(), draw()];
  const board = Math.random() < 0.5 ? [draw(), draw(), draw()] : [];
  const q = { hero, vill, board, guess: 50, actual: null, done: false };
  state.eqQ = q;
  calculateEquity([{ cards: hero }, { cards: vill }], board, { iterations: 30000 }).then((r) => {
    q.actual = r.eq[0] / r.total;
    if (state.eqQ === q && q.done) finishEquity(q);
  });
}

function finishEquity(q) {
  if (q.scored) return;
  q.scored = true;
  stats.eq.n++;
  stats.eq.err += Math.abs(q.guess / 100 - q.actual) * 100;
  saveStats();
  render();
}

function equityHint(q) {
  if (q.board.length) return 'Count your outs and multiply by 4 for the flop, then adjust for outs that may not be clean.';
  const [h, v] = [q.hero, q.vill].map((x) => x.map((c) => c >> 2).sort((a, b) => b - a));
  const hp = h[0] === h[1];
  const vp = v[0] === v[1];
  if (hp && vp) return 'Pair against pair: the higher pair wins about 80% of the time.';
  if (hp || vp) {
    const p = hp ? h : v;
    const o = hp ? v : h;
    const overs = o.filter((r) => r > p[0]).length;
    if (overs === 2) return 'Pair vs two overcards is close to a coin flip, about 55/45 for the pair.';
    if (overs === 1) return 'Pair vs one overcard: the pair is roughly a 70/30 favourite.';
    return 'Pair vs two lower cards: the pair is about an 85/15 favourite.';
  }
  if (h.some((r) => v.includes(r))) return 'A shared card means domination: the hand with the higher other card is usually around 70%.';
  return 'Two unpaired hands with no shared card usually land between 55% and 65% for the higher cards.';
}

export function init() {
  $('#drillTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    state.drill = b.dataset.d;
    render();
  });
  $('#resetStats').onclick = () => {
    stats.pf = { n: 0, ok: 0, streak: 0, best: 0 };
    stats.math = { n: 0, ok: 0 };
    stats.eq = { n: 0, err: 0 };
    saveStats();
    render();
  };
  document.addEventListener('keydown', (e) => {
    if ($('#v-practice').hidden || state.drill !== 'pf' || e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey)
      return;
    const k = e.key.toLowerCase();
    const s = state.pf && SPOT[state.pf.spot];
    if (k === 'f') answerPreflop('fold');
    else if (k === 'r') answerPreflop('raise');
    else if (k === 'c' && s && s.group === 'vs') answerPreflop('call');
    else if (k === 'n' && state.pf && state.pf.answered) {
      newPreflop();
      render();
    }
  });
  nav.openDrill = (spotId) => {
    state.drill = 'pf';
    state.pfSpot = spotId;
    newPreflop();
    go('practice');
    render();
  };
}

export function show() {
  render();
}

function render() {
  $$('#drillTabs [data-d]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.d === state.drill));
  if (state.drill === 'pf') renderPreflop();
  else if (state.drill === 'math') renderMath();
  else renderEquity();
}

function renderPreflop() {
  if (!state.pf) newPreflop();
  const q = state.pf;
  const s = SPOT[q.spot];
  const a = q.answered;
  const acts = [['fold', 'Fold', 'F'], ...(s.group === 'vs' ? [['call', 'Call', 'C']] : []), ['raise', s.raiseName, 'R']];
  const label = { good: 'Correct', warn: 'Acceptable: a mixed hand', bad: 'Mistake' };
  $('#drill').innerHTML = `
    <div class="row between"><h2>Preflop trainer</h2>
      <select id="pfSpotSel" aria-label="Spot" class="auto"><option value="">Random spots</option>${SPOTS.map(
        (x) => `<option value="${x.id}" ${state.pfSpot === x.id ? 'selected' : ''}>${x.label}</option>`,
      ).join('')}</select></div>
    <div class="table-felt">
      <span class="eyebrow">${esc(s.label)} · 6-max · 100bb</span>
      <p class="scen">${describeSpot(s)}</p>
      ${cardsHTML(q.cards)}
      <div class="acts">${acts
        .map(
          ([k, n, key]) =>
            `<button type="button" class="btn act-${k}" data-act="${k}" ${a ? 'disabled' : ''}>${n} <kbd>${key}</kbd></button>`,
        )
        .join('')}</div>
    </div>
    ${
      a
        ? `<div class="feedback ${a.grade}">
      <div class="head">${label[a.grade]}</div>
      ${freqBars(s, s.fr[q.cls])}
      <ul class="notes">${handNotes(q.cls, s)
        .slice(0, 3)
        .map((t) => `<li>${t}</li>`)
        .join('')}</ul>
      <div class="row"><button type="button" class="btn primary" id="pfNext">Next hand <kbd class="inv">N</kbd></button><button type="button" class="btn" id="pfChart">See full chart</button></div>
    </div>`
        : ''
    }`;
  $$('#drill [data-act]').forEach((b) => (b.onclick = () => answerPreflop(b.dataset.act)));
  $('#pfSpotSel').onchange = (e) => {
    state.pfSpot = e.target.value || null;
    newPreflop();
    render();
  };
  if (a) {
    $('#pfNext').onclick = () => {
      newPreflop();
      render();
    };
    $('#pfChart').onclick = () => nav.openRanges(q.spot, q.cls);
  }
  const st = stats.pf;
  $('#drillSide').innerHTML = `<h2>Your record</h2>
    <div class="stat-row">
      <div class="stat"><div class="k">Accuracy</div><div class="n">${st.n ? pct(st.ok / st.n, 0) : '–'}</div><div class="s">${st.ok} of ${st.n} hands</div></div>
      <div class="stat"><div class="k">Streak</div><div class="n">${st.streak}</div><div class="s">best ${st.best}</div></div>
    </div>
    <h3>How grading works</h3>
    <ul class="notes"><li><b>Correct</b>: the chart takes your action at least half the time.</li><li><b>Acceptable</b>: a mixed hand where your action is used 20–49% of the time.</li><li><b>Mistake</b>: the chart rarely or never does this.</li></ul>
    <p class="muted small-text">Hands are weighted toward the edges of each range, where decisions are hardest. Keys: <kbd>F</kbd> fold, <kbd>C</kbd> call, <kbd>R</kbd> raise, <kbd>N</kbd> next.</p>`;
}

function renderMath() {
  if (!state.math) newMath();
  const m = state.math;
  const correct = m.t.a(m.P, m.B);
  const answered = m.ans != null;
  const ok = answered && Math.abs(m.ans / 100 - correct) <= 0.02;
  $('#drill').innerHTML = `<h2>Pot math</h2>
    <div class="table-felt"><span class="eyebrow">${m.t.title}</span><p class="scen">${m.t.q(m.P, m.B)}</p>
      <form id="mathForm" class="row center">
        <input type="number" id="mathIn" min="0" max="100" step="0.1" placeholder="%" class="answer" ${answered ? 'disabled' : ''} value="${answered ? m.ans : ''}" aria-label="Your answer in percent">
        <button class="btn primary" ${answered ? 'disabled' : ''}>Check</button>
      </form></div>
    ${
      answered
        ? `<div class="feedback ${ok ? 'good' : 'bad'}"><div class="head">${ok ? 'Correct' : 'Not quite'}: ${pct(correct)}</div><div class="formula">${m.t.f(m.P, m.B)} = ${pct(correct)}</div><div class="row"><button type="button" class="btn primary" id="mathNext">Next question</button></div></div>`
        : ''
    }`;
  $('#mathForm').onsubmit = (e) => {
    e.preventDefault();
    const v = parseFloat($('#mathIn').value);
    if (Number.isNaN(v)) return;
    m.ans = v;
    stats.math.n++;
    if (Math.abs(v / 100 - correct) <= 0.02) stats.math.ok++;
    saveStats();
    render();
  };
  if (answered) {
    $('#mathNext').onclick = () => {
      newMath();
      render();
      $('#mathIn')?.focus();
    };
  }
  $('#drillSide').innerHTML = `<h2>Your record</h2>
    <div class="stat-row"><div class="stat"><div class="k">Accuracy</div><div class="n">${stats.math.n ? pct(stats.math.ok / stats.math.n, 0) : '–'}</div><div class="s">${stats.math.ok} of ${stats.math.n}, within 2 points</div></div></div>
    <h3>Formulas</h3>
    <div class="formula">Pot odds = B ÷ (P + 2B)<br>MDF = P ÷ (P + B)<br>Bluff needs folds = B ÷ (P + B)<br>River bluff share = B ÷ (P + 2B)</div>
    <p class="muted small-text">P is the pot before the bet, B is the bet. Learn these four and most sizing questions become arithmetic.</p>`;
}

function renderEquity() {
  if (!state.eqQ) newEquityQuestion();
  const q = state.eqQ;
  let feedback = '';
  if (q.done) {
    if (q.actual == null) feedback = `<div class="feedback"><div class="head">Calculating…</div></div>`;
    else {
      const e = Math.abs(q.guess / 100 - q.actual) * 100;
      const cls = e <= 3 ? 'good' : e <= 8 ? 'warn' : 'bad';
      feedback = `<div class="feedback ${cls}"><div class="head">Actual ${pct(q.actual)} · ${e <= 3 ? 'sharp' : e <= 8 ? 'close' : 'off by ' + e.toFixed(1) + ' points'}</div><p class="muted">${equityHint(q)}</p><div class="row"><button type="button" class="btn primary" id="eqNext">Next matchup</button></div></div>`;
    }
  }
  $('#drill').innerHTML = `<h2>Equity guess</h2>
    <div class="table-felt">
      <span class="eyebrow">${q.board.length ? 'On the flop' : 'All-in preflop'}</span>
      <div class="row center wide-gap">
        <div><div class="muted small-text mb-6">You</div>${cardsHTML(q.hero)}</div>
        <div><div class="muted small-text mb-6">Opponent</div>${cardsHTML(q.vill)}</div>
      </div>
      ${q.board.length ? `<div><div class="muted small-text mb-6">Board</div>${cardsHTML(q.board, 'sm')}</div>` : ''}
      <div class="guess-box"><div class="guess" id="eqGuessV">${q.guess}%</div><input type="range" id="eqGuess" min="0" max="100" value="${q.guess}" ${q.done ? 'disabled' : ''} aria-label="Your equity guess"></div>
      <button class="btn primary" id="eqLock" ${q.done ? 'disabled' : ''}>Lock in guess</button>
    </div>
    ${feedback}`;
  const slider = $('#eqGuess');
  slider.oninput = () => {
    q.guess = +slider.value;
    $('#eqGuessV').textContent = q.guess + '%';
  };
  $('#eqLock').onclick = () => {
    q.done = true;
    if (q.actual != null) finishEquity(q);
    else render();
  };
  const next = $('#eqNext');
  if (next) {
    next.onclick = () => {
      newEquityQuestion();
      render();
    };
  }
  $('#drillSide').innerHTML = `<h2>Your record</h2>
    <div class="stat-row"><div class="stat"><div class="k">Average miss</div><div class="n">${stats.eq.n ? (stats.eq.err / stats.eq.n).toFixed(1) + ' pts' : '–'}</div><div class="s">over ${stats.eq.n} matchups</div></div></div>
    <h3>Benchmarks to remember</h3>
    <div class="tablewrap"><table class="tbl"><tbody>
      <tr><td>Overpair vs underpair</td><td>≈ 80%</td></tr>
      <tr><td>Pair vs two overcards</td><td>≈ 55%</td></tr>
      <tr><td>Two overcards vs two unders</td><td>≈ 63%</td></tr>
      <tr><td>Dominated (AK vs AQ)</td><td>≈ 74%</td></tr>
      <tr><td>Flush draw on flop, 9 outs</td><td>≈ 35%</td></tr>
      <tr><td>Open-ender on flop, 8 outs</td><td>≈ 31%</td></tr>
    </tbody></table></div>
    <p class="muted small-text">On the flop, outs × 4 approximates your chance to hit by the river. On the turn use outs × 2.</p>`;
}
