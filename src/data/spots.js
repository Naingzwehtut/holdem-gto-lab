/**
 * Preflop strategy baselines for 6-max cash, 100bb deep, 2.5bb opens.
 *
 * These are simplified approximations of published solver solutions, not raw
 * solver output. `raise` is the open (first in) or the 3-bet; `call` is the
 * flat; anything left over folds. A weight such as `A5s:50` means "50% of the time".
 */
import { HAND_CLASSES, parseRange } from '../engine/ranges.js';

export const SPOTS = [
  {
    id: 'UTG',
    group: 'open',
    label: 'UTG open',
    hero: 'UTG',
    raise: '55+,A2s+,K8s+,Q9s+,J9s+,T9s,T8s:50,98s,87s:50,76s:50,65s:50,ATo+,KJo+,QJo:50',
    call: '',
  },
  {
    id: 'HJ',
    group: 'open',
    label: 'HJ open',
    hero: 'HJ',
    raise: '44+,33:50,A2s+,K7s+,Q9s+,J9s+,T8s+,98s,87s,76s,65s:50,ATo+,KJo+,QJo,KTo:50',
    call: '',
  },
  {
    id: 'CO',
    group: 'open',
    label: 'CO open',
    hero: 'CO',
    raise: '22+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,65s,54s,A8o+,A5o:50,KTo+,QTo+,JTo',
    call: '',
  },
  {
    id: 'BTN',
    group: 'open',
    label: 'BTN open',
    hero: 'BTN',
    raise: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s:50,A2o+,K8o+,Q9o+,J9o+,T8o+,98o,87o:50',
    call: '',
  },
  {
    id: 'SB',
    group: 'open',
    label: 'SB open',
    hero: 'SB',
    raise: '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,86s+,75s+,65s,54s,A2o+,K9o+,QTo+,JTo',
    call: '',
  },
  {
    id: 'BBvUTG',
    group: 'vs',
    label: 'BB vs UTG',
    hero: 'BB',
    vs: 'UTG',
    raise: 'QQ+,AKs,AKo,A5s:50,A4s:50,KQs:30,76s:20,65s:20',
    call: 'JJ-22,AQs-A2s,KJs-K6s,KQs,QTs+,Q9s,J9s+,T8s+,97s+,86s+,75s+,64s+,54s,AQo-ATo,KQo,KJo,QJo',
  },
  {
    id: 'BBvCO',
    group: 'vs',
    label: 'BB vs CO',
    hero: 'BB',
    vs: 'CO',
    raise: 'TT+,AQs+,AKo,AQo:50,A5s,A4s,KJs:50,K9s:50,Q9s:50,J9s:50,T8s:50,87s:50,76s:50,65s:50',
    call: '99-22,AJs-A6s,A3s,A2s,KQs,KJs,KTs,K9s,K8s-K4s,QTs+,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,T7s,97s+,86s+,75s+,64s+,53s+,AQo,AJo-A8o,KTo+,QTo+,JTo,T9o',
  },
  {
    id: 'BBvBTN',
    group: 'vs',
    label: 'BB vs BTN',
    hero: 'BB',
    vs: 'BTN',
    raise: '99+,ATs+,A5s-A2s,KTs+,QJs,K5s:50,Q8s:50,J8s:50,T8s:50,97s:50,86s:50,75s:50,64s:50,AJo+,KQo:50',
    call: '88-22,A9s-A6s,K9s-K2s,QTs-Q2s,JTs,J9s-J4s,T6s+,96s+,85s+,74s+,63s+,53s+,42s+,32s,ATo-A2o,KQo,KJo-K5o,QJo-Q8o,JTo-J8o,T9o-T7o,98o,97o,87o,86o,76o,65o',
  },
  {
    id: 'BBvSB',
    group: 'vs',
    label: 'BB vs SB',
    hero: 'BB',
    vs: 'SB',
    open: '3bb',
    raise: '88+,ATs+,A5s-A2s:50,KTs+,QTs+,K8s:50,J9s:50,T8s:50,AJo+,KQo',
    call: '77-22,A9s-A2s,K9s-K2s,Q9s-Q2s,JTs-J4s,T9s-T6s,96s+,85s+,74s+,63s+,52s+,42s+,32s,ATo-A2o,KJo-K2o,QJo-Q5o,JTo-J7o,T9o-T7o,97o+,86o+,76o,75o,65o,54o',
  },
  {
    id: 'SBvBTN',
    group: 'vs',
    label: 'SB vs BTN',
    hero: 'SB',
    vs: 'BTN',
    raise: '77+,A8s+,A5s-A3s,KTs+,K9s:50,QTs+,JTs,T9s,98s:50,87s:50,ATo+,KQo,KJo:50',
    call: '',
  },
  {
    id: 'BTNvCO',
    group: 'vs',
    label: 'BTN vs CO',
    hero: 'BTN',
    vs: 'CO',
    raise: 'TT+,AJs+,A5s,A4s,KQs,K9s:50,Q9s:50,J9s:50,AQo+,KJo:30',
    call: '99-22,ATs-A6s,KJs,KTs,QTs+,JTs,T9s,98s,87s,76s,65s,AJo,KQo',
  },
  {
    id: 'COvHJ',
    group: 'vs',
    label: 'CO vs HJ',
    hero: 'CO',
    vs: 'HJ',
    raise: 'TT+,AJs+,A5s,A4s:50,KQs,KJs:50,AQo+',
    call: '99-44,ATs-A8s,KTs+,QTs+,JTs,T9s,98s:50,AJo:50,KQo:50',
  },
];

