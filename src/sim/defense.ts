/**
 * Basic defense: a cornerback in man coverage, a two-man pass rush, and deciding what
 * happens when the ball arrives. Pure functions (no Phaser); feel values are passed in.
 * Units: yards and seconds.
 */
import { FIELD_WIDTH } from './field';
import type { Vec } from './throw';

const FIELD_MID = FIELD_WIDTH / 2;
const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/** Moves `from` toward `to` by at most `step` yards. */
function moveToward(from: Vec, to: Vec, step: number): Vec {
  const d = dist(from, to);
  if (d <= step || d === 0) return { ...to };
  return { x: from.x + ((to.x - from.x) / d) * step, y: from.y + ((to.y - from.y) / d) * step };
}

// ---------- Cornerback (man coverage) ----------

export interface CoverParams {
  topSpeed: number;
  acceleration: number;
  /** How far behind the receiver's movements he is, in seconds (he reacts late). */
  reactionTime: number;
  /** How far downfield of the receiver he lines up. */
  cushionYards: number;
  /** Seconds after the snap for that cushion to close to nothing. */
  cushionCloseTime: number;
  /** The cushion never closes below this (off man keeps a step on top). Default 0. */
  cushionFloorYards?: number;
  /**
   * Closest he can get to the receiver's body while breaking on the ball (he can't run through
   * him). Together with `shieldedContestRatio` this is what gets stop routes (Hitch, Curl) open.
   */
  bodyGapYards?: number;
  /**
   * Before the ball is thrown he never comes closer to our side than this x (a linebacker holds
   * his ground past the line instead of running into our backfield after the running back).
   */
  minX?: number;
  /** He only keeps to `minX` for this many seconds after the snap, then covers his man tight (a linebacker who reads the checkdown). Default: the whole play. */
  minXUntil?: number;
  /** After the throw, how long before he breaks on the ball. */
  ballReactionTime: number;
  /** Fraction of his top speed when breaking on the ball (he has to read it in the air). */
  ballSpeedRatio: number;
  /**
   * Help defender (the ball isn't going to HIS man): how long after the throw before he breaks on
   * it. He was watching his own man, so he's later. Default: same as `ballReactionTime`.
   */
  helpBallReactionTime?: number;
  /**
   * Momentum: how fast he can change his velocity (speed up, brake or turn), yards/s². With it he
   * turns and brakes gradually, so a sharp cut wins the receiver a step and a ball thrown at the
   * break can carry him past the spot. Leave it out for the old instant-turn behaviour.
   */
  turnAcceleration?: number;
  /**
   * How much he guesses ahead: 1 = he assumes the receiver keeps going the way he was going for the
   * whole reaction delay (even on a straight route, a cut fools him); 0 = he follows where the
   * receiver was. Default 0.
   */
  anticipation?: number;
}

export interface Coverage {
  pos: Vec;
  speed: number;
  /** Seconds since the snap. */
  t: number;
  /** Where the receiver has been (for the reaction delay). */
  history: Array<{ t: number; pos: Vec }>;
  /** This defender's speed this snap, as a share of `CoverParams.topSpeed` (random per snap; Stage 3: ratings). */
  speedScale: number;
  /** Direction he was last running (unit vector), or null while standing still. */
  dir: Vec | null;
  /** His velocity (only used with `CoverParams.turnAcceleration`). */
  vel: Vec;
}

export function startCoverage(cbStart: Vec, wrStart: Vec, speedScale = 1): Coverage {
  return { pos: { ...cbStart }, speed: 0, t: 0, history: [{ t: 0, pos: { ...wrStart } }], speedScale, dir: null, vel: { x: 0, y: 0 } };
}

/** A cornerback's speed for this snap: `ratio` of a receiver's, give or take up to `variance`. */
export function rollCornerSpeed(ratio: number, variance: number, roll: number): number {
  return ratio + variance * (roll * 2 - 1);
}

/**
 * His speed share when breaking on the ball: full speed if the ball is where he's already running
 * (trailing a go route), down to `ballSpeedRatio` once he has to turn 90 degrees or more.
 */
export function ballBreakRatio(dir: Vec | null, from: Vec, landing: Vec, ballSpeedRatio: number): number {
  const d = dist(from, landing);
  if (!dir || d < 1e-6) return ballSpeedRatio;
  const cos = (dir.x * (landing.x - from.x) + dir.y * (landing.y - from.y)) / d;
  return ballSpeedRatio + (1 - ballSpeedRatio) * Math.max(0, cos);
}

