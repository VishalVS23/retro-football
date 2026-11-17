/**
 * Running with the ball after the catch: steering, jukes, defenders chasing, tackles.
 * Pure functions (no Phaser); feel values are passed in. Units: yards and seconds.
 * Our ball carrier runs left-to-right (dirX = +1, toward x = 110). An interception returner
 * runs the other way (dirX = -1, toward our goal line at x = 10).
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
  /** Forward speed during a juke, as a fraction of full speed (1 = a juke costs nothing). Default 1. */
  jukeForwardRatio?: number;
  /** Time to get back to full speed after a juke. Default 0. */
  jukeRecoverTime?: number;
}

export interface Carrier {
  pos: Vec;
  /** Current sideways speed (+ = down the screen). */
  vy: number;
  jukeLeft: number;
  jukeDir: number;
  cooldown: number;
  /** Seconds left getting back up to full speed after a juke. */
  recover?: number;
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
  return { ...c, jukeLeft: p.jukeTime, jukeDir: Math.sign(dir), cooldown: p.jukeTime + p.jukeCooldown, recover: p.jukeRecoverTime ?? 0 };
}

/** `steer` is -1 (up) .. +1 (down) from the player's thumb (or the returner's AI). */
export function stepCarrier(c: Carrier, steer: number, dt: number, p: CarryParams, dirX: 1 | -1 = 1): Carrier {
  let vy: number;
  let jukeLeft = c.jukeLeft;
  let recover = c.recover ?? 0;
  // A juke costs forward speed: slow during it, then back up to full speed over jukeRecoverTime.
  const slowest = p.jukeForwardRatio ?? 1;
  let forward = 1;
  if (jukeLeft > 0) {
    vy = c.jukeDir * p.jukeSpeed;
    jukeLeft = Math.max(0, jukeLeft - dt);
    forward = slowest;
  } else {
    const want = Math.max(-1, Math.min(1, steer)) * p.steerSpeed;
    vy = c.vy + (want - c.vy) * Math.min(1, p.steerResponse * dt); // eases in and out
    const total = p.jukeRecoverTime ?? 0;
    if (recover > 0 && total > 0) forward = 1 - (1 - slowest) * (recover / total);
    recover = Math.max(0, recover - dt);
  }
  return {
    pos: { x: c.pos.x + dirX * p.runSpeed * forward * dt, y: c.pos.y + vy * dt },
    vy,
    jukeLeft,
    jukeDir: c.jukeDir,
    cooldown: Math.max(0, c.cooldown - dt),
    recover,
  };
}

/** The goal line our runner heads for, and the one an interception returner heads for. */
export const GOAL_LINE_X = TOTAL_LENGTH - END_ZONE_DEPTH;
export const OWN_GOAL_LINE_X = END_ZONE_DEPTH;

export function playEnd(pos: Vec, dirX: 1 | -1 = 1): 'touchdown' | 'out' | null {
  if (dirX > 0 ? pos.x >= GOAL_LINE_X : pos.x <= OWN_GOAL_LINE_X) return 'touchdown';
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
  /** Seconds left held by one of our blockers: pushed back and away from the runner at `driveSpeed`, can't tackle. */
  held?: number;
  /** Seconds left reading the play (a linebacker on a handoff): stands still, but can still tackle. */
  wait?: number;
}

/** Can he make a tackle right now? (Not on the turf, not held by a blocker.) */
export function canTackle(d: Pursuer) {
  return d.stunned <= 0 && !((d.held ?? 0) > 0);
}

export interface PursuitParams {
  /** How late defenders react to the runner's moves. */
  reactionTime: number;
  /** How far ahead (in seconds) they aim, to take a pursuit angle. */
  leadTime: number;
  runSpeed: number;
  /** Which way the runner is heading (+1 right, -1 left). Defaults to +1. */
  dirX?: 1 | -1;
  /** How fast our blockers push a held defender back (in the runner's direction). Default 0. */
  driveSpeed?: number;
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
  const target = { x: s.pos.x + (p.dirX ?? 1) * p.runSpeed * p.leadTime, y: s.pos.y + s.vy * p.leadTime };
  const dirX = p.dirX ?? 1;
  return pursuers.map((d) => {
    if (d.stunned > 0) return { ...d, stunned: Math.max(0, d.stunned - dt) };
    if ((d.held ?? 0) > 0) {
      // Our blocker drives him back and to the side, away from the runner (opening the hole).
      const drive = (p.driveSpeed ?? 0) * dt;
      const away = Math.sign(d.pos.y - s.pos.y);
      return { ...d, held: Math.max(0, (d.held ?? 0) - dt), pos: { x: d.pos.x + dirX * drive, y: d.pos.y + away * drive } };
    }
    if ((d.wait ?? 0) > 0) return { ...d, wait: Math.max(0, (d.wait ?? 0) - dt) };
    const gap = dist(d.pos, target);
    const step = Math.min(gap, d.speed * dt);
    if (gap === 0) return d;
    return { ...d, pos: { x: d.pos.x + ((target.x - d.pos.x) / gap) * step, y: d.pos.y + ((target.y - d.pos.y) / gap) * step } };
  });
}

