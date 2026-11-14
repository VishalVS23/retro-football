/**
 * Pass routes and how a receiver runs them. Pure functions (no Phaser).
 * Route shapes are football (not feel); speeds and cut sharpness are feel values passed in.
 * Units: yards and seconds. x = downfield, y = across the field.
 */
import { FIELD_WIDTH } from './field';
import type { Vec } from './throw';

export interface RouteDef {
  name: string;
  /**
   * Waypoints relative to the receiver's start. x = yards downfield,
   * y = yards toward the MIDDLE of the field (negative = toward his sideline).
   */
  points: Vec[];
}

export const ROUTES: RouteDef[] = [
  { name: 'Slant', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 15, y: 12 }] },
  { name: 'Out', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -12 }] },
  { name: 'Go', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
];

/**
 * Turns a route into field positions. `towardMiddle` is +1 if the middle of the field
 * is at larger y than the receiver (he lines up near the top sideline), else -1.
 */
export function routePath(start: Vec, route: RouteDef, towardMiddle: 1 | -1): Vec[] {
  return route.points.map((p) => ({ x: start.x + p.x, y: start.y + p.y * towardMiddle }));
}

export interface RunParams {
  /** Top running speed, yards per second. */
  topSpeed: number;
  /** How fast he gets up to speed, yards per second per second. */
  acceleration: number;
  /** Fraction of speed kept through a cut (1 = no slowdown, lower = rounder, slower cuts). */
  cutSpeedRatio: number;
}

export interface Runner {
  pos: Vec;
  speed: number;
  /** Index of the waypoint he last passed. */
  seg: number;
  /** Direction he's currently running (unit vector). */
  dir: Vec;
}

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
const unit = (a: Vec, b: Vec): Vec => {
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};

export function startRunner(path: Vec[]): Runner {
  return { pos: { ...path[0] }, speed: 0, seg: 0, dir: path.length > 1 ? unit(path[0], path[1]) : { x: 1, y: 0 } };
}

const EDGE = 0.5; // stay just inside the sidelines

/**
 * Advances the runner by `dt` seconds along the path: speeds up, slows at each cut,
 * and keeps running straight once the route is finished (stopping at the sideline).
 */
export function stepRunner(r: Runner, path: Vec[], dt: number, p: RunParams): Runner {
  let speed = Math.min(p.topSpeed, r.speed + p.acceleration * dt);
  let remaining = speed * dt;
  let pos = { ...r.pos };
  let seg = r.seg;
  let dir = r.dir;

  while (remaining > 1e-9 && seg < path.length - 1) {
    const next = path[seg + 1];
    const d = dist(pos, next);
    if (remaining < d) {
      dir = unit(pos, next);
      pos = { x: pos.x + dir.x * remaining, y: pos.y + dir.y * remaining };
      remaining = 0;
    } else {
      pos = { ...next };
      remaining -= d;
      seg += 1;
      if (seg < path.length - 1) {
        // A real cut: lose speed.
        dir = unit(pos, path[seg + 1]);
        speed *= p.cutSpeedRatio;
        remaining *= p.cutSpeedRatio;
      }
    }
  }
  if (remaining > 0) pos = { x: pos.x + dir.x * remaining, y: pos.y + dir.y * remaining };

  if (pos.y < EDGE || pos.y > FIELD_WIDTH - EDGE) {
    pos.y = Math.min(FIELD_WIDTH - EDGE, Math.max(EDGE, pos.y));
    speed = 0; // ran into the sideline
  }
  return { pos, speed, seg, dir };
}

/** Where the runner will be after `seconds` more of his route (used to see where he'll be when the ball lands). */
export function runnerAfter(r: Runner, path: Vec[], seconds: number, p: RunParams, dt = 1 / 60): Runner {
  let out = r;
  for (let t = 0; t < seconds - 1e-9; t += dt) out = stepRunner(out, path, Math.min(dt, seconds - t), p);
  return out;
}

/**
 * Receiver's position while the ball is in the air: his route position plus a drift toward
 * the ball. The drift is aimed from where he WILL be when it lands, so it never flips direction
 * (he never "dodges" the ball). It grows at `adjustSpeed` up to `maxAdjust` yards.
 */
export function receiverInFlight(
  routePos: Vec,
  predictedAtLanding: Vec,
  landing: Vec,
  elapsed: number,
  maxAdjust: number,
  adjustSpeed: number,
): Vec {
  const want = { x: landing.x - predictedAtLanding.x, y: landing.y - predictedAtLanding.y };
  const len = Math.hypot(want.x, want.y);
  if (len === 0) return { ...routePos };
  const move = Math.min(len, maxAdjust, adjustSpeed * elapsed);
  return { x: routePos.x + (want.x / len) * move, y: routePos.y + (want.y / len) * move };
}
