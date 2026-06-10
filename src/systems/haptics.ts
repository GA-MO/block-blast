import { Settings } from "./settings";

/** Thin wrapper over the Vibration API, gated by the user's haptics setting. */
function vibrate(pattern: number | number[]): void {
  if (!Settings.haptics) return;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported — ignore */
    }
  }
}

export const Haptics = {
  /** Light tap when a piece locks into the board. */
  place(): void {
    vibrate(12);
  },
  /** A clear happened — strength scales with how many lines cleared. */
  clear(lines: number): void {
    vibrate(Math.min(40, 18 + lines * 8));
  },
  /** Big combo / perfect clear. */
  big(): void {
    vibrate([0, 30, 40, 30]);
  },
  /** Game over thud. */
  gameOver(): void {
    vibrate([0, 60, 50, 60]);
  },
};
