/**
 * In-game adjustments (step A-a): their coach's scouting memory of THIS game. Pure logic, no Phaser.
 *
 * After every snap of ours he notes the play called, run or pass, short or deep, who we threw to and
 * who caught it for how many yards. Recent snaps count more: before each new snap is added, the
 * running counts fade by `adjust.memoryFade` (so after ~5 snaps an old habit is mostly forgotten).
 * Catches and yards per receiver are game totals (for the "hot receiver", A-c).
 *
 * `leans` turns the memory into how strongly he thinks we lean on the run, quick short passes or deep
 * shots (0 = no lean .. 1 = all-in), already scaled by how much he's seen (a couple of snaps prove nothing).
 */
import type { Feel } from '../config/feel';

export interface Scouting {
  /** Faded counts per play name. */
  plays: Record<string, number>;
  /** Faded counts: runs, passes, and of the passes, short ones and deep ones. */
  run: number;
  pass: number;
  short: number;
  deep: number;
  /** Faded targets per skill spot [wide top, slot, wide bottom, RB, TE]. */
  targets: number[];
  /** Game totals per skill spot: catches and yards after the catch included. */
  catches: number[];
  yards: number[];
}

export function newScouting(): Scouting {
  return { plays: {}, run: 0, pass: 0, short: 0, deep: 0, targets: [0, 0, 0, 0, 0], catches: [0, 0, 0, 0, 0], yards: [0, 0, 0, 0, 0] };
}

/** One snap of ours, as he saw it. `air` = how far past the line the ball was thrown (passes only). */
export interface ScoutedSnap {
  play: string;
  run: boolean;
  air?: number;
  to?: number;
  caught?: boolean;
  yards?: number;
}

export function recordSnap(s: Scouting, snap: ScoutedSnap, feel: Feel): Scouting {
  const a = feel.adjust;
  const k = a.memoryFade;
  const plays: Record<string, number> = {};
  for (const [name, n] of Object.entries(s.plays)) if (n * k >= 0.05) plays[name] = n * k;
  plays[snap.play] = (plays[snap.play] ?? 0) + 1;
  const out: Scouting = {
    plays,
    run: s.run * k + (snap.run ? 1 : 0),
    pass: s.pass * k + (snap.run ? 0 : 1),
    short: s.short * k + (!snap.run && snap.air !== undefined && snap.air < a.shortAirYards ? 1 : 0),
    deep: s.deep * k + (!snap.run && snap.air !== undefined && snap.air >= a.deepAirYards ? 1 : 0),
    targets: s.targets.map((t, i) => t * k + (!snap.run && snap.to === i ? 1 : 0)),
    catches: [...s.catches],
    yards: [...s.yards],
  };
  if (snap.to !== undefined && snap.to >= 0 && snap.to < out.catches.length && snap.caught) {
    out.catches[snap.to] += 1;
    out.yards[snap.to] += snap.yards ?? 0;
  }
  return out;
}

export interface Leans {
  run: number;
  short: number;
  deep: number;
}

/**
 * How strongly he reads each habit, 0..1, times how sure he is (faded snaps seen / `adjust.sureSnaps`).
 * Run: past `runShareFrom` of our snaps being runs. Short / deep: past `shortShareFrom` /
 * `deepShareFrom` of our passes (an ordinary mix leans on nothing).
 */
export function leans(s: Scouting, feel: Feel): Leans {
  const a = feel.adjust;
  const total = s.run + s.pass;
  if (total <= 0) return { run: 0, short: 0, deep: 0 };
  const sure = Math.min(1, total / a.sureSnaps);
  const over = (share: number, from: number) => Math.max(0, Math.min(1, (share - from) / (1 - from)));
  const passShare = (n: number) => (s.pass > 0 ? n / s.pass : 0);
  const passSure = Math.min(1, s.pass / a.sureSnaps);
  return {
    run: sure * over(s.run / total, a.runShareFrom),
    short: passSure * over(passShare(s.short), a.shortShareFrom),
    deep: passSure * over(passShare(s.deep), a.deepShareFrom),
  };
}

/** The strongest habit he's reacting to (for the strip hint), or null if none is past `hintFrom`. */
export function mainLean(l: Leans, feel: Feel): keyof Leans | null {
  const best = (Object.keys(l) as (keyof Leans)[]).reduce((a, b) => (l[b] > l[a] ? b : a));
  return l[best] >= feel.adjust.hintFrom ? best : null;
}

export const LEAN_HINTS: Record<keyof Leans, string> = {
  run: "They're selling out against the run",
  short: "They're crowding the short routes",
  deep: "They're protecting deep",
};

/** How quickly a coach adjusts, 0 (slow) .. 1 (fast): fixed per team until coordinators (Stage 8). */
export function teamAdjustSpeed(teamId: number | null | undefined): number {
  if (teamId === null || teamId === undefined) return 0.5;
  let h = (teamId + 7) * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 999;
}

/** A damaged or missing memory (old save) = an empty one. */
export function sanitizeScouting(v: unknown): Scouting {
  const s = v as Partial<Scouting> | null | undefined;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const list = (x: unknown) => Array.isArray(x) && x.length === 5 && x.every(num);
  if (
    !s ||
    typeof s !== 'object' ||
    !s.plays ||
    typeof s.plays !== 'object' ||
    !Object.values(s.plays).every(num) ||
    ![s.run, s.pass, s.short, s.deep].every(num) ||
    !list(s.targets) ||
    !list(s.catches) ||
    !list(s.yards)
  )
    return newScouting();
  return JSON.parse(JSON.stringify(s)) as Scouting;
}
