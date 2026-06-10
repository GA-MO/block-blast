/** All scoring tunables live here so balancing is a single file. */
export const SCORING = {
  perCell: 2, // points per placed cell
  perLine: 30, // base per cleared line
  multiLineBonusPerLine: 20, // extra per line when >1 line clears at once
  comboBonusPerStreak: 15, // extra per combo streak step (streak-1)
  perfectClearBonus: 400, // board fully emptied after a clear
  perExplodedCell: 10, // bonus per cell destroyed by a bomb
  chainBonusPerCell: 12, // extra per exploded cell beyond one bomb's worth (chain reaction)
  feverThreshold: 3, // combo streak at which FEVER kicks in
  feverMultiplier: 2, // clear-score multiplier while in fever
  chargeLines: 6, // lines cleared to charge one Power Block (Rush uses 4)
} as const;

/** Score multiplier for the given combo streak (FEVER at 3+ consecutive clears). */
export function feverMultiplier(combo: number): number {
  return combo >= SCORING.feverThreshold ? SCORING.feverMultiplier : 1;
}

/** One bomb covers up to 9 cells; anything beyond that is a chain reaction and
 *  earns an escalating bonus on top of the per-cell score. */
export function explosionScore(explodedCount: number): number {
  if (explodedCount <= 0) return 0;
  let score = explodedCount * SCORING.perExplodedCell;
  if (explodedCount > 9) score += (explodedCount - 9) * SCORING.chainBonusPerCell;
  return score;
}

export function placementScore(cellCount: number): number {
  return cellCount * SCORING.perCell;
}

/**
 * Score for a clear event.
 * @param lines total rows+cols cleared simultaneously
 * @param combo  current combo streak (1 = first clear in a run of clears)
 * @param perfectClear board became fully empty
 */
export function clearScore(lines: number, combo: number, perfectClear: boolean): number {
  if (lines <= 0) return 0;
  let score = lines * SCORING.perLine;
  if (lines > 1) score += lines * SCORING.multiLineBonusPerLine;
  if (combo > 1) score += (combo - 1) * SCORING.comboBonusPerStreak;
  if (perfectClear) score += SCORING.perfectClearBonus;
  return score;
}
