/** Deterministic seeded PRNG (mulberry32). Used for Daily/Adventure modes. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // ensure non-zero 32-bit state
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Pick a random element. */
  pick<T>(arr: ReadonlyArray<T>): T {
    return arr[this.int(arr.length)];
  }
}

/** Seed derived from a calendar date (YYYYMMDD) for Daily puzzles. */
export function dateSeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** A non-deterministic RNG backed by Math.random, same interface. */
export class SystemRng extends Rng {
  constructor() {
    super(1);
  }
  override next(): number {
    return Math.random();
  }
}