/** Where the receiver was `delay` seconds ago. */
function delayedPos(history: Coverage['history'], t: number): Vec {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].t <= t) return history[i].pos;
  return history[0].pos;
}

/**
 * One step of coverage. He shadows where the receiver was a moment ago (plus a shrinking
 * cushion), so cuts buy the receiver a step. Once the ball is in the air and he has reacted,
 * he sprints to the landing spot instead.
 */
export function stepCoverage(
  c: Coverage,
  wrPos: Vec,
  dt: number,
  p: CoverParams,
  ball?: { landing: Vec; sinceThrow: number; help?: boolean },
): Coverage {
  const t = c.t + dt;
  const history = [...c.history, { t, pos: { ...wrPos } }].filter((h) => h.t >= t - p.reactionTime - 0.5);
  let target: Vec;
  let targetVel: Vec = { x: 0, y: 0 }; // how the target itself is moving (for momentum: he matches it)
  let top = p.topSpeed * c.speedScale;
  const react = ball?.help ? (p.helpBallReactionTime ?? p.ballReactionTime) : p.ballReactionTime;
  if (ball && ball.sinceThrow >= react) {
    target = ball.landing;
    top *= ballBreakRatio(c.dir, c.pos, ball.landing, p.ballSpeedRatio);
  } else {
    const seen = delayedPos(history, t - p.reactionTime);
    const floor = Math.min(p.cushionFloorYards ?? 0, p.cushionYards);
    const cushion = floor + (p.cushionYards - floor) * Math.max(0, 1 - t / Math.max(0.01, p.cushionCloseTime));
    const before = delayedPos(history, t - p.reactionTime - 0.1);
    const seenVel = { x: (seen.x - before.x) / 0.1, y: (seen.y - before.y) / 0.1 };
    const ahead = (p.anticipation ?? 0) * p.reactionTime;
    const floorX = p.minX !== undefined && (p.minXUntil === undefined || t < p.minXUntil) ? p.minX : -Infinity;
    target = { x: Math.max(seen.x + seenVel.x * ahead + cushion, floorX), y: seen.y + seenVel.y * ahead };
    const closing = t < p.cushionCloseTime ? (p.cushionYards - floor) / Math.max(0.01, p.cushionCloseTime) : 0;
    targetVel = { x: seenVel.x - closing, y: seenVel.y };
  }
  // He can't run through the receiver: he stops short, on his own side of him.
  const gap = p.bodyGapYards ?? 0;
  if (gap > 0 && dist(wrPos, target) < gap) {
    const from = dist(wrPos, c.pos) > 1e-6 ? c.pos : { x: wrPos.x + 1, y: wrPos.y };
    const k = gap / dist(wrPos, from);
    target = { x: wrPos.x + (from.x - wrPos.x) * k, y: wrPos.y + (from.y - wrPos.y) * k };
  }
  if (p.turnAcceleration) return stepMomentum(c, target, targetVel, top, p.turnAcceleration, dt, t, history);
  const speed = Math.min(top, c.speed + p.acceleration * dt);
  const pos = moveToward(c.pos, target, speed * dt);
  const moved = dist(c.pos, pos);
  const dir = moved > 1e-6 ? { x: (pos.x - c.pos.x) / moved, y: (pos.y - c.pos.y) / moved } : c.dir;
  return { ...c, pos, speed, t, history, dir, vel: dir ? { x: dir.x * speed, y: dir.y * speed } : { x: 0, y: 0 } };
}

/**
 * Coverage with momentum: he steers his velocity toward the target, changing it by at most
 * `accel` yards/s² (so turns and stops take time). He matches the target's own movement and adds
 * a closing speed that shrinks as he arrives (so he doesn't orbit it), never above his top speed.
 */
function stepMomentum(
  c: Coverage,
  target: Vec,
  targetVel: Vec,
  top: number,
  accel: number,
  dt: number,
  t: number,
  history: Coverage['history'],
): Coverage {
  const d = dist(c.pos, target);
  const closeIn = Math.sqrt(2 * accel * d); // fastest closing speed he can still stop from in time
  let want = d > 1e-6 ? { x: targetVel.x + ((target.x - c.pos.x) / d) * closeIn, y: targetVel.y + ((target.y - c.pos.y) / d) * closeIn } : targetVel;
  const wantLen = Math.hypot(want.x, want.y);
  if (wantLen > top) want = { x: (want.x / wantLen) * top, y: (want.y / wantLen) * top };
  const dv = { x: want.x - c.vel.x, y: want.y - c.vel.y };
  const dvLen = Math.hypot(dv.x, dv.y);
  const k = dvLen > accel * dt ? (accel * dt) / dvLen : 1;
  const vel = { x: c.vel.x + dv.x * k, y: c.vel.y + dv.y * k };
  const speed = Math.hypot(vel.x, vel.y);
  const pos = { x: c.pos.x + vel.x * dt, y: c.pos.y + vel.y * dt };
  const dir = speed > 1e-6 ? { x: vel.x / speed, y: vel.y / speed } : c.dir;
  return { ...c, pos, speed, t, history, dir, vel };
}

