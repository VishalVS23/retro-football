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
  /**
   * A-b: per play and target ("Slants#0"), faded throw count and the average landing spot (yards past
   * the line, and across). Missing in memories saved before A-b.
   */
  landings?: Record<string, { n: number; dx: number; y: number }>;
}

export function newScouting(): Scouting {
  return { plays: {}, run: 0, pass: 0, short: 0, deep: 0, targets: [0, 0, 0, 0, 0], catches: [0, 0, 0, 0, 0], yards: [0, 0, 0, 0, 0], landings: {} };
}

/** One snap of ours, as he saw it. `air` = how far past the line the ball was thrown, `y` = where across (passes only). */
export interface ScoutedSnap {
  play: string;
  run: boolean;
  air?: number;
  y?: number;
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
    landings: {},
  };
  for (const [key, l] of Object.entries(s.landings ?? {})) if (l.n * k >= 0.05) out.landings![key] = { ...l, n: l.n * k };
  if (!snap.run && snap.to !== undefined && snap.air !== undefined && snap.y !== undefined) {
    const key = `${snap.play}#${snap.to}`;
    const old = out.landings![key];
    const n = (old?.n ?? 0) + 1;
    out.landings![key] = old ? { n, dx: (old.dx * old.n + snap.air) / n, y: (old.y * old.n + snap.y) / n } : { n, dx: snap.air, y: snap.y };
  }
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

/** Skill spot of the RB: never keyed (an LB sitting on the flat measured no better than covering him). */
const KEY_SKIP_RB = 3;

/** A-b: the play he's sitting on, its favourite target and where those throws land (yards past the line, across). */
export interface PlayKey {
  play: string;
  to: number;
  dx: number;
  y: number;
}

/**
 * A-b: is he sitting on one of our plays? The most-called play once its faded count reaches `keyFrom`
 * (a fast coach sooner), and its most-thrown-to target once that has `keyTargetFrom` faded throws.
 */
export function playKey(s: Scouting, speed: number, feel: Feel): PlayKey | null {
  const a = feel.adjust;
  const from = a.keyFrom - a.keyFastSpeedUp * Math.max(0, Math.min(1, speed));
  const top = Object.entries(s.plays).reduce<[string, number] | null>((best, e) => (!best || e[1] > best[1] ? e : best), null);
  if (!top || top[1] < from) return null;
  let best: PlayKey | null = null;
  let bestN = 0;
  for (const [key, l] of Object.entries(s.landings ?? {})) {
    const [play, to] = key.split('#');
    if (play !== top[0] || Number(to) === KEY_SKIP_RB || l.n < a.keyTargetFrom || l.n <= bestN) continue;
    best = { play, to: Number(to), dx: l.dx, y: l.y };
    bestN = l.n;
  }
  return best;
}

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
  const out = JSON.parse(JSON.stringify(s)) as Scouting;
  const okLanding = (l: unknown) => {
    const x = l as { n?: unknown; dx?: unknown; y?: unknown };
    return !!x && num(x.n) && typeof x.dx === 'number' && Number.isFinite(x.dx) && num(x.y);
  };
  if (!out.landings || typeof out.landings !== 'object' || !Object.values(out.landings).every(okLanding)) out.landings = {};
  return out;
}

/** A-b: where a jumper aims: `jumpBlend` of the way from where his job puts him toward the spot he's sitting on. */
export function jumpTarget(job: { x: number; y: number }, spot: { x: number; y: number }, feel: Feel): { x: number; y: number } {
  const k = Math.max(0, Math.min(1, feel.adjust.jumpBlend));
  return { x: job.x + (spot.x - job.x) * k, y: job.y + (spot.y - job.y) * k };
}

/** Skill spots that can be bracketed: the three WRs and the TE (the RB is the linebackers'). */
const BRACKETABLE = [0, 1, 2, 4];

/**
 * A-c: our hot receiver, or null: a WR / TE with enough catches or yards this game (a fast coach
 * reacts sooner) who is also the one we throw to most right now.
 */
export function hotReceiver(s: Scouting, speed: number, feel: Feel): number | null {
  const a = feel.adjust;
  const v = Math.max(0, Math.min(1, speed));
  const catches = a.hotCatches - a.hotFastCatches * v;
  const yards = a.hotYards - a.hotFastYards * v;
  const most = s.targets.reduce((best, t, i) => (t > s.targets[best] ? i : best), 0);
  if (!BRACKETABLE.includes(most) || s.targets[most] <= 0) return null;
  return s.catches[most] >= catches || s.yards[most] >= yards ? most : null;
}

/** A-c: where the bracketing safety aims: deep over the top of the hot receiver (his corner has him underneath). */
export function bracketTarget(receiver: { x: number; y: number }, losX: number, feel: Feel): { x: number; y: number } {
  return { x: Math.max(receiver.x + feel.adjust.bracketCushionYards, losX + feel.adjust.bracketMinDepthYards), y: receiver.y };
}

/** A-c: the bracketed receiver's corner plays him tight underneath (help is over the top). */
export function bracketCorner<P extends { reactionTime: number; cushionYards: number; turnAcceleration?: number }>(p: P, feel: Feel): P {
  const a = feel.adjust;
  return {
    ...p,
    reactionTime: p.reactionTime * a.bracketReactionRatio,
    cushionYards: Math.min(p.cushionYards, a.bracketCushionMax),
    ...(p.turnAcceleration !== undefined && { turnAcceleration: p.turnAcceleration * a.bracketTurnScale }),
  };
}
