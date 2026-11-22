/**
 * Player attributes on the 1–20 scale (Football Manager style), grouped as in the brief, plus the
 * hidden attributes the player never sees directly. Pure data, no Phaser.
 */
import type { Position } from './positions';

export const TECHNICAL = [
  'throwPower',
  'shortAccuracy',
  'mediumAccuracy',
  'deepAccuracy',
  'release',
  'routeRunning',
  'hands',
  'ballSecurity',
  'runBlocking',
  'passBlocking',
  'passRush',
  'blockShedding',
  'tackling',
  'manCoverage',
  'zoneCoverage',
  'ballSkills',
  'kickPower',
  'kickAccuracy',
] as const;

export const MENTAL = [
  'vision',
  'decisions',
  'composure',
  'anticipation',
  'workRate',
  'leadership',
  'footballIQ',
  'aggression',
  'bravery',
  'concentration',
] as const;

export const PHYSICAL = ['speed', 'acceleration', 'agility', 'strength', 'stamina', 'jumping', 'naturalFitness'] as const;

/** Never shown as numbers: only hinted at through personality, reports and behaviour. */
export const HIDDEN = [
  'consistency',
  'injuryProneness',
  'bigGames',
  'professionalism',
  'ambition',
  'loyalty',
  'pressure',
  'temperament',
  'adaptability',
  'versatility',
] as const;

export type TechnicalKey = (typeof TECHNICAL)[number];
export type MentalKey = (typeof MENTAL)[number];
export type PhysicalKey = (typeof PHYSICAL)[number];
export type AttributeKey = TechnicalKey | MentalKey | PhysicalKey;
export type HiddenKey = (typeof HIDDEN)[number];

export type Attributes = Record<AttributeKey, number>;
export type Hidden = Record<HiddenKey, number>;

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL];

export const ATTR_MIN = 1;
export const ATTR_MAX = 20;

export const ATTRIBUTE_NAMES: Record<AttributeKey | HiddenKey, string> = {
  throwPower: 'Throwing power',
  shortAccuracy: 'Short accuracy',
  mediumAccuracy: 'Medium accuracy',
  deepAccuracy: 'Deep accuracy',
  release: 'Release',
  routeRunning: 'Route running',
  hands: 'Hands',
  ballSecurity: 'Ball security',
  runBlocking: 'Run blocking',
  passBlocking: 'Pass blocking',
  passRush: 'Pass rush moves',
  blockShedding: 'Block shedding',
  tackling: 'Tackling',
  manCoverage: 'Man coverage',
  zoneCoverage: 'Zone coverage',
  ballSkills: 'Ball skills',
  kickPower: 'Kicking power',
  kickAccuracy: 'Kicking accuracy',
  vision: 'Vision',
  decisions: 'Decisions',
  composure: 'Composure',
  anticipation: 'Anticipation',
  workRate: 'Work rate',
  leadership: 'Leadership',
  footballIQ: 'Football IQ',
  aggression: 'Aggression',
  bravery: 'Bravery',
  concentration: 'Concentration',
  speed: 'Speed',
  acceleration: 'Acceleration',
  agility: 'Agility',
  strength: 'Strength',
  stamina: 'Stamina',
  jumping: 'Jumping',
  naturalFitness: 'Natural fitness',
  consistency: 'Consistency',
  injuryProneness: 'Injury proneness',
  bigGames: 'Big games',
  professionalism: 'Professionalism',
  ambition: 'Ambition',
  loyalty: 'Loyalty',
  pressure: 'Pressure',
  temperament: 'Temperament',
  adaptability: 'Adaptability',
  versatility: 'Versatility',
};

/**
 * How much each attribute matters at each position (1 = a little ... 5 = everything).
 * The position rating (current ability) is the weighted average of these attributes.
 * Attributes not listed don't count at that position.
 */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  QB: {
    throwPower: 4,
    shortAccuracy: 4,
    mediumAccuracy: 4,
    deepAccuracy: 3,
    release: 3,
    decisions: 4,
    vision: 3,
    composure: 3,
    anticipation: 2,
    footballIQ: 2,
    ballSecurity: 1,
    agility: 1,
    speed: 1,
  },
  RB: { speed: 4, acceleration: 4, agility: 4, vision: 3, ballSecurity: 3, strength: 2, hands: 1, routeRunning: 1, passBlocking: 1, bravery: 1, stamina: 1 },
  TE: { hands: 3, runBlocking: 3, strength: 3, routeRunning: 2, passBlocking: 2, speed: 2, jumping: 1, concentration: 1 },
  WR: { speed: 4, routeRunning: 4, hands: 4, acceleration: 3, agility: 2, jumping: 2, concentration: 2, ballSecurity: 1, anticipation: 1 },
  OL: { runBlocking: 4, passBlocking: 4, strength: 4, footballIQ: 2, anticipation: 1, agility: 1, concentration: 1 },
  DL: { passRush: 4, blockShedding: 4, strength: 4, acceleration: 2, tackling: 2, speed: 1, aggression: 1 },
  LB: { tackling: 4, anticipation: 3, blockShedding: 2, zoneCoverage: 2, footballIQ: 2, speed: 2, strength: 2, manCoverage: 1, passRush: 1, aggression: 1 },
  CB: { manCoverage: 4, speed: 4, zoneCoverage: 3, acceleration: 3, agility: 2, ballSkills: 2, anticipation: 2, tackling: 1, jumping: 1 },
  S: { zoneCoverage: 4, tackling: 3, speed: 3, anticipation: 3, manCoverage: 2, ballSkills: 2, footballIQ: 2, bravery: 1 },
  K: { kickAccuracy: 5, kickPower: 4, composure: 2, concentration: 1 },
  P: { kickPower: 5, kickAccuracy: 4, composure: 1, concentration: 1 },
};

/**
 * Typical range [low, high] for attributes that DON'T count at a position, so a lineman is still
 * slow and a kicker can't tackle. Anything not listed falls back to its group's range below.
 */
export const OFF_POSITION_RANGES: Partial<Record<Position, Partial<Record<AttributeKey, [number, number]>>>> = {
  QB: { strength: [6, 12], tackling: [1, 4] },
  OL: { speed: [2, 7], acceleration: [3, 8], jumping: [2, 7] },
  DL: { agility: [5, 11] },
  TE: { acceleration: [7, 13], agility: [6, 12] },
  K: { strength: [3, 9], speed: [5, 11], tackling: [1, 4], stamina: [6, 12] },
  P: { strength: [3, 9], speed: [5, 11], tackling: [1, 4], stamina: [6, 12] },
};

/** Fallback ranges for attributes that don't count at a position, by group. */
export const GROUP_RANGES = {
  technical: [1, 7] as [number, number],
  mental: [5, 15] as [number, number],
  physical: [6, 13] as [number, number],
};

export function attributeGroup(key: AttributeKey): 'technical' | 'mental' | 'physical' {
  if ((TECHNICAL as readonly string[]).includes(key)) return 'technical';
  if ((MENTAL as readonly string[]).includes(key)) return 'mental';
  return 'physical';
}