// ---------- Deep safety ----------

export interface SafetyParams {
  /** The x he sits at when nobody is deep (line of scrimmage + his depth), and the deepest he'll go. */
  baseX: number;
  maxX: number;
  /** He stays at least this far deeper than the deepest receiver ("nobody gets behind him"). */
  cushionYards: number;
  /** Speed while reading the play, and while backing up to stay over the top. */
  driftSpeed: number;
  bailSpeed: number;
  /** Once the ball is thrown: how long before he breaks on it, and how fast he goes. */
  ballReactionTime: number;
  ballSpeed: number;
}

/**
 * One step of the deep safety: sits deep, shading toward the side with more receivers, and backs
 * up to stay deeper than the deepest receiver. After the throw (and a moment to read it) he
 * breaks on the landing spot.
 */
export function stepSafety(pos: Vec, receivers: Vec[], dt: number, p: SafetyParams, ball?: { landing: Vec; sinceThrow: number }): Vec {
  let target: Vec;
  let speed: number;
  if (ball && ball.sinceThrow >= p.ballReactionTime) {
    target = ball.landing;
    speed = p.ballSpeed;
  } else {
    const avgY = receivers.reduce((s, r) => s + r.y, 0) / receivers.length;
    const deepest = Math.max(...receivers.map((r) => r.x));
    target = { x: Math.min(p.maxX, Math.max(p.baseX, deepest + p.cushionYards)), y: (FIELD_MID + avgY) / 2 };
    speed = target.x > pos.x + 0.25 ? p.bailSpeed : p.driftSpeed;
  }
  return moveToward(pos, target, speed * dt);
}

// ---------- Pass rush ----------

export interface RushParams {
  /** Speed while a blocker is on him. */
  blockedSpeed: number;
  /** Speed once he's beaten his blocker. */
  freeSpeed: number;
  /** How close to the QB counts as a sack. */
  sackReachYards: number;
}

export interface Rusher {
  pos: Vec;
  /** Seconds after the snap when he beats his blocker. */
  shedAt: number;
}

export function isFree(r: Rusher, t: number) {
  return t >= r.shedAt;
}

export function stepRusher(r: Rusher, qb: Vec, t: number, dt: number, p: RushParams): Rusher {
  const speed = isFree(r, t) ? p.freeSpeed : p.blockedSpeed;
  return { ...r, pos: moveToward(r.pos, qb, speed * dt) };
}

/** Where his blocker stands while engaged: just in front of him, between him and the QB. */
export function blockerSpot(r: Rusher, qb: Vec, gap = 1): Vec {
  return moveToward(r.pos, qb, gap);
}

export function reachedQb(rushers: Rusher[], qb: Vec, p: RushParams): boolean {
  return rushers.some((r) => dist(r.pos, qb) <= p.sackReachYards);
}

export function closestRusher(rushers: Rusher[], qb: Vec): number {
  return Math.min(...rushers.map((r) => dist(r.pos, qb)));
}

// ---------- When the ball arrives ----------

/**
 * catch / drop: receiver caught it / had it and dropped it.
 * interception / droppedInt: defender caught it / had it and dropped it ("almost picked").
 * breakup: defender knocked it away. incomplete: nobody got to it.
 */
export type PassResult = 'catch' | 'drop' | 'breakup' | 'interception' | 'droppedInt' | 'incomplete';

