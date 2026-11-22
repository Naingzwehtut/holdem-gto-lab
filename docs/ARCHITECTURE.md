# Architecture

Hold'em GTO Lab is a static site written in plain ES modules. There is no framework and no build step: `index.html` loads `src/main.js`, and GitHub Pages serves the repository as is.

```
index.html            page shell and lesson text
src/
  main.js             initialises every view, routes on the URL hash
  styles.css          design tokens (light and dark) and components
  engine/             pure poker logic, runs in the browser and in Node
    cards.js          card encoding and parsing
    evaluator.js      5–7 card hand evaluator
    ranges.js         hand classes, range text parser and compressor
    equity.js         Monte Carlo and exact equity, range breakdown
  data/
    spots.js          preflop charts and range presets
    notes.js          plain-language explanations per hand
  review/
    handHistory.js    PokerStars / GGPoker parser, preflop grading, decisions
    scanner.js        screenshot card recognition
  ui/                 one module per view, plus shared helpers
tests/                node:test suites for engine, data and review code
samples/              anonymised hand histories used by tests and the demo
```

Views never import each other. Each registers what it can open on the shared `nav` object (`src/ui/nav.js`), for example `nav.openAnalyzer(spec)`, so the review page can hand a decision to the analyzer without a dependency cycle.

## Hand evaluator

Cards are integers `rank * 4 + suit`. `evaluate()` builds a rank histogram and per-suit bitmasks in one pass, then checks categories from strongest to weakest. Straights are found by sliding a 5-bit window over the 13-bit rank mask, with a special case for the wheel. The result packs the category into bits 20+ and up to five 4-bit kickers below it, so two hands compare with a single integer comparison. Typical speed is several million 7-card evaluations per second.

## Equity

- **Exact** when every player holds known cards and at most two board cards are missing (at most 990 runouts on the flop).
- **Monte Carlo** otherwise: each trial samples a combo for every range player (weighted, rejecting card collisions), deals the rest of the board, and scores the showdown. 60,000 trials put the standard error near 0.2%.
- **Exact vs range** on the turn and river in the analyzer: every live combo, every river card.

Long simulations yield to the event loop every 3,000 trials and can be cancelled when the input changes.

## Preflop charts

`spots.js` stores each spot as range text with optional weights (`A5s:50`). On load, each of the 169 hand classes gets `[raise, call, fold]` frequencies; overlapping raise and call weights are clipped so they sum to one. The charts approximate published solver solutions for 6-max, 100bb, 2.5bb opens.

## Hand-history import

The parser walks a hand line by line, tracking each player's commitment on the current street and their total investment. That gives the pot and the amount to call before every action, which is all the analyzer needs. Positions come from seat order relative to the button. Preflop grading finds the hero's first decision and maps it to a chart spot: unopened pots use the opening chart, single-raised pots use `<hero>v<opener>`.

## Screenshot scanner

1. Mask bright, low-saturation pixels and label connected regions: candidate card faces.
2. Inside each region, mask "ink" pixels and find glyphs near the top edge. Overlapping hole cards share one white region but each shows its own corner index, so one region can yield several cards. A narrow glyph followed by a matching one is merged into "10".
3. Resample each glyph to 16×24, normalise it, and correlate it with templates rendered from common fonts. The suit comes from the ink colour (four-colour decks make this exact) and, for red and black, from matching the suit glyph's shape.
4. Rows of cards are grouped by height: the row of 3–5 nearest the middle is the board, the lowest pair is the hero.

The scanner reads uploaded still images only. It has no screen-capture code by design.