/** Spots by id, each with `fr[handClass] = [raise, call, fold]` frequencies. */
export const SPOT = {};
for (const s of SPOTS) {
  const rmap = parseRange(s.raise).map;
  const cmap = parseRange(s.call).map;
  s.fr = {};
  s.raiseEff = new Map();
  s.callEff = new Map();
  for (const cls of HAND_CLASSES) {
    const r = rmap.get(cls) || 0;
    let c = cmap.get(cls) || 0;
    if (r + c > 1) c = 1 - r;
    s.fr[cls] = [r, c, Math.max(0, 1 - r - c)];
    if (r > 0) s.raiseEff.set(cls, r);
    if (c > 0) s.callEff.set(cls, c);
  }
  s.raiseName = s.group === 'open' ? 'Raise' : '3-bet';
  SPOT[s.id] = s;
}

/** Ranges offered in range pickers across the app. */
export const PRESETS = [];
for (const s of SPOTS) {
  if (s.group === 'open') PRESETS.push({ id: 'open-' + s.id, label: `${s.hero} opening range`, map: s.raiseEff });
}
for (const s of SPOTS) {
  if (s.group !== 'vs') continue;
  if (s.callEff.size) PRESETS.push({ id: 'call-' + s.id, label: `${s.hero} calls vs ${s.vs} open`, map: s.callEff });
  PRESETS.push({ id: '3b-' + s.id, label: `${s.hero} 3-bets vs ${s.vs}`, map: s.raiseEff });
}
PRESETS.push({ id: 'prem', label: 'Premiums (QQ+, AK)', map: parseRange('QQ+,AK').map });
PRESETS.push({ id: 'any', label: 'Any two cards', map: parseRange('any').map });

export const presetById = (id) => PRESETS.find((p) => p.id === id);

export function describeSpot(s) {
  if (s.group === 'open') {
    return s.hero === 'SB'
      ? 'Folded to you in the small blind. Raise or fold against the big blind.'
      : `Folded to you in the ${s.hero}. Open to 2.5bb or fold.`;
  }
  return `${s.vs} opens to ${s.open || '2.5bb'}, everyone else folds, and you're in the ${s.hero}.`;
}