// ---------- Returner AI ----------

/**
 * Steering for a computer-controlled runner (an interception returner): veer away from the
 * nearest chaser in front of or beside him, harder the closer he is, and keep off the sidelines.
 * Returns -1 (up) .. +1 (down), like a thumb.
 */
export function evadeSteer(pos: Vec, chasers: Pursuer[], dirX: 1 | -1, lookYards: number): number {
  let nearest: Pursuer | null = null;
  let nearestD = Infinity;
  for (const c of chasers) {
    if (!canTackle(c)) continue;
    if ((c.pos.x - pos.x) * dirX < -2) continue; // already behind him: ignore
    const d = dist(c.pos, pos);
    if (d < nearestD) {
      nearestD = d;
      nearest = c;
    }
  }
  let steer = 0;
  if (nearest && nearestD < lookYards) {
    const away = Math.sign(pos.y - nearest.pos.y) || (pos.y < FIELD_WIDTH / 2 ? 1 : -1);
    steer = away * (1 - nearestD / lookYards);
  }
  const margin = 5; // yards from the sideline where he starts turning back in
  if (pos.y < margin) steer = Math.max(steer, 1 - pos.y / margin);
  if (pos.y > FIELD_WIDTH - margin) steer = Math.min(steer, -(1 - (FIELD_WIDTH - pos.y) / margin));
  return Math.max(-1, Math.min(1, steer));
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
    .filter((o) => o.d <= p.tackleReachYards && canTackle(pursuers[o.i]))
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

// ---------- One frame of a run (any ball carrier, chased by defenders) ----------

export interface ChaseState {
  carrier: Carrier;
  pursuers: Pursuer[];
  seen: Sightings;
  /** Seconds since he got the ball. */
  t: number;
}

export interface ChaseParams {
  carry: CarryParams;
  pursuit: Omit<PursuitParams, 'runSpeed' | 'dirX'>;
  tackle: TackleParams;
  /** Nobody can tackle him for this long after he gets the ball. */
  graceTime: number;
  dirX: 1 | -1;
}

export interface ChaseStep {
  state: ChaseState;
  /** Someone missed a tackle this frame. */
  missed: 'broken' | 'juked' | null;
  /** How the run ended this frame, or null if it goes on. */
  end: 'tackled' | 'out' | 'touchdown' | null;
}

export function startChase(at: Vec, pursuers: Pursuer[]): ChaseState {
  const carrier = startCarrier(at);
  return { carrier, pursuers, seen: remember([], 0, carrier, 1), t: 0 };
}

/**
 * One frame: the carrier moves (`steer` from a thumb or an AI), defenders chase, and anyone in
 * reach tries to tackle. Used by the game for every run and by tests to simulate runs headless.
 */
export function stepChase(s: ChaseState, steer: number, dt: number, p: ChaseParams, roll: () => number): ChaseStep {
  const t = s.t + dt;
  const carrier = stepCarrier(s.carrier, steer, dt, p.carry, p.dirX);
  const seen = remember(s.seen, t, carrier, 1);
  let pursuers = stepPursuers(s.pursuers, seen, t, dt, { ...p.pursuit, runSpeed: p.carry.runSpeed, dirX: p.dirX });
  let missed: ChaseStep['missed'] = null;
  if (t >= p.graceTime) {
    const check = checkTackles(pursuers, carrier, roll, p.tackle);
    pursuers = check.pursuers;
    missed = check.missed;
    if (check.tackled) return { state: { carrier, pursuers, seen, t }, missed, end: 'tackled' };
  }
  return { state: { carrier, pursuers, seen, t }, missed, end: playEnd(carrier.pos, p.dirX) };
}
