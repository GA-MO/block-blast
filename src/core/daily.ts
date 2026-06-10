import { Rng, dateSeed } from "./rng";
import type { LevelPreset } from "./gameModel";

/** A daily challenge descriptor: a stable date key and a deterministic seed. */
export interface DailyChallenge {
  readonly dateKey: string;
  readonly seed: number;
}

/** The day's board modifier, for HUD copy ("Frost Day" etc.). */
export type DailyModifier = "pure" | "ice" | "bombs";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * "YYYY-MM-DD" for the given date, using local date parts (zero-padded).
 * Pure: depends only on the supplied Date.
 */
export function todayKey(d: Date): string {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Deterministic 32-bit-ish seed derived from the date's calendar parts.
 * Pure: no Date.now(); same date always yields the same seed.
 */
export function dailySeedFor(d: Date): number {
  // dateSeed produces YYYYMMDD; mix it so consecutive days differ widely
  // while staying within a 32-bit unsigned range.
  const base = dateSeed(d);
  let h = base >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** Build the daily challenge descriptor for the given date. */
export function dailyChallenge(d: Date): DailyChallenge {
  return {
    dateKey: todayKey(d),
    seed: dailySeedFor(d),
  };
}

/** Which modifier the given seed's day plays under. */
export function dailyModifier(seed: number): DailyModifier {
  const kind = new Rng(seed ^ 0x5f3759df).int(3);
  return kind === 0 ? "pure" : kind === 1 ? "ice" : "bombs";
}

/**
 * Deterministic board modifier for the day, so each Daily feels distinct:
 * a clean board, a scatter of 2-hit ice tiles, or a few bombs to set off.
 * Cells are sparse singles in the middle rows — never an unsolvable layout.
 * Pure: same seed always yields the same preset (cross-device fairness).
 */
export function dailyPreset(seed: number): LevelPreset {
  const rng = new Rng(seed ^ 0x5f3759df);
  const kind = rng.int(3);
  if (kind === 0) return {};
  const used = new Set<string>();
  const spots: [number, number][] = [];
  const want = kind === 1 ? 3 + rng.int(3) : 2 + rng.int(2); // ice 3–5, bombs 2–3
  while (spots.length < want) {
    const r = 2 + rng.int(5); // rows 2..6 — keep top/bottom open
    const c = rng.int(8);
    const key = `${r},${c}`;
    if (used.has(key)) continue;
    used.add(key);
    spots.push([r, c]);
  }
  if (kind === 1) return { ice: spots.map(([r, c]) => [r, c, 4] as [number, number, number]) };
  return { bombs: spots.map(([r, c]) => [r, c, 0] as [number, number, number]) };
}
