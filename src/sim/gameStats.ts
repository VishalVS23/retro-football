/**
 * Box score for one game: team stats for both sides, our QB's line, our longest play and the score
 * by quarter. Pure functions, no Phaser. Plays on a 2-point try don't count (as in real stats).
 * Stage 3 (players) adds per-player lines; stage 4 keeps these for every league game.
 */
import type { DriveEvent } from './drive';
import type { OppDrive } from './oppDrive';

export interface SideStats {
  /** Snaps from scrimmage (kicks and punts not counted). */
  plays: number;
  /** Net passing yards (sacks taken count against it). */
  passYards: number;
  rushYards: number;
  firstDowns: number;
  /** Interceptions thrown + fumbles lost. */
  turnovers: number;
  /** Times this side's QB was sacked. */
  sacked: number;
}

export interface QbLine {
  completions: number;
  attempts: number;
  /** Yards on completions (catch + run after it). */
  yards: number;
  touchdowns: number;
  interceptions: number;
}

export interface GameStats {
  us: SideStats;
  them: SideStats;
  qb: QbLine;
  /** Our longest gain from scrimmage. */
  longest: number;
  /** Points per period: index 0-3 = Q1-Q4, 4+ = overtime periods. */
  byQuarter: { us: number[]; them: number[] };
}

/** One of our snaps, as far as the box score cares. */
export type OurPlay =
  | { kind: 'pass'; result: 'complete'; yards: number; touchdown: boolean }
  | { kind: 'pass'; result: 'incomplete' | 'interception' }
  | { kind: 'run'; yards: number } // a designed run or a QB scramble past the line
  | { kind: 'sack'; yards: number }; // yards is negative (or 0)

export const newSideStats = (): SideStats => ({ plays: 0, passYards: 0, rushYards: 0, firstDowns: 0, turnovers: 0, sacked: 0 });

export function newGameStats(): GameStats {
  return {
    us: newSideStats(),
    them: newSideStats(),
    qb: { completions: 0, attempts: 0, yards: 0, touchdowns: 0, interceptions: 0 },
    longest: 0,
    byQuarter: { us: [0, 0, 0, 0], them: [0, 0, 0, 0] },
  };
}

export function totalYards(s: SideStats) {
  return s.passYards + s.rushYards;
}

/** One of our snaps from scrimmage. */
export function recordOurPlay(g: GameStats, p: OurPlay): GameStats {
  const us = { ...g.us, plays: g.us.plays + 1 };
  const qb = { ...g.qb };
  let longest = g.longest;
  if (p.kind === 'pass') {
    qb.attempts++;
    if (p.result === 'complete') {
      qb.completions++;
      qb.yards += p.yards;
      us.passYards += p.yards;
      if (p.touchdown) qb.touchdowns++;
      longest = Math.max(longest, p.yards);
    } else if (p.result === 'interception') {
      qb.interceptions++;
      us.turnovers++;
    }
  } else if (p.kind === 'run') {
    us.rushYards += p.yards;
    longest = Math.max(longest, p.yards);
  } else {
    us.sacked++;
    us.passYards += p.yards;
  }
  return { ...g, us, qb, longest };
}

/**
 * What the downs/score rules said after one of our plays or kicks: first downs and turnovers
 * that only the rules know about (fumbles, their returner fumbling to us).
 */
export function recordEvent(g: GameStats, event: DriveEvent): GameStats {
  if (event === 'firstDown') return { ...g, us: { ...g.us, firstDowns: g.us.firstDowns + 1 } };
  if (event === 'fumbleLost' || event === 'fumbleTD') return { ...g, us: { ...g.us, turnovers: g.us.turnovers + 1 } };
  if (event === 'takeaway' || event === 'muffedPunt') return { ...g, them: { ...g.them, turnovers: g.them.turnovers + 1 } };
  return g;
}

/** A side's team stats plus one simulated drive. */
export function addDrive(t: SideStats, d: OppDrive): SideStats {
  const turnover = d.result === 'interception' || d.result === 'fumble' ? 1 : 0;
  // Field goal tries and punts are plays in the drive sim, but not snaps from scrimmage here.
  const kicks = d.result === 'fieldGoal' || d.result === 'missedFieldGoal' || d.result === 'punt' ? 1 : 0;
  return {
    plays: t.plays + Math.max(0, d.plays - kicks),
    passYards: t.passYards + d.stats.passYards,
    rushYards: t.rushYards + d.stats.rushYards,
    firstDowns: t.firstDowns + d.stats.firstDowns,
    turnovers: t.turnovers + turnover,
    sacked: t.sacked + d.stats.sacks,
  };
}

/** One simulated CPU drive. */
export function recordTheirDrive(g: GameStats, d: OppDrive): GameStats {
  return { ...g, them: addDrive(g.them, d) };
}

/** One of OUR drives that was simulated (SIM, 3g-B): team stats, our QB's line and the longest play. */
export function recordOurSimDrive(g: GameStats, d: OppDrive): GameStats {
  const s = d.stats;
  return {
    ...g,
    us: addDrive(g.us, d),
    qb: {
      completions: g.qb.completions + s.completions,
      attempts: g.qb.attempts + s.attempts,
      yards: g.qb.yards + s.completionYards,
      touchdowns: g.qb.touchdowns + s.passTouchdowns,
      interceptions: g.qb.interceptions + (d.result === 'interception' ? 1 : 0),
    },
    longest: Math.max(g.longest, s.longest),
  };
}

/** Points scored in `quarter` (1-4, 5+ = overtime). */
export function addPoints(g: GameStats, quarter: number, us: number, them: number): GameStats {
  if (us === 0 && them === 0) return g;
  const i = Math.max(0, quarter - 1);
  const grow = (a: number[]) => {
    const out = [...a];
    while (out.length <= i) out.push(0);
    return out;
  };
  const u = grow(g.byQuarter.us);
  const t = grow(g.byQuarter.them);
  u[i] += us;
  t[i] += them;
  return { ...g, byQuarter: { us: u, them: t } };
}
