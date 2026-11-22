/**
 * Cross-view navigation. Each view registers what it can open, so views can
 * hand work to each other without importing one another.
 */
export const nav = {
  /** @type {(players: object[], board?: (number|null)[]) => void} */
  openEquity: () => {},
  /** @type {(spec: { hero: number[], board: number[], pot: number, bet: number, presetId?: string }) => void} */
  openAnalyzer: () => {},
  /** @type {(spotId: string, handClass: string) => void} */
  openRanges: () => {},
  /** @type {(spotId: string) => void} */
  openDrill: () => {},
};

export const go = (view) => {
  if (location.hash.slice(1) !== view) location.hash = view;
};
