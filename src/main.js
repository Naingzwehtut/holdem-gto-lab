/** App entry: initialise every view once, then show the one named in the URL hash. */
import * as ranges from './ui/rangesView.js';
import * as analyzer from './ui/analyzerView.js';
import * as equity from './ui/equityView.js';
import * as review from './ui/reviewView.js';
import * as practice from './ui/practiceView.js';
import * as learn from './ui/learnView.js';

const VIEWS = { ranges, analyzer, equity, review, practice, learn };
let current = null;

for (const view of Object.values(VIEWS)) view.init();

function route() {
  const name = Object.hasOwn(VIEWS, location.hash.slice(1)) ? location.hash.slice(1) : 'ranges';
  for (const key of Object.keys(VIEWS)) document.getElementById('v-' + key).hidden = key !== name;
  document.querySelectorAll('nav.tabs a').forEach((a) => {
    if (a.getAttribute('href') === '#' + name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (current !== name) window.scrollTo(0, 0);
  current = name;
  VIEWS[name].show();
}

window.addEventListener('hashchange', route);
route();
