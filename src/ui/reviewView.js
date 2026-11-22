/** Session review: hand history import and screenshot scanner. */
import { cardToString, parseCards } from '../engine/cards.js';
import { SPOT } from '../data/spots.js';
import { gradePreflop, guessVillainPreset, heroDecisions, heroNet, parseHandHistories, sessionStats } from '../review/handHistory.js';
import { drawDemoTable, scanImage } from '../review/scanner.js';
import { $, $$, cardsHTML, esc, fmt, freqBars, pct } from './dom.js';
import { nav } from './nav.js';

const state = { hands: [], sel: 0, scan: null, image: null };
const GRADE_LABEL = { good: 'Matches chart', warn: 'Mixed hand', bad: 'Off chart' };
const VERB = { folds: 'folds', checks: 'checks', calls: 'calls', bets: 'bets', raises: 'raises to', posts: 'posts' };

export function init() {
  $('#hhImport').onclick = () => importText($('#hhText').value);
  $('#hhSample').onclick = async () => {
    try {
      const texts = await Promise.all(
        ['samples/pokerstars-6max.txt', 'samples/ggpoker-6max.txt'].map((u) => fetch(u).then((r) => r.text())),
      );
      $('#hhText').value = texts.join('\n\n');
      importText($('#hhText').value);
    } catch {
      $('#hhMsg').textContent =
        'Could not load the sample files. Serve the app over http (npm start) rather than opening index.html directly.';
    }
  };
  $('#hhFile').onchange = async (e) => {
    const texts = await Promise.all([...e.target.files].map((f) => f.text()));
    $('#hhText').value = texts.join('\n\n');
    importText($('#hhText').value);
  };
  $('#hhList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-h]');
    if (!row) return;
    state.sel = +row.dataset.h;
    renderList();
    renderDetail();
  });

  // screenshot scanner
  const drop = $('#scDrop');
  ['dragenter', 'dragover'].forEach((t) =>
    drop.addEventListener(t, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) loadImageFile(f);
  });
  $('#scFile').onchange = (e) => e.target.files[0] && loadImageFile(e.target.files[0]);
  document.addEventListener('paste', (e) => {
    if ($('#v-review').hidden) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) loadImageFile(item.getAsFile());
  });
  $('#scDemo').onclick = () => {
    const deck = [...Array(52).keys()].sort(() => Math.random() - 0.5);
    const cv = document.createElement('canvas');
    drawDemoTable(cv, { hero: deck.slice(0, 2), board: deck.slice(2, 7), fourColor: $('#scFour').checked });
    runScan(
      cv,
      `Generated table · real cards: hand ${deck.slice(0, 2).map(cardToString).join(' ')}, board ${deck.slice(2, 7).map(cardToString).join(' ')}`,
    );
  };
  $('#scOut').addEventListener('click', (e) => {
    if (!e.target.closest('#scToAnalyzer')) return;
    const hero = parseCards($('#scHero').value);
    const board = parseCards($('#scBoard').value);
    if (!hero || hero.length !== 2 || !board || board.length < 3) {
      $('#scErr').textContent = 'Check the cards: you need two hole cards and 3 to 5 board cards.';
      return;
    }
    nav.openAnalyzer({ hero, board, pot: +$('#scPot').value || 10, bet: +$('#scBet').value || 0 });
  });
}

export function show() {}

function importText(text) {
  state.hands = parseHandHistories(text);
  state.sel = 0;
  $('#hhMsg').textContent = state.hands.length
    ? ''
    : 'No hands found. Paste PokerStars or GGPoker hand histories, starting with the "PokerStars Hand #" or "Poker Hand #" line.';
  renderSummary();
  renderList();
  renderDetail();
}

