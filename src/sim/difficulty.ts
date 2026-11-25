/**
 * Difficulty modes. Normal = the game's values as they are. Hard builds a changed copy of the
 * feel values (feel.difficulty says by how much) for games you play on the field: your snaps and the CPU
 * drives in them. League sims and the SIM button keep the plain values, so the league stays fair and
 * simming never dodges the difficulty. Pure logic, no Phaser.
 */
import type { Feel } from '../config/feel';

export type DifficultyId = 'normal' | 'hard';
export const DIFFICULTY_IDS: DifficultyId[] = ['normal', 'hard'];
export const DIFFICULTY_NAMES: Record<DifficultyId, string> = { normal: 'Normal', hard: 'Hard' };

/** Defenders' reaction times scaled by the mode (to their man's cuts, to the throw, to the runner). */
const REACTIONS: Array<[section: 'defense' | 'zone' | 'tackling', key: string]> = [
  ['defense', 'cbReactionTime'],
  ['defense', 'cbBallReactionTime'],
  ['defense', 'cbHelpBallReactionTime'],
  ['defense', 'robberBallReactionTime'],
  ['defense', 'twoDeepBallReactionTime'],
  ['defense', 'twoDeepFrontReactionTime'],
  ['defense', 'safetyBallReactionTime'],
  ['defense', 'lbReactionTime'],
  ['zone', 'deepBallReactionTime'],
  ['zone', 'underBallReactionTime'],
  ['tackling', 'pursuitReactionTime'],
];

export interface Levers {
  readChance: number;
  disguiseScale: number;
  /** Added to their coach's 0..1 adjust speed. */
  adjustShift: number;
  reactionScale: number;
  scatterScale: number;
  catchScale: number;
  pocketScale: number;
  cpuScale: number;
  /** The LOOKS LIKE strip spells out what beats the look (Normal); Hard shows only the look. */
  tips: boolean;
}

export function levers(id: DifficultyId, feel: Feel): Levers {
  const d = feel.difficulty;
  if (id === 'hard')
    return {
      readChance: d.hardReadChance,
      disguiseScale: d.hardDisguiseScale,
      adjustShift: d.hardAdjustShift,
      reactionScale: d.hardReactionScale,
      scatterScale: d.hardScatterScale,
      catchScale: d.hardCatchScale,
      pocketScale: d.hardPocketScale,
      cpuScale: d.hardCpuScale,
      tips: false,
    };
  return {
    readChance: feel.ratings.qbReadChance,
    disguiseScale: 1,
    adjustShift: 0,
    reactionScale: 1,
    scatterScale: 1,
    catchScale: 1,
    pocketScale: 1,
    cpuScale: 1,
    tips: true,
  };
}

/** A copy of `base` with the mode's changes (Normal = `base` itself). Only the touched sections are copied. */
export function withDifficulty(base: Feel, id: DifficultyId): Feel {
  if (id === 'normal') return base;
  const l = levers(id, base);
  const f: Feel = {
    ...base,
    defense: { ...base.defense },
    zone: { ...base.zone },
    tackling: { ...base.tackling },
    ratings: {
      ...base.ratings,
      qbReadChance: l.readChance,
      scatterBaseYards: base.ratings.scatterBaseYards * l.scatterScale,
      scatterPerYard: base.ratings.scatterPerYard * l.scatterScale,
    },
    defCalls: { ...base.defCalls, disguiseChance: Math.min(1, base.defCalls.disguiseChance * l.disguiseScale) },
    catching: { ...base.catching, catchRadiusYards: base.catching.catchRadiusYards * l.catchScale },
    bullet: { ...base.bullet, catchRadiusYards: base.bullet.catchRadiusYards * l.catchScale },
    pocket: { ...base.pocket, shedTime: base.pocket.shedTime * l.pocketScale },
    oppDrive: { ...base.oppDrive, strength: base.oppDrive.strength * l.cpuScale },
  };
  for (const [section, key] of REACTIONS) {
    const s = f[section] as Record<string, number>;
    s[key] = s[key] * l.reactionScale;
  }
  return f;
}

/** Their coach's adjust speed (0..1) in this mode. */
export function adjustSpeedFor(speed: number, id: DifficultyId, feel: Feel): number {
  return Math.max(0, Math.min(1, speed + levers(id, feel).adjustShift));
}

/** Anything else (old save, junk) = Normal. */
export function sanitizeDifficulty(v: unknown): DifficultyId {
  return v === 'hard' ? 'hard' : 'normal';
}
