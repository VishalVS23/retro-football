/**
 * Passing math: aiming, flight time, ball arc, receiver adjustment, catch check.
 * Pure functions (no Phaser). Feel numbers are passed in, so tests can use their own.
 * Units: yards and seconds. x = along the field, y = across it, h = height above the turf.
 */

export interface Vec {
  x: number;
  y: number;
}

export const AIM_PUSH = 0;
export const AIM_SLINGSHOT = 1;

export interface FlightParams {
  flightTimeShort: number;
  flightTimeMedium: number;
  flightTimeDeep: number;
  shortYards: number;
  mediumYards: number;
  deepYards: number;
}

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Seconds the ball is in the air for a throw of `yards`.
 * Straight lines between the three reference points (short/medium/deep), continuing the
 * nearest line beyond them, so flight time grows more slowly than distance.
 */
export function flightTime(yards: number, p: FlightParams): number {
  const pts = [
    [p.shortYards, p.flightTimeShort],
    [p.mediumYards, p.flightTimeMedium],
    [p.deepYards, p.flightTimeDeep],
  ];
  const seg = yards <= pts[1][0] ? 0 : 1;
  const [x0, t0] = pts[seg];
  const [x1, t1] = pts[seg + 1];
  const t = t0 + ((yards - x0) * (t1 - t0)) / (x1 - x0);
  return Math.max(0.15, t); // never instant, even for tiny flips
}

export interface AimParams {
  /** AIM_PUSH: drag toward the target. AIM_SLINGSHOT: pull back away from it. */
  mode: number;
  /** Dragging this fraction of the screen height = a max-distance throw. */
  dragForMaxRatio: number;
  maxDistanceYards: number;
}

/**
 * Turns a finger drag (in screen pixels) into a target spot on the field.
 * Screen and field axes line up (field runs left-to-right), so direction carries over.
 */
export function aimTarget(from: Vec, dragX: number, dragY: number, screenHeight: number, p: AimParams): Vec {
  const len = Math.hypot(dragX, dragY);
  if (len === 0) return { ...from };
  const sign = p.mode === AIM_SLINGSHOT ? -1 : 1;
  const fullDrag = Math.max(1, screenHeight * p.dragForMaxRatio);
  const yards = Math.min(1, len / fullDrag) * p.maxDistanceYards;
  return {
    x: from.x + ((sign * dragX) / len) * yards,
    y: from.y + ((sign * dragY) / len) * yards,
  };
}

export interface Throw {
  from: Vec;
  to: Vec;
  duration: number;
  /** Highest point of the arc, in yards. */
  peak: number;
}

export function makeThrow(from: Vec, to: Vec, flight: FlightParams, arcHeightRatio: number): Throw {
  const d = dist(from, to);
  return { from, to, duration: flightTime(d, flight), peak: d * arcHeightRatio };
}

/** Where the ball is `t` seconds after release. Height is a smooth up-and-down arc. */
export function ballAt(th: Throw, t: number): Vec & { h: number; done: boolean } {
  const u = Math.min(1, Math.max(0, t / th.duration));
  return {
    x: th.from.x + (th.to.x - th.from.x) * u,
    y: th.from.y + (th.to.y - th.from.y) * u,
    h: 4 * th.peak * u * (1 - u),
    done: u >= 1,
  };
}

/** Points along the arc for the aiming preview (including both ends). */
export function arcPoints(th: Throw, count: number): Array<Vec & { h: number }> {
  return Array.from({ length: count }, (_, i) => ballAt(th, (th.duration * i) / (count - 1)));
}

/**
 * Where a receiver ends up after drifting toward the landing spot for `elapsed` seconds,
 * moving at `speed` but never more than `maxAdjust` yards from where he started.
 */
export function adjustReceiver(start: Vec, landing: Vec, maxAdjust: number, speed: number, elapsed: number): Vec {
  const d = dist(start, landing);
  if (d === 0) return { ...start };
  const move = Math.min(d, maxAdjust, speed * elapsed);
  return {
    x: start.x + ((landing.x - start.x) / d) * move,
    y: start.y + ((landing.y - start.y) / d) * move,
  };
}

export function isCatch(receiver: Vec, landing: Vec, catchRadius: number): boolean {
  return dist(receiver, landing) <= catchRadius;
}