export interface ContestParams {
  catchRadiusYards: number;
  /** Defender within this distance of the ball can contest it. */
  contestRadiusYards: number;
  /** Chance of a breakup when he's right on the ball (scaled down the further away he is). */
  breakupChance: number;
  /** Chance of an interception when he's closer to the ball than the receiver. */
  interceptChance: number;
  /** Chance an open receiver hangs on to a catchable ball (later: his hands rating). */
  receiverCatchChance: number;
  /** Chance a defender hangs on when the ball comes straight to him (later: his hands rating). */
  defenderCatchChance: number;
  /**
   * Defender behind the receiver (further from the QB): the receiver shields him with his body, so
   * he contests at this fraction of his normal strength. 1 = no shielding. Gets stop routes open.
   */
  shieldedContestRatio?: number;
  /**
   * A defender covering someone ELSE (a corner passing through, the linebacker) contests at this
   * fraction of his strength: his eyes were on his own man. The deep safety, whose job is the
   * ball, always contests fully. 1 = no difference. Default 1.
   */
  helpContestRatio?: number;
}

/**
 * Decides the outcome. `roll` is a random number in [0, 1) from the seeded RNG,
 * passed in so the result can be tested and replayed.
 */
/** Index of the point closest to `to` (-1 for an empty list). */
export function closestIndex(points: Vec[], to: Vec): number {
  let best = -1;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = dist(p, to);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Several receivers and defenders: the pass is meant for the receiver nearest the landing spot,
 * and the defender nearest the landing spot is the one who can interfere (or pick it off).
 */
/**
 * Per-player adjustments (Stage 3d-c ratings), by index. Missing = no change.
 * receiverCatch: each receiver's catch chance (replaces p.receiverCatchChance);
 * contested: each receiver's multiplier on defenders' breakup chance ("Wins contested catches");
 * breakup / intercept / hold: each defender's multipliers on breakup, interception and holding on.
 */
export interface PlayerContestMods {
  receiverCatch?: number[];
  contested?: number[];
  breakup?: number[];
  intercept?: number[];
  hold?: number[];
}

export function resolveTargetedPass(
  receivers: Vec[],
  defenders: Vec[],
  landing: Vec,
  roll: number,
  p: ContestParams,
  thrower?: Vec,
  mods: PlayerContestMods = {},
): { result: PassResult; receiver: number; defender: number } {
  const receiver = closestIndex(receivers, landing);
  const defender = closestIndex(defenders, landing);
  // Defender i < receivers.length covers receiver i man-to-man; anyone beyond that is the deep safety.
  const help = defender < receivers.length && defender !== receiver;
  const params: ContestParams = {
    ...p,
    receiverCatchChance: mods.receiverCatch?.[receiver] ?? p.receiverCatchChance,
    breakupChance: p.breakupChance * (mods.breakup?.[defender] ?? 1) * (mods.contested?.[receiver] ?? 1),
    interceptChance: p.interceptChance * (mods.intercept?.[defender] ?? 1),
    defenderCatchChance: Math.min(1, p.defenderCatchChance * (mods.hold?.[defender] ?? 1)),
  };
  const result = resolvePass(receivers[receiver], defenders[defender], landing, roll, params, thrower, help);
  return { result, receiver, defender };
}

/** Is the defender behind the receiver, as seen from the thrower (the receiver is in his way)? */
export function isShielded(wr: Vec, cb: Vec, thrower: Vec): boolean {
  return dist(cb, thrower) > dist(wr, thrower) + 0.5;
}

export function resolvePass(wr: Vec, cb: Vec, landing: Vec, roll: number, p: ContestParams, thrower?: Vec, help = false): PassResult {
  const wrD = dist(wr, landing);
  const cbD = dist(cb, landing);
  const wrCanCatch = wrD <= p.catchRadiusYards;
  const cbCanCatch = cbD <= p.catchRadiusYards;

  // Thrown to the defender (receiver nowhere near): he usually picks it off.
  if (!wrCanCatch) {
    if (!cbCanCatch) return 'incomplete';
    return roll < p.defenderCatchChance ? 'interception' : 'droppedInt';
  }

  // Receiver can get it; how much can the defender interfere?
  let strength = cbD > p.contestRadiusYards ? 0 : 1 - cbD / p.contestRadiusYards; // 1 = right on the ball
  if (thrower && isShielded(wr, cb, thrower)) strength *= p.shieldedContestRatio ?? 1;
  if (help) strength *= p.helpContestRatio ?? 1;
  const pInt = cbD < wrD ? p.interceptChance * strength : 0;
  const pBreakup = p.breakupChance * strength;
  if (roll < pInt) return 'interception';
  if (roll < pInt + pBreakup) return 'breakup';
  // Whatever's left: he catches it or drops it.
  const left = 1 - pInt - pBreakup;
  return roll < pInt + pBreakup + left * p.receiverCatchChance ? 'catch' : 'drop';
}