function renderSummary() {
  if (!state.hands.length) return void ($('#hhSummary').innerHTML = '');
  const s = sessionStats(state.hands);
  $('#hhSummary').innerHTML = `<div class="stat-row">
    <div class="stat"><div class="k">Hands</div><div class="n">${s.hands}</div></div>
    <div class="stat"><div class="k">Result</div><div class="n" style="color:var(--${s.net >= 0 ? 'good' : 'bad'})">${s.net >= 0 ? '+' : ''}${fmt(s.net)}bb</div></div>
    <div class="stat"><div class="k">VPIP / PFR</div><div class="n">${pct(s.vpip, 0)} / ${pct(s.pfr, 0)}</div></div>
    <div class="stat"><div class="k">Preflop vs chart</div><div class="n">${s.graded ? pct(s.correct / s.graded, 0) : '–'}</div><div class="s">${s.correct} of ${s.graded} graded spots</div></div>
  </div>`;
}

function renderList() {
  if (!state.hands.length) return void ($('#hhList').innerHTML = '');
  $('#hhList').innerHTML = `<div class="tablewrap"><table class="tbl hands">
    <thead><tr><th>Hand</th><th>Pos</th><th>Cards</th><th>Preflop</th><th>Result</th></tr></thead>
    <tbody>${state.hands
      .map((h, i) => {
        const g = gradePreflop(h);
        const net = heroNet(h);
        return `<tr data-h="${i}" class="${i === state.sel ? 'sel' : ''}" tabindex="0">
          <td>${esc(h.id.slice(-6))}</td><td>${esc(h.positions[h.hero] || '–')}</td>
          <td>${h.heroCards ? h.heroCards.map(cardToString).join(' ') : '–'}</td>
          <td>${g && g.spotId ? `<span class="pill ${g.grade}">${GRADE_LABEL[g.grade]}</span>` : '<span class="muted">–</span>'}</td>
          <td style="color:var(--${net >= 0 ? 'good' : 'bad'})">${net >= 0 ? '+' : ''}${fmt(net)}</td></tr>`;
      })
      .join('')}</tbody></table></div>`;
}

function renderDetail() {
  const h = state.hands[state.sel];
  const out = $('#hhDetail');
  if (!h) {
    out.innerHTML = `<h2>Hand details</h2><p class="muted">Import hands to see each one street by street, with your preflop decision checked against the charts and every postflop decision one click from the analyzer.</p>`;
    return;
  }
  const bb = h.bb || 1;
  const g = gradePreflop(h);
  const decisions = heroDecisions(h);
  const preset = guessVillainPreset(h);
  const streets = ['preflop', 'flop', 'turn', 'river'].filter((s) => h.actions.some((a) => a.street === s));
  let d = 0;
  const timeline = streets
    .map((s) => {
      const acts = h.actions.filter((a) => a.street === s);
      return `<div class="street"><div class="street-head"><span class="eyebrow">${s}</span>${s !== 'preflop' && h.boards[s] ? cardsHTML(h.boards[s], 'sm') : ''}<span class="muted tiny">pot ${fmt(acts[0].potBefore / bb)}bb</span></div>
        <ul class="acts-list">${acts
          .map((a) => {
            const isHero = a.player === h.hero;
            const amt = a.amount ? ` ${fmt(a.amount / bb)}bb` : '';
            const btn = isHero && s !== 'preflop' ? `<button type="button" class="btn small" data-dec="${d++}">Analyze</button>` : '';
            return `<li class="${isHero ? 'hero' : ''}"><span><b>${esc(a.player)}</b> <span class="muted">(${esc(h.positions[a.player] || '?')})</span> ${VERB[a.verb]}${amt}${a.allIn ? ' all-in' : ''}</span>${btn}</li>`;
          })
          .join('')}</ul></div>`;
    })
    .join('');
  const net = heroNet(h);
  const shown = Object.entries(h.shown).filter(([p]) => p !== h.hero);

  out.innerHTML = `
    <div class="row between start">
      <div><span class="eyebrow">${esc(h.site)} · ${fmt(h.sb)}/${fmt(h.bb)} · ${esc(h.date)}</span><h2>Hand ${esc(h.id)}</h2>
      <p class="muted">${esc(h.hero || 'Unknown hero')} in the ${esc(h.positions[h.hero] || '?')} · result <b style="color:var(--${net >= 0 ? 'good' : 'bad'})">${net >= 0 ? '+' : ''}${fmt(net)}bb</b></p></div>
      ${h.heroCards ? cardsHTML(h.heroCards) : ''}
    </div>
    ${
      g
        ? g.spotId
          ? `<div class="feedback ${g.grade}"><div class="head">Preflop: ${GRADE_LABEL[g.grade]}</div>
          <p class="muted">${esc(SPOT[g.spotId].label)} with ${g.cls}: you chose <b>${g.action}</b>, which the chart plays ${pct(g.freq, 0)} of the time.${g.reason ? ' ' + esc(g.reason) : ''}</p>
          ${freqBars(SPOT[g.spotId], g.f)}
          <div class="row"><button type="button" class="btn small" id="hhChart">Open this chart</button></div></div>`
          : `<p class="muted small-text">Preflop: ${esc(g.reason)}</p>`
        : ''
    }
    ${shown.length ? `<p class="small-text">Shown down: ${shown.map(([p, c]) => `<b>${esc(p)}</b> ${c.map(cardToString).join(' ')}`).join(', ')}</p>` : ''}
    <div class="timeline">${timeline}</div>`;

  if (g && g.spotId) $('#hhChart').onclick = () => nav.openRanges(g.spotId, g.cls);
  $$('[data-dec]', out).forEach((b) => {
    b.onclick = () => {
      const dec = decisions[+b.dataset.dec];
      nav.openAnalyzer({ hero: h.heroCards, board: dec.board, pot: dec.potBb, bet: dec.betBb, presetId: preset });
    };
  });
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    runScan(img, file.name || 'Pasted image');
    URL.revokeObjectURL(url);
  };
  img.onerror = () => ($('#scOut').innerHTML = `<p class="err">That file could not be read as an image.</p>`);
  img.src = url;
}

