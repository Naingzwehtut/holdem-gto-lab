/** Postflop spot analyzer: equity vs range, price, MDF and range composition. */
import { CATEGORY_NAMES, cardToString, parseCards } from '../engine/cards.js';
import { compressRange, parseRange, rangeStats } from '../engine/ranges.js';
import { calculateEquity, equityVsRangeExact, rangeBreakdown } from '../engine/equity.js';
import { presetById } from '../data/spots.js';
import { $, cardsHTML, debounce, esc, fmt, jobCounter, pct, presetOptions } from './dom.js';
import { go, nav } from './nav.js';

const nextJob = jobCounter();
let started = false;

export function init() {
  $('#anPreset').innerHTML = presetOptions('call-BBvBTN');
  $('#anRange').value = compressRange(presetById('call-BBvBTN').map);
  $('#anPreset').onchange = () => {
    const p = presetById($('#anPreset').value);
    if (p) $('#anRange').value = compressRange(p.map);
    analyzeSoon();
  };
  $('#anRange').addEventListener('input', () => {
    $('#anPreset').value = 'custom';
    analyzeSoon();
  });
  ['anHero', 'anBoard', 'anPot', 'anBet'].forEach((id) => $('#' + id).addEventListener('input', analyzeSoon));
  $('#anForm').addEventListener('submit', (e) => {
    e.preventDefault();
    analyze();
  });

  nav.openAnalyzer = ({ hero, board, pot, bet, presetId }) => {
    $('#anHero').value = hero.map(cardToString).join('');
    $('#anBoard').value = board.map(cardToString).join('');
    $('#anPot').value = fmt(pot);
    $('#anBet').value = fmt(bet);
    const p = presetId && presetById(presetId);
    if (p) {
      $('#anPreset').value = p.id;
      $('#anRange').value = compressRange(p.map);
    }
    started = true;
    go('analyzer');
    analyze();
  };
}

export function show() {
  if (!started) {
    started = true;
    analyze();
  }
}

const analyzeSoon = debounce(analyze, 260);

