/**
 * Player traits / tendencies shown on the profile. They don't change play yet: Stage 3 steps
 * 3d-3e (and later stages) give each one its effect. A player has at most MAX_TRAITS.
 */
import type { Attributes, Hidden } from './attributes';
import type { Position } from './positions';
import type { Rng } from '../sim/rng';

export type TraitId =
  | 'tightWindows'
  | 'checksDown'
  | 'extraYards'
  | 'runsOutOfBounds'
  | 'contestedCatches'
  | 'gamblesOnPicks'
  | 'bigHitter'
  | 'goesForStrip'
  | 'jumpsSnap'
  | 'playsThroughInjury'
  | 'mauler'
  | 'iceVeins';

export const MAX_TRAITS = 2;

interface TraitDef {
  label: string;
  positions: readonly Position[] | 'all';
  /** Chance this player has it (0..1), from his attributes. */
  chance: (a: Attributes, h: Hidden) => number;
}

/** 0 at `from`, 1 at `to` (clamped): how far an attribute is into "notable" territory. */
const ramp = (v: number, from: number, to: number) => Math.min(1, Math.max(0, (v - from) / (to - from)));

export const TRAITS: Record<TraitId, TraitDef> = {
  tightWindows: { label: 'Throws into tight windows', positions: ['QB'], chance: (a) => 0.05 + 0.35 * ramp(a.aggression, 11, 18) },
  checksDown: { label: 'Likes to check down', positions: ['QB'], chance: (a) => 0.05 + 0.35 * ramp(12 - a.aggression, 0, 6) },
  extraYards: {
    label: 'Fights for extra yards',
    positions: ['RB', 'WR', 'TE'],
    chance: (a) => 0.03 + 0.4 * ramp((a.strength + a.bravery) / 2, 11, 17),
  },
  runsOutOfBounds: { label: 'Runs out of bounds to avoid hits', positions: ['RB', 'WR'], chance: (a) => 0.3 * ramp(10 - a.bravery, 0, 6) },
  contestedCatches: {
    label: 'Wins contested catches',
    positions: ['WR', 'TE'],
    chance: (a) => 0.02 + 0.45 * ramp((a.jumping + a.hands) / 2, 12, 18),
  },
  gamblesOnPicks: {
    label: 'Gambles on interceptions',
    positions: ['CB', 'S', 'LB'],
    chance: (a) => 0.03 + 0.35 * ramp((a.aggression + a.anticipation) / 2, 11, 17),
  },
  bigHitter: { label: 'Big hitter', positions: ['LB', 'S', 'DL'], chance: (a) => 0.02 + 0.4 * ramp((a.aggression + a.strength) / 2, 12, 18) },
  goesForStrip: { label: 'Goes for the strip', positions: ['LB', 'DL', 'S', 'CB'], chance: (a) => 0.03 + 0.2 * ramp(a.aggression, 12, 18) },
  jumpsSnap: { label: 'Tries to jump the snap', positions: ['DL'], chance: (a) => 0.25 * ramp(a.aggression - a.concentration, 0, 8) },
  mauler: { label: 'Mauler (finishes blocks)', positions: ['OL', 'TE'], chance: (a) => 0.03 + 0.35 * ramp((a.runBlocking + a.aggression) / 2, 11, 17) },
  iceVeins: { label: 'Ice in his veins', positions: ['K', 'P'], chance: (a) => 0.03 + 0.4 * ramp((a.composure + a.concentration) / 2, 12, 17) },
  playsThroughInjury: {
    label: 'Plays through injuries',
    positions: 'all',
    chance: (a, h) => 0.02 + 0.2 * ramp(a.bravery, 13, 19) * ramp(20 - h.injuryProneness, 8, 16),
  },
};

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** Traits that contradict each other: a player never has both. */
export const TRAIT_CONFLICTS: readonly [TraitId, TraitId][] = [
  ['tightWindows', 'checksDown'],
  ['extraYards', 'runsOutOfBounds'],
];

const conflicts = (id: TraitId, have: TraitId[]) => TRAIT_CONFLICTS.some(([x, y]) => (x === id && have.includes(y)) || (y === id && have.includes(x)));

/** Rolls each trait his position allows; keeps at most MAX_TRAITS (in roll order), never two that clash. */
export function rollTraits(rng: Rng, position: Position, a: Attributes, h: Hidden): TraitId[] {
  const out: TraitId[] = [];
  for (const id of TRAIT_IDS) {
    const t = TRAITS[id];
    if (t.positions !== 'all' && !t.positions.includes(position)) continue;
    // Always roll (even when full) so one trait's roll never shifts the dice for the rest.
    const hit = rng.chance(t.chance(a, h));
    if (hit && out.length < MAX_TRAITS && !conflicts(id, out)) out.push(id);
  }
  return out;
}
