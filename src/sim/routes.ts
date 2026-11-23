/**
 * Pass routes and how a receiver runs them. Pure functions (no Phaser).
 * Route shapes are football (not feel); speeds and cut sharpness are feel values passed in.
 * Units: yards and seconds. x = downfield, y = across the field.
 */
import { FIELD_WIDTH, TOTAL_LENGTH } from './field';
import type { Vec } from './throw';

export interface RouteDef {
  name: string;
  /**
   * Waypoints relative to the receiver's start. x = yards downfield,
   * y = yards toward the MIDDLE of the field (negative = toward his sideline).
   */
  points: Vec[];
  /** Stop route (Hitch, Curl): he plants on the last point and waits for the ball instead of running on. */
  stop?: boolean;
  /** The tight end stays in to block (3h-b): he isn't a receiver on this play. */
  block?: boolean;
}

// Sideways routes end a few yards short of the sideline so the pre-snap route art stays on screen at
// the zoomed-in camera (receivers keep running in the same direction after the route ends anyway).
const SLANT: RouteDef = { name: 'Slant', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 15, y: 12 }] };
const OUT: RouteDef = { name: 'Out', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -8 }] };
const GO: RouteDef = { name: 'Go', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] };
const POST: RouteDef = { name: 'Post', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 10 }] };
const CORNER: RouteDef = { name: 'Corner', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: -7 }] };
const DIG: RouteDef = { name: 'Dig', points: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 18 }] };
const DRAG: RouteDef = { name: 'Drag', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 20 }] };
// Stop routes: push upfield, then turn back toward the QB (the Curl also leans inside) and wait.
const HITCH: RouteDef = { name: 'Hitch', points: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 5, y: 1 }], stop: true };
const CURL: RouteDef = { name: 'Curl', points: [{ x: 0, y: 0 }, { x: 13, y: 0 }, { x: 11, y: 2.5 }], stop: true };

/** Every route, in the order a hot route cycles through them. */
export const ROUTES: RouteDef[] = [SLANT, OUT, GO, POST, CORNER, DIG, DRAG, HITCH, CURL];

// Running back routes. He starts behind the QB; negative y = toward the bottom sideline.
// Flat: swing out to the bottom flat. Check: slip past the line and sit (the checkdown). Wheel: flat, then deep.
const FLAT: RouteDef = { name: 'Flat', points: [{ x: 0, y: 0 }, { x: 1.5, y: -3 }, { x: 6.5, y: -8 }] };
const CHECK: RouteDef = { name: 'Check', points: [{ x: 0, y: 0 }, { x: 2.5, y: -3 }, { x: 8.5, y: -3 }, { x: 7.5, y: -2.5 }], stop: true };
const WHEEL: RouteDef = { name: 'Wheel', points: [{ x: 0, y: 0 }, { x: 2, y: -5 }, { x: 6, y: -10 }, { x: 30, y: -10 }] };
/** Running back routes, in the order a hot route cycles through them. */
export const RB_ROUTES: RouteDef[] = [FLAT, CHECK, WHEEL];

// Run plays: the RB's path. He gets the ball at the SECOND point (handoff / pitch), then the path
// is the lane he heads for until you steer. Dive: straight up the middle between our two blockers.
// Toss: the QB pitches it to him wide, and he runs round the outside (bottom side).
const DIVE: RouteDef = { name: 'Dive', points: [{ x: 0, y: 0 }, { x: 2.7, y: 1 }, { x: 6, y: 1.5 }, { x: 14, y: 1.5 }] };
const TOSS: RouteDef = { name: 'Toss', points: [{ x: 0, y: 0 }, { x: 2, y: -4 }, { x: 6, y: -6.5 }, { x: 13.5, y: -7.5 }] };

// Tight end routes (3h-b). He lines up just outside the bottom tackle; positive y = up, toward the
// middle. Seam: straight up the field. Drag: short, across the middle. Flat: out to the bottom
// sideline. Block: he stays in (more time to throw, one fewer receiver).
const SEAM: RouteDef = { name: 'Seam', points: [{ x: 0, y: 0 }, { x: 24, y: 0 }] };
const TE_DRAG: RouteDef = { name: 'Drag', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 15 }] };
const TE_FLAT: RouteDef = { name: 'Flat', points: [{ x: 0, y: 0 }, { x: 2, y: -1.5 }, { x: 6, y: -6 }] };
const BLOCK: RouteDef = { name: 'Block', points: [{ x: 0, y: 0 }, { x: -0.8, y: 0 }], stop: true, block: true };
/** Tight end routes, in the order a hot route cycles through them. */
export const TE_ROUTES: RouteDef[] = [SEAM, TE_DRAG, TE_FLAT, BLOCK];

/** Index of the running back in a play's routes (and in formation `skill`). */
export const RB = 3;
/** Index of the tight end (3h-b). */
export const TE = 4;

/** Route running for skill spot i before his ratings: the tight end runs a step slower (3h-b). */
export function routeBase(i: number, routes: RunParams & { teSpeedRatio: number }): RunParams {
  const plain = { topSpeed: routes.topSpeed, acceleration: routes.acceleration, cutSpeedRatio: routes.cutSpeedRatio };
  return i === TE ? { ...plain, topSpeed: plain.topSpeed * routes.teSpeedRatio } : plain;
}

