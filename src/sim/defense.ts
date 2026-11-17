/**
 * Basic defense: a cornerback in man coverage, a two-man pass rush, and deciding what
 * happens when the ball arrives. Pure functions (no Phaser); feel values are passed in.
 * Units: yards and seconds.
 */
import type { Vec } from './throw';

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
  /** After the throw, how long before he breaks on the ball. */
  ballReactionTime: number;
  /** Fraction of his top speed when breaking on the ball (he has to read it in the air). */
  ballSpeedRatio: number;
}

export interface Coverage {
  pos: Vec;
  speed: number;
  /** Seconds since the snap. */
  t: number;
  /** Where the receiver has been (for the reaction delay). */
  history: Array<{ t: number; pos: Vec }>;
}

export function startCoverage(cbStart: Vec, wrStart: Vec): Coverage {
  return { pos: { ...cbStart }, speed: 0, t: 0, history: [{ t: 0, pos: { ...wrStart } }] };
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
  ball?: { landing: Vec; sinceThrow: number },
): Coverage {
  const t = c.t + dt;
  const history = [...c.history, { t, pos: { ...wrPos } }].filter((h) => h.t >= t - p.reactionTime - 0.5);
  let target: Vec;
  let top = p.topSpeed;
  if (ball && ball.sinceThrow >= p.ballReactionTime) {
    target = ball.landing;
    top = p.topSpeed * p.ballSpeedRatio;
  } else {
    const seen = delayedPos(history, t - p.reactionTime);
    const cushion = p.cushionYards * Math.max(0, 1 - t / Math.max(0.01, p.cushionCloseTime));
    target = { x: Math.max(seen.x + cushion, p.minX ?? -Infinity), y: seen.y };
  }
  // He can't run through the receiver: he stops short, on his own side of him.
  const gap = p.bodyGapYards ?? 0;
  if (gap > 0 && dist(wrPos, target) < gap) {
    const from = dist(wrPos, c.pos) > 1e-6 ? c.pos : { x: wrPos.x + 1, y: wrPos.y };
    const k = gap / dist(wrPos, from);
    target = { x: wrPos.x + (from.x - wrPos.x) * k, y: wrPos.y + (from.y - wrPos.y) * k };
  }
  const speed = Math.min(top, c.speed + p.acceleration * dt);
  return { pos: moveToward(c.pos, target, speed * dt), speed, t, history };
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
export function resolveTargetedPass(
  receivers: Vec[],
  defenders: Vec[],
  landing: Vec,
  roll: number,
  p: ContestParams,
  thrower?: Vec,
): { result: PassResult; receiver: number; defender: number } {
  const receiver = closestIndex(receivers, landing);
  const defender = closestIndex(defenders, landing);
  const result = resolvePass(receivers[receiver], defenders[defender], landing, roll, p, thrower);
  return { result, receiver, defender };
}

/** Is the defender behind the receiver, as seen from the thrower (the receiver is in his way)? */
export function isShielded(wr: Vec, cb: Vec, thrower: Vec): boolean {
  return dist(cb, thrower) > dist(wr, thrower) + 0.5;
}

export function resolvePass(wr: Vec, cb: Vec, landing: Vec, roll: number, p: ContestParams, thrower?: Vec): PassResult {
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
  const pInt = cbD < wrD ? p.interceptChance * strength : 0;
  const pBreakup = p.breakupChance * strength;
  if (roll < pInt) return 'interception';
  if (roll < pInt + pBreakup) return 'breakup';
  // Whatever's left: he catches it or drops it.
  const left = 1 - pInt - pBreakup;
  return roll < pInt + pBreakup + left * p.receiverCatchChance ? 'catch' : 'drop';
}
