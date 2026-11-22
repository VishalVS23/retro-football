/**
 * Generates players from the seeded RNG (same seed = same player, on every device).
 *
 * A player is asked for at a position, age and `quality` (the position rating he should come out
 * at, 1–20). The attributes that matter at his position land around that quality, with some
 * spread so no two players look alike; the rest come from typical ranges (a lineman is slow, a
 * kicker can't tackle). Older players have lost a step physically but make up for it elsewhere.
 */
import {
  ATTRIBUTE_KEYS,
  GROUP_RANGES,
  HIDDEN,
  OFF_POSITION_RANGES,
  POSITION_WEIGHTS,
  attributeGroup,
  type AttributeKey,
  type Attributes,
  type Hidden,
} from './attributes';
import { randomName } from './names';
import { clampAttr, rawPositionRating, type Player } from './player';
import { FAMILIARITY_ORDER, NEIGHBOURS, PEAK_AGE, type Familiarity, type Position } from './positions';
import { rollTraits } from './traits';
import type { Rng } from '../sim/rng';

export interface PlayerSpec {
  id: number;
  position: Position;
  /** The position rating he should come out at (1–20). */
  quality: number;
  age: number;
}

/** Generation tuning (not on-field feel, so it lives here rather than in feel.ts). */
export const GEN = {
  /** Random +/- spread on each attribute that matters at his position. */
  attributeSpread: 2.5,
  /** A less important attribute sits this much lower per weight step below 5. */
  weightDrop: 0.4,
  /** Physical attributes lost per year past his position's peak age (+1). */
  declinePerYear: 0.7,
  /** Young players read the game less well: these "reads" drop this much per year before peak age. */
  rawnessPerYear: 0.45,
  /** Leadership gained per year of age past 26 (veterans lead). */
  leadershipPerYear: 0.3,
  /** Room to grow per year younger than his peak age: up to this much potential. */
  growthPerYear: 0.9,
  /** Chance of a hidden gem with extra potential on top. */
  gemChance: 0.05,
  gemExtra: [1, 3] as [number, number],
  /** Chance of also being able to play a neighbouring position (more with versatility). */
  neighbourBase: 0.25,
  neighbourPerVersatility: 0.5,
};

/** Triangular noise in (-1, 1): mostly near 0, sometimes near the edges. */
const tri = (rng: Rng) => rng.next() + rng.next() - 1;

const DECLINING: readonly AttributeKey[] = ['speed', 'acceleration', 'agility', 'stamina'];
/** Reading the game: still raw in young players (they make up for it physically). */
const READS: readonly AttributeKey[] = ['anticipation', 'decisions', 'composure', 'vision', 'footballIQ', 'concentration'];

function rollHidden(rng: Rng): Hidden {
  const h = {} as Hidden;
  for (const key of HIDDEN) h[key] = clampAttr(10.5 + tri(rng) * 9.5);
  return h;
}

function rollAttributes(rng: Rng, spec: PlayerSpec): Attributes {
  const { position: pos, quality: q, age } = spec;
  const weights = POSITION_WEIGHTS[pos];
  const raw = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key];
    if (w) {
      raw[key] = q - (5 - w) * GEN.weightDrop + tri(rng) * GEN.attributeSpread;
    } else {
      const [lo, hi] = OFF_POSITION_RANGES[pos]?.[key] ?? GROUP_RANGES[attributeGroup(key)];
      raw[key] = lo + rng.next() * (hi - lo);
    }
  }
  // Veterans: slower, but better leaders.
  const pastPeak = age - PEAK_AGE[pos] - 1;
  if (pastPeak > 0) for (const key of DECLINING) raw[key] -= pastPeak * GEN.declinePerYear;
  const yearsToPeak = PEAK_AGE[pos] - age;
  if (yearsToPeak > 0) for (const key of READS) raw[key] -= yearsToPeak * GEN.rawnessPerYear;
  if (!weights.leadership) raw.leadership += (age - 26) * GEN.leadershipPerYear;

  // Nudge the attributes that matter so his rating lands on the quality asked for
  // (an old player who lost speed makes it up in technique and smarts).
  const attrs = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) attrs[key] = clampAttr(raw[key]);
  // A few passes, because rounding and the 1-20 limits eat part of each correction.
  let shift = 0;
  for (let pass = 0; pass < 3; pass++) {
    shift += q - rawPositionRating(attrs, pos);
    for (const key of ATTRIBUTE_KEYS) {
      // Lost speed (veterans) and rawness (youngsters) stay: the rest makes up for them.
      const fixed = (pastPeak > 0 && DECLINING.includes(key)) || (yearsToPeak > 0 && READS.includes(key));
      if (weights[key] && !fixed) attrs[key] = clampAttr(raw[key] + shift);
    }
  }
  return attrs;
}

function rollFamiliarity(rng: Rng, pos: Position, versatility: number): Partial<Record<Position, Familiarity>> {
  const out: Partial<Record<Position, Familiarity>> = {};
  const v = versatility / 20;
  for (const n of NEIGHBOURS[pos]) {
    if (!rng.chance(GEN.neighbourBase + GEN.neighbourPerVersatility * v)) continue;
    const best = FAMILIARITY_ORDER.indexOf(n.best);
    const worst = FAMILIARITY_ORDER.indexOf(n.worst);
    // Versatile players lean toward the best level.
    out[n.pos] = FAMILIARITY_ORDER[Math.round(worst - (worst - best) * Math.min(1, rng.next() * 0.5 + v * 0.8))];
  }
  return out;
}

export function generatePlayer(rng: Rng, spec: PlayerSpec): Player {
  const { firstName, lastName } = randomName(rng);
  const attributes = rollAttributes(rng, spec);
  const hidden = rollHidden(rng);
  const rating = rawPositionRating(attributes, spec.position);
  const yearsToPeak = Math.max(0, PEAK_AGE[spec.position] - spec.age);
  let growth = yearsToPeak * GEN.growthPerYear * rng.next();
  // Hidden gems: only players who haven't reached their peak age yet (always roll, so the dice stay in step).
  const gem = rng.chance(GEN.gemChance);
  if (gem && yearsToPeak > 0) growth += rng.range(GEN.gemExtra[0], GEN.gemExtra[1]);
  const potential = Math.round(Math.min(20, Math.max(rating, rating + growth)) * 10) / 10;
  return {
    id: spec.id,
    firstName,
    lastName,
    age: spec.age,
    position: spec.position,
    attributes,
    hidden,
    potential,
    familiarity: rollFamiliarity(rng, spec.position, hidden.versatility),
    traits: rollTraits(rng, spec.position, attributes, hidden),
  };
}