/** The defender on skill spot i is a linebacker (LB1 on the RB, LB2 on the TE), else a corner. */
export function coveredByLinebacker(i: number): boolean {
  return i === RB || i === TE;
}

/**
 * A play: one route per player in formation `skill` order: [wide top, slot top, wide bottom, RB, TE].
 * Run play (`run`): the RB's "route" is his run path and he gets the ball; the receivers run their
 * routes to pull the cornerbacks away (on the Toss the bottom receiver runs a Hitch, staying near the edge).
 */
export interface PlayDef {
  name: string;
  routes: RouteDef[];
  run?: boolean;
}

/** Starter playbook. Play calling picks from these. */
export const PLAYS: PlayDef[] = [
  { name: 'Slants', routes: [SLANT, OUT, SLANT, CHECK, SEAM] },
  { name: 'Verticals', routes: [GO, GO, GO, CHECK, SEAM] },
  { name: 'Post Corner', routes: [POST, CORNER, DIG, FLAT, TE_DRAG] },
  { name: 'Crossers', routes: [DIG, DRAG, POST, WHEEL, BLOCK] },
  { name: 'Hitch Slant', routes: [HITCH, SLANT, HITCH, FLAT, SEAM] },
  { name: 'Curls', routes: [CURL, DIG, CURL, CHECK, TE_FLAT] },
  // Tight end plays (3h-b): the slot's post pulls the safety away from his seam; his drag under a curl.
  { name: 'TE Seam', routes: [GO, POST, GO, CHECK, SEAM] },
  { name: 'TE Drag', routes: [GO, CURL, CURL, FLAT, TE_DRAG] },
  { name: 'Dive', routes: [GO, GO, GO, DIVE, BLOCK], run: true },
  { name: 'Toss', routes: [GO, GO, HITCH, TOSS, BLOCK], run: true },
];

/**
 * Hot route: the next route in that player's list (receiver, RB or TE routes; `index` = his
 * formation spot), wrapping round. A run path isn't in a list, so it stays as it is.
 */
export function nextRoute(current: RouteDef, index: number): RouteDef {
  const list = index === TE ? TE_ROUTES : index === RB ? RB_ROUTES : ROUTES;
  const i = list.findIndex((r) => r.name === current.name);
  return i >= 0 ? list[(i + 1) % list.length] : current;
}

/** A copy of `play` with receiver `wr` running `route` instead. The playbook itself never changes. */
export function withHotRoute(play: PlayDef, wr: number, route: RouteDef): PlayDef {
  return { ...play, routes: play.routes.map((r, i) => (i === wr ? route : r)) };
}

/** Deepest a route goes: this far inside the back line of their end zone (football layout). */
export const BACK_LINE_MARGIN = 1.5;
export const ROUTE_MAX_X = TOTAL_LENGTH - BACK_LINE_MARGIN;

/**
 * Turns a route into field positions. `towardMiddle` is +1 if the middle of the field
 * is at larger y than the receiver (he lines up near the top sideline), else -1.
 * Near the goal line routes get shorter: no point goes deeper than ROUTE_MAX_X (a Go becomes
 * "run to the back of the end zone", a Post flattens out along it).
 */
export function routePath(start: Vec, route: RouteDef, towardMiddle: 1 | -1): Vec[] {
  const pts = route.points.map((p) => ({ x: Math.min(ROUTE_MAX_X, start.x + p.x), y: start.y + p.y * towardMiddle }));
  // Two points squashed onto the same spot would make a zero-length leg: drop the repeat.
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6);
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
  /** Stop route: stands still once the route is finished. */
  stop?: boolean;
}

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
const unit = (a: Vec, b: Vec): Vec => {
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};

export function startRunner(path: Vec[], stop = false): Runner {
  return { pos: { ...path[0] }, speed: 0, seg: 0, dir: path.length > 1 ? unit(path[0], path[1]) : { x: 1, y: 0 }, stop };
}

const EDGE = 0.5; // stay just inside the sidelines and the back line

/**
 * Advances the runner by `dt` seconds along the path: speeds up, slows at each cut,
 * and keeps running straight once the route is finished (stopping at the sideline or the back of
 * the end zone), unless it's
 * a stop route: then he plants on the last point and waits.
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
  if (r.stop && seg >= path.length - 1) return { pos, speed: 0, seg, dir, stop: true };
  if (remaining > 0) pos = { x: pos.x + dir.x * remaining, y: pos.y + dir.y * remaining };

  if (pos.y < EDGE || pos.y > FIELD_WIDTH - EDGE) {
    pos.y = Math.min(FIELD_WIDTH - EDGE, Math.max(EDGE, pos.y));
    speed = 0; // ran into the sideline
  }
  if (pos.x > TOTAL_LENGTH - EDGE) {
    pos.x = TOTAL_LENGTH - EDGE;
    speed = 0; // ran into the back of the end zone
  }
  return { pos, speed, seg, dir, stop: r.stop };
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
