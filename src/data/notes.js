/**
 * Plain-language reasons behind a hand's preflop strategy.
 */
import { RANKS } from '../engine/cards.js';

export function handNotes(cls, spot) {
  const f = spot.fr[cls];
  const hi = RANKS.indexOf(cls[0]);
  const lo = RANKS.indexOf(cls[1]);
  const pair = cls.length === 2;
  const suited = cls[2] === 's';
  const gap = hi - lo;
  const notes = [];
  const mixed = f.filter((x) => x > 0.05).length > 1;

  if (pair) {
    if (hi >= 10) notes.push('Premium pair. It wants to build the pot and is happy to get stacks in.');
    else if (hi >= 6)
      notes.push('Medium pair. Strong preflop, but most flops bring an overcard, so it plays best as a call or a small-pot hand.');
    else
      notes.push(
        'Small pair. Its value comes mostly from flopping a set, which happens about 12% of the time, so it needs a good price or position.',
      );
  } else {
    if (suited) notes.push('Suited, which adds roughly 2–3% equity and the chance of a disguised flush.');
    if (gap === 1) notes.push('Connected, so it makes the most possible straights.');
    else if (gap === 2) notes.push('One-gapper: fewer straights than a connector, still decent playability.');
    if (hi === 12 && lo <= 3 && suited) {
      notes.push(
        'The ace blocks AA and AK, the hands most likely to 4-bet. With wheel straights and nut-flush draws as backup, this is a classic 3-bet bluff.',
      );
    } else if (hi === 12 && !suited && lo <= 7) {
      notes.push("Weak offsuit ace. When it hits the ace it is often outkicked by better aces in the opponent's range.");
    }
    if (!suited && gap >= 4 && hi < 12) notes.push('Offsuit and disconnected, so it rarely makes strong hands and is often dominated.');
    if (hi >= 10 && lo >= 9) notes.push('Two broadway cards. It makes top pair with a good kicker often.');
  }

  if (mixed)
    notes.push(
      'Mixed strategy: the solver earns about the same with each option here, so it splits between them. Either choice costs very little.',
    );
  else if (f[2] >= 0.999 && spot.group === 'vs')
    notes.push('Pure fold. It does not have enough equity or playability to continue against this range.');
  else if (f[2] >= 0.999) notes.push('Pure fold from this seat. Too many players are left to act, or it plays too poorly after the flop.');

  if (spot.group === 'vs' && spot.hero === 'BB' && f[1] > 0.4) {
    notes.push('The big blind already has 1bb invested, so it gets a good price and defends many hands that would fold elsewhere.');
  }
  if (spot.group === 'vs' && !spot.callEff.size && f[0] > 0) {
    notes.push(
      'From the small blind the solver mostly plays 3-bet or fold, because calling invites the big blind to squeeze and leaves you out of position.',
    );
  }
  return notes;
}
