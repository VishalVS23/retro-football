/**
 * Seeded random number generator (mulberry32).
 * Same seed => same sequence, every time, on every device. ALL game randomness
 * must come from here (never Math.random) so bugs and balance runs can be replayed.
 * Its whole state is one 32-bit number, so it can be saved and resumed exactly.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with the given probability (0..1). */
  chance(p: number): boolean;
  /** A random element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Current internal state, for saving. */
  getState(): number;
  /** Restore a state from getState(). */
  setState(state: number): void;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() needs a non-empty array');
      return items[Math.floor(next() * items.length)];
    },
    getState: () => state,
    setState: (s) => {
      state = s >>> 0;
    },
  };
}

/** A fresh seed for a brand-new save (the only place non-seeded randomness is allowed). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