async function runScan(source, label) {
  $('#scOut').innerHTML = `<p class="muted">Scanning…</p>`;
  const t0 = performance.now();
  let res;
  try {
    res = await scanImage(source);
  } catch (e) {
    $('#scOut').innerHTML = `<p class="err">Scan failed: ${esc(e.message)}</p>`;
    return;
  }
  const ms = Math.round(performance.now() - t0);
  const view = $('#scCanvas');
  view.width = res.width;
  view.height = res.height;
  const ctx = view.getContext('2d');
  ctx.drawImage(res.canvas, 0, 0);
  ctx.lineWidth = Math.max(2, res.width / 500);
  ctx.font = `600 ${Math.max(14, res.width / 70)}px "IBM Plex Mono", monospace`;
  for (const c of res.cards) {
    const role = res.hero.includes(c) ? 'hero' : res.board.includes(c) ? 'board' : 'other';
    ctx.strokeStyle = role === 'hero' ? '#f0a030' : role === 'board' ? '#38c172' : '#8a9bb0';
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(cardToString(c.card) + (c.confident ? '' : '?'), c.x, c.y - 6);
  }
  $('#scStage').hidden = false;
  const unsure = res.cards.filter((c) => !c.confident).length;
  const list = (arr) => arr.map((c) => cardToString(c.card)).join(' ');
  $('#scOut').innerHTML = `
    <p class="muted small-text">${esc(label)} · found ${res.cards.length} card${res.cards.length === 1 ? '' : 's'} in ${ms} ms${unsure ? ` · ${unsure} marked “?” need a check` : ''}</p>
    <div class="two">
      <label class="field">Your hand<input type="text" id="scHero" value="${list(res.hero)}" spellcheck="false"></label>
      <label class="field">Board<input type="text" id="scBoard" value="${list(res.board)}" spellcheck="false"></label>
      <label class="field">Pot before the bet (bb)<input type="number" id="scPot" value="10" min="0" step="0.5"></label>
      <label class="field">Bet you faced (bb)<input type="number" id="scBet" value="0" min="0" step="0.5"></label>
    </div>
    ${res.others.length ? `<p class="muted small-text">Other cards seen: ${list(res.others)}</p>` : ''}
    <p class="err" id="scErr"></p>
    <div class="row"><button type="button" class="btn primary" id="scToAnalyzer">Open in analyzer</button></div>`;
}
