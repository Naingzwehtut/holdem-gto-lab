# Contributing to Hold'em GTO Lab

Thanks for helping. Bug reports, new charts, new hand-history formats, translations and UI fixes are all welcome.

## Getting started

```bash
git clone https://github.com/Naingzwehtut/holdem-gto-lab.git
cd holdem-gto-lab
npm install      # dev tools only: ESLint and Prettier
npm start        # http://localhost:5173
```

The app has no build step. Edit a file under `src/`, refresh the browser, and you see the change.

## Before you open a pull request

```bash
npm run check    # lint + tests
npm run format   # Prettier
```

- Keep the engine (`src/engine`, `src/review`, `src/data`) free of DOM code so it stays testable in Node.
- Add a test in `tests/` for any change to the evaluator, equity, range parsing or hand-history parsing.
- New hand-history formats: add an anonymised sample to `samples/` and a test that parses it.
- Chart changes: say where the numbers come from (solver, stack depth, rake, open size) in the PR.

## Good first issues

- Hand-history support for another site (Winamax, iPoker, 888, ACR).
- More preflop spots (3-bet pots, 4-bet ranges, 40bb and 200bb stacks).
- Translations of the lessons.
- Better screenshot scanning for a specific client's card style.

## Ground rules

This project is for study and post-session review. Pull requests that add real-time assistance during live play will be closed: no screen capture of running poker clients, no table overlays, no HUD-style live advice. See [Responsible use](README.md#responsible-use).

By contributing you agree that your work is released under the [MIT License](LICENSE) and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