async function analyze() {
  const err = $('#anErr');
  const out = $('#anOut');
  err.textContent = '';
  const hero = parseCards($('#anHero').value);
  const board = parseCards($('#anBoard').value);
  $('#anPreview').innerHTML =
    (hero && hero.length === 2 ? cardsHTML(hero) : '') + (board && board.length ? `<span class="gap"></span>${cardsHTML(board)}` : '');
  const { map, errors } = parseRange($('#anRange').value);
  const st = rangeStats(map);
  $('#anRangeInfo').innerHTML = errors.length
    ? `<span class="err">Couldn't read: ${esc(errors.join(', '))}</span>`
    : `${st.combos.toFixed(0)} combos before card removal · ${st.pct.toFixed(1)}% of hands`;
  const P = Math.max(0, parseFloat($('#anPot').value) || 0);
  const B = Math.max(0, parseFloat($('#anBet').value) || 0);

  if (!hero || hero.length !== 2) return void (err.textContent = 'Enter your two cards, for example KhQh.');
  if (!board || board.length < 3 || board.length > 5) return void (err.textContent = 'Enter 3, 4 or 5 board cards, for example Qs7h2d.');
  if (hero.some((c) => board.includes(c))) return void (err.textContent = 'A card appears in both your hand and the board.');
  if (!map.size) return void (err.textContent = 'The opponent range is empty.');
  if (!P) return void (err.textContent = 'Enter the pot size.');
  const bd = rangeBreakdown(hero, board, map);
  if (!bd) return void (err.textContent = 'Every hand in that range is blocked by the cards shown.');

  out.innerHTML = `<h2>Analysis</h2><p class="muted">Calculating…</p>`;
  let eq;
  if (board.length >= 4) eq = equityVsRangeExact(hero, board, map);
  else {
    const isCancelled = nextJob();
    const r = await calculateEquity([{ cards: hero }, { map }], board, { iterations: 40000, isCancelled });
    if (!r) return;
    eq = r.eq[0] / r.total;
  }

  const street = ['', '', '', 'flop', 'turn', 'river'][board.length];
  const need = B ? B / (P + 2 * B) : 0;
  const mdf = B ? P / (P + B) : 1;
  const ev = eq * (P + 2 * B) - B;
  let v;
  if (!B)
    v = { cls: 'warn', h: 'Checked to you', t: `You have ${pct(eq)} equity against this range. Use the sizing table below to plan a bet.` };
  else if (eq >= need + 0.03) {
    v = {
      cls: 'good',
      h: eq > 0.62 && board.length < 5 ? 'Call or raise' : 'Call',
      t: `Your ${pct(eq)} equity clears the ${pct(need)} you need${board.length < 5 ? ', before counting any future betting' : ''}.`,
    };
  } else if (eq >= need - 0.03) {
    v = {
      cls: 'warn',
      h: 'Close spot',
      t: `Equity ${pct(eq)} against ${pct(need)} needed. ${board.length < 5 ? 'Implied odds and position decide it.' : 'Ask whether this player bluffs enough to make up the gap.'}`,
    };
  } else
    v = {
      cls: 'bad',
      h: 'Fold',
      t: `You need ${pct(need)} but have ${pct(eq)}${board.length < 5 ? '. Only call with strong implied odds' : ''}.`,
    };

  const order = [8, 7, 6, 5, 4, 3, 2, 1, 0].filter((k) => bd.cats[k] > 0.0005);
  const sizes = [0.33, 0.5, 0.75, 1, 1.5];
  out.innerHTML = `
    <div class="row between"><h2>Analysis</h2><span class="muted mono tiny">${street} · ${bd.combos.toFixed(0)} live combos</span></div>
    <div class="verdict ${v.cls}"><strong>${v.h}</strong><span>${v.t}</span></div>
    <div class="stat-row">
      <div class="stat"><div class="k">Your equity</div><div class="n">${pct(eq)}</div><div class="s">${board.length >= 4 ? 'exact' : 'simulated'} vs range</div></div>
      ${
        B
          ? `<div class="stat"><div class="k">Equity needed</div><div class="n">${pct(need)}</div><div class="s">${fmt(B)} to win ${fmt(P + B)}</div></div>
      <div class="stat"><div class="k">EV of calling</div><div class="n" style="color:var(--${ev >= 0 ? 'good' : 'bad'})">${ev >= 0 ? '+' : ''}${ev.toFixed(2)}bb</div><div class="s">vs folding, if no more betting</div></div>
      <div class="stat"><div class="k">MDF</div><div class="n">${pct(mdf)}</div><div class="s">of your range must continue</div></div>`
          : ''
      }
    </div>
    <div>
      <h3 class="mb-6">Where you stand right now</h3>
      <p class="muted small-text mb-8">You hold ${CATEGORY_NAMES[bd.heroCat].toLowerCase()}. Against the current board you're ahead of ${pct(bd.ahead)} of their combos, tied with ${pct(bd.tie)}, behind ${pct(bd.behind)}.</p>
      <div class="stack"><span style="width:${bd.ahead * 100}%;background:var(--good)"></span><span style="width:${bd.tie * 100}%;background:var(--muted)"></span><span style="width:${bd.behind * 100}%;background:var(--bad)"></span></div>
    </div>
    <div>
      <h3 class="mb-8">Their range on this board</h3>
      <div class="dist">${order
        .map(
          (k) =>
            `<span>${CATEGORY_NAMES[k]}</span><span class="track flex"><span style="width:${(bd.cats[k] - bd.beat[k]) * 100}%"></span><span class="beat" style="width:${bd.beat[k] * 100}%"></span></span><span class="v">${pct(bd.cats[k])}</span>`,
        )
        .join('')}</div>
      <p class="muted tiny mt-6"><span class="sw" style="background:var(--bad)"></span>part of each group that beats you now</p>
    </div>
    <div>
      <h3 class="mb-6">Bet sizing math for this pot</h3>
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Bet</th><th>bb</th><th>Bluff needs folds</th><th>Their MDF</th><th>River bluff share</th></tr></thead>
        <tbody>${sizes
          .map((x) => {
            const b = P * x;
            return `<tr><td>${Math.round(x * 100)}% pot</td><td>${fmt(b)}</td><td>${pct(b / (P + b))}</td><td>${pct(P / (P + b))}</td><td>${pct(b / (P + 2 * b))}</td></tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </div>
    <p class="fine">Preflop ranges are wider than what actually reaches the ${street}. For a sharper read, remove hands the opponent would have folded or raised earlier. Pick a preset, then edit its text.</p>`;
}
