/**
 * How players are shown on screen (Stage 3c): stars, colour bands, short labels, each position's
 * key ratings, and the rough potential guess. Pure logic, no DOM.
 */
import { POSITION_WEIGHTS, type AttributeKey } from './attributes';
import { currentAbility, type Player } from './player';
import { FAMILIARITY_ORDER, POSITIONS, type Familiarity, type Position } from './positions';

/** 1-5 stars for a rating on the 1-20 scale (a typical starter is 3). */
export function stars(rating: number): number {
  if (rating >= 15) return 5;
  if (rating >= 13) return 4;
  if (rating >= 10.5) return 3;
  if (rating >= 8.5) return 2;
  return 1;
}

export type Band = 'poor' | 'weak' | 'ok' | 'good' | 'great';

/** Colour band for one attribute (1-20), Football Manager style: red ... green. */
export function band(v: number): Band {
  if (v >= 17) return 'great';
  if (v >= 14) return 'good';
  if (v >= 10) return 'ok';
  if (v >= 6) return 'weak';
  return 'poor';
}

/** Three-letter labels for tight spaces (roster cards). */
export const ATTR_SHORT: Record<AttributeKey, string> = {
  throwPower: 'ARM',
  shortAccuracy: 'SAC',
  mediumAccuracy: 'MAC',
  deepAccuracy: 'DAC',
  release: 'REL',
  routeRunning: 'RTE',
  hands: 'HND',
  ballSecurity: 'BSC',
  runBlocking: 'RBK',
  passBlocking: 'PBK',
  passRush: 'RSH',
  blockShedding: 'SHD',
  tackling: 'TKL',
  manCoverage: 'MAN',
  zoneCoverage: 'ZON',
  ballSkills: 'BSK',
  kickPower: 'KPW',
  kickAccuracy: 'KAC',
  vision: 'VIS',
  decisions: 'DEC',
  composure: 'CMP',
  anticipation: 'ANT',
  workRate: 'WRK',
  leadership: 'LDR',
  footballIQ: 'FIQ',
  aggression: 'AGG',
  bravery: 'BRV',
  concentration: 'CON',
  speed: 'SPD',
  acceleration: 'ACL',
  agility: 'AGI',
  strength: 'STR',
  stamina: 'STA',
  jumping: 'JMP',
  naturalFitness: 'FIT',
};

/** The three ratings shown on a roster card for each position. */
export const CARD_ATTRS: Record<Position, [AttributeKey, AttributeKey, AttributeKey]> = {
  QB: ['throwPower', 'mediumAccuracy', 'decisions'],
  RB: ['speed', 'agility', 'ballSecurity'],
  TE: ['hands', 'runBlocking', 'speed'],
  WR: ['speed', 'routeRunning', 'hands'],
  OL: ['passBlocking', 'runBlocking', 'strength'],
  DL: ['passRush', 'blockShedding', 'strength'],
  LB: ['tackling', 'anticipation', 'speed'],
  CB: ['manCoverage', 'speed', 'ballSkills'],
  S: ['zoneCoverage', 'tackling', 'speed'],
  K: ['kickPower', 'kickAccuracy', 'composure'],
  P: ['kickPower', 'kickAccuracy', 'composure'],
};

/** Every attribute that counts at a position, most important first (ties keep the list order). */
export function keyAttributes(pos: Position): AttributeKey[] {
  return (Object.entries(POSITION_WEIGHTS[pos]) as [AttributeKey, number][]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** Small whole-number hash of a player id, so his guess is the same every time it's shown. */
const idHash = (id: number) => Math.abs(Math.imul(id + 1, 2654435761) >> 7);

/**
 * A rough guess at a player's potential, in stars (low-high). Not the hidden number: a range that
 * contains it, never below his current stars, and the same each time. Stage 8 makes it depend on
 * the staff's judging ability.
 */
export function potentialGuess(p: Player): [number, number] {
  const now = stars(currentAbility(p));
  const truth = stars(p.potential);
  const h = idHash(p.id);
  const lo = Math.max(now, truth - (h & 1));
  const hi = Math.min(5, truth + ((h >> 1) & 1));
  return [lo, Math.max(lo, hi)];
}

export function potentialText(p: Player): string {
  const [lo, hi] = potentialGuess(p);
  return lo === hi ? `${lo} star${lo === 1 ? '' : 's'}` : `${lo}-${hi} stars`;
}

/** Positions he can also play (not awkward), best first. */
export function otherPositions(p: Player): { pos: Position; level: Familiarity }[] {
  return POSITIONS.filter((pos) => pos !== p.position && p.familiarity[pos])
    .map((pos) => ({ pos, level: p.familiarity[pos]! }))
    .sort((a, b) => FAMILIARITY_ORDER.indexOf(a.level) - FAMILIARITY_ORDER.indexOf(b.level));
}

/** Which side of the ball a position is on (roster filters). */
export function unitOf(pos: Position): 'offense' | 'defense' | 'special' {
  if (pos === 'K' || pos === 'P') return 'special';
  return ['QB', 'RB', 'TE', 'WR', 'OL'].includes(pos) ? 'offense' : 'defense';
}
