/**
 * A player (Stage 3a). Pure data + rules, no Phaser.
 *
 * Current ability isn't stored: it's the position rating, worked out from his attributes, so it
 * can never disagree with them. Potential IS stored (hidden: the user only sees staff estimates).
 * Contracts, morale, injuries, fatigue and stats arrive in later stages, each with a save migration.
 */
import { ATTR_MAX, ATTR_MIN, POSITION_WEIGHTS, type AttributeKey, type Attributes, type Hidden } from './attributes';
import { FAMILIARITY_RATIO, type Familiarity, type Position } from './positions';
import { personality, type Personality } from './personality';
import type { TraitId } from './traits';
import type { Contract } from '../finance/contracts';

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  /** His main (natural) position. */
  position: Position;
  attributes: Attributes;
  /** Never shown as numbers. */
  hidden: Hidden;
  /** The best position rating he could ever reach (1–20). Hidden. */
  potential: number;
  /** Other positions he can play; anything missing is 'awkward'. His own is always 'natural'. */
  familiarity: Partial<Record<Position, Familiarity>>;
  traits: TraitId[];
  /** 6a: his contract (none = a free agent, or a stand-in). */
  contract?: Contract;
}

export const clampAttr = (v: number) => Math.min(ATTR_MAX, Math.max(ATTR_MIN, Math.round(v)));

/** Weighted average of the attributes that matter at a position (1–20), ignoring familiarity. */
export function rawPositionRating(a: Attributes, pos: Position): number {
  const weights = POSITION_WEIGHTS[pos];
  let sum = 0;
  let total = 0;
  for (const [key, w] of Object.entries(weights) as [AttributeKey, number][]) {
    sum += a[key] * w;
    total += w;
  }
  return total > 0 ? sum / total : ATTR_MIN;
}

export function familiarityAt(p: Player, pos: Position): Familiarity {
  if (pos === p.position) return 'natural';
  return p.familiarity[pos] ?? 'awkward';
}

/** How good he is at a position (1–20, one decimal), lowered when it isn't his natural one. */
export function positionRating(p: Player, pos: Position = p.position): number {
  const r = rawPositionRating(p.attributes, pos) * FAMILIARITY_RATIO[familiarityAt(p, pos)];
  return Math.round(Math.max(ATTR_MIN, r) * 10) / 10;
}

/** Current ability = his rating at his natural position. */
export function currentAbility(p: Player): number {
  return positionRating(p);
}

export function playerPersonality(p: Player): Personality {
  return personality(p.hidden, p.attributes);
}

export function fullName(p: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`;
}

/** e.g. "J. Hartley" for tight spaces (scoreboard, depth chart). */
export function shortName(p: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${p.firstName[0]}. ${p.lastName}`;
}

/**
 * Words for a rating on the 1–20 scale. Staff estimates of potential use the same words
 * (Stage 3c shows them; Stage 8 makes them only as good as the staff).
 */
export function ratingWords(r: number): string {
  if (r >= 17) return 'Elite';
  if (r >= 15) return 'Star';
  if (r >= 13) return 'Solid starter';
  if (r >= 11) return 'Starter';
  if (r >= 9) return 'Backup';
  return 'Fringe';
}
