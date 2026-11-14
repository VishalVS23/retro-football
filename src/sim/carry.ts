/**
 * Running with the ball after the catch: steering, jukes, defenders chasing, tackles.
 * Pure functions (no Phaser); feel values are passed in. Units: yards and seconds.
 * The ball carrier always runs left-to-right (toward the opponent's end zone at x = 110).
 */
import { END_ZONE_DEPTH, FIELD_WIDTH, TOTAL_LENGTH } from './field';
import type { Vec } from './throw';

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

// ---------- Ball carrier ----------

export interface CarryParams {
  /** Forward running speed, yards per second. */
  runSpeed: number;
  /** Fastest sideways speed when steering. */
  steerSpeed: number;
  /** How quickly steering responds (higher = snappier). */
  steerResponse: number;
  /** Sideways burst speed during a juke. */
  jukeSpeed: number;
  /** How long a juke lasts. */
  jukeTime: number;
  /** Wait after a juke before the next one. */
  jukeCooldown: number;
}

export interface Carrier {
  pos: Vec;
  /** Current sideways speed (+ = down the screen). */
  vy: number;
  jukeLeft: number;
  jukeDir: number;
  cooldown: number;
}

export function startCarrier(pos: Vec): Carrier {
  return { pos: { ...pos }, vy: 0, jukeLeft: 0, jukeDir: 0, cooldown: 0 };
}

export function isJuking(c: Carrier) {
  return c.jukeLeft > 0;
}

/** Starts a juke up (dir -1) or down (dir +1) if he's ready. */
export function tryJuke(c: Carrier, dir: number, p: CarryParams): Carrier {
  if (c.cooldown > 0 || dir === 0) return c;
  return { ...c, jukeLeft: p.jukeTime, jukeDir: Math.sign(dir), cooldown: p.jukeTime + p.jukeCooldown };
}

/** `steer` is -1 (up) .. +1 (down) from the player's thumb. */
export function stepCarrier(c: Carrier, steer: number, dt: number, p: CarryParams): Carrier {
  let vy: number;
  let jukeLeft = c.jukeLeft;
  if (jukeLeft > 0) {
    vy = c.jukeDir * p.jukeSpeed;
    jukeLeft = Math.max(0, jukeLeft - dt);
  } else {
    const want = Math.max(-1, Math.min(1, steer)) * p.steerSpeed;
    vy = c.vy + (want - c.vy) * Math.min(1, p.steerResponse * dt); // eases in and out
  }
  return {
    pos: { x: c.pos.x + p.runSpeed * dt, y: c.pos.y + vy * dt },
    vy,
    jukeLeft,
    jukeDir: c.jukeDir,
    cooldown: Math.max(0, c.cooldown - dt),
  };
}

/** The goal line he's running toward. */
export const GOAL_LINE_X = TOTAL_LENGTH - END_ZONE_DEPTH;

export function playEnd(pos: Vec): 'touchdown' | 'out' | null {
  if (pos.x >= GOAL_LINE_X) return 'touchdown';
  if (pos.y < 0 || pos.y > FIELD_WIDTH) return 'out';
  return null;
}

// ---------- Defenders chasing ----------

export interface Pursuer {
  pos: Vec;
  /** His top speed, yards per second. */
  speed: number;
  /** Seconds left lying on the turf after a missed tackle. */
  stunned: number;
}

export interface PursuitParams {
  /** How late defenders react to the runner's moves. */
  reactionTime: number;
  /** How far ahead (in seconds) they aim, to take a pursuit angle. */
  leadTime: number;
  runSpeed: number;
}

/** What the defenders have seen of the runner, so they can react late. */
export type Sightings = Array<{ t: number; pos: Vec; vy: number }>;

export function remember(seen: Sightings, t: number, c: Carrier, keepSeconds: number): Sightings {
  return [...seen, { t, pos: { ...c.pos }, vy: c.vy }].filter((s) => s.t >= t - keepSeconds);
}

function sightingAt(seen: Sightings, t: number) {
  for (let i = seen.length - 1; i >= 0; i--) if (seen[i].t <= t) return seen[i];
  return seen[0];
}

export function stepPursuers(pursuers: Pursuer[], seen: Sightings, t: number, dt: number, p: PursuitParams): Pursuer[] {
  const s = sightingAt(seen, t - p.reactionTime);
  const target = { x: s.pos.x + p.runSpeed * p.leadTime, y: s.pos.y + s.vy * p.leadTime };
  return pursuers.map((d) => {
    if (d.stunned > 0) return { ...d, stunned: Math.max(0, d.stunned - dt) };
    const gap = dist(d.pos, target);
    const step = Math.min(gap, d.speed * dt);
    if (gap === 0) return d;
    return { ...d, pos: { x: d.pos.x + ((target.x - d.pos.x) / gap) * step, y: d.pos.y + ((target.y - d.pos.y) / gap) * step } };
  });
}

// ---------- Tackles ----------

export interface TackleParams {
  /** A defender this close can try to make the tackle. */
  tackleReachYards: number;
  /** Chance the runner breaks a normal tackle attempt. */
  brokenTackleChance: number;
  /** Chance a juke makes a defender miss completely (only while juking). */
  jukeEvadeChance: number;
  /** How long a defender who missed is out of the play. */
  stunTime: number;
}

export interface TackleCheck {
  tackled: boolean;
  /** Index of the defender who made (or missed) the tackle, or -1 if nobody was close. */
  by: number;
  /** 'broken' or 'juked' when someone missed. */
  missed: 'broken' | 'juked' | null;
  pursuers: Pursuer[];
}

/**
 * Every defender in reach (and not stunned) tries to tackle, nearest first.
 * `roll()` returns a seeded random number in [0, 1) for each attempt.
 */
export function checkTackles(pursuers: Pursuer[], c: Carrier, roll: () => number, p: TackleParams): TackleCheck {
  const order = pursuers
    .map((d, i) => ({ i, d: dist(d.pos, c.pos) }))
    .filter((o) => o.d <= p.tackleReachYards && pursuers[o.i].stunned <= 0)
    .sort((a, b) => a.d - b.d);
  const out = pursuers.map((d) => ({ ...d }));
  let missed: TackleCheck['missed'] = null;
  let by = -1;
  for (const { i } of order) {
    by = i;
    const juked = isJuking(c) && roll() < p.jukeEvadeChance;
    if (!juked && roll() >= p.brokenTackleChance) return { tackled: true, by: i, missed: null, pursuers: out };
    out[i].stunned = p.stunTime;
    missed = juked ? 'juked' : 'broken';
  }
  return { tackled: false, by, missed, pursuers: out };
}
