/**
 * Run plays: the handoff, the running back's lane and run blocking. Pure functions (no Phaser);
 * feel values are passed in. Units: yards and seconds. Our offense runs toward +x.
 */
import type { Runner } from './routes';
import type { Rusher } from './defense';
import type { Vec } from './throw';

/** The RB gets the ball when he reaches the second point of his run path (the mesh / pitch point). */
export function reachedHandoff(rb: Runner): boolean {
  return rb.seg >= 1;
}

/**
 * The y of the path at a given x (straight lines between points). Before the path's first point
 * it's the first point's y; past the end, the last point's y.
 */
export function pathYAt(path: Vec[], x: number): number {
  if (x <= path[0].x) return path[0].y;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return path[path.length - 1].y;
}

/**
 * Steering that keeps the RB in his lane until you take over: aims `lookAhead` yards ahead on the
 * path, full steer once he's `fullSteerYards` off it. Nothing once he's past the end of the path.
 * Returns -1 (up) .. +1 (down), like a thumb.
 */
export function laneSteer(pos: Vec, path: Vec[], lookAhead: number, fullSteerYards: number): number {
  if (pos.x >= path[path.length - 1].x) return 0;
  const want = pathYAt(path, pos.x + lookAhead) - pos.y;
  return Math.max(-1, Math.min(1, want / Math.max(0.01, fullSteerYards)));
}

export interface RunBlockParams {
  /** Speed our blockers push a held defender back. */
  driveSpeed: number;
  /** His speed once he's beaten his blocker. */
  freeSpeed: number;
}

/**
 * A defensive lineman on a run play, before the handoff: our blocker drives him back and away from
 * the running back until his shed time, then he goes after the running back.
 */
export function stepRunRusher(r: Rusher, rb: Vec, t: number, dt: number, p: RunBlockParams): Rusher {
  if (t < r.shedAt) {
    // Driven back and to the side, away from the running back (opening the hole).
    const away = Math.sign(r.pos.y - rb.y);
    return { ...r, pos: { x: r.pos.x + p.driveSpeed * dt, y: r.pos.y + away * p.driveSpeed * dt } };
  }
  const d = Math.hypot(rb.x - r.pos.x, rb.y - r.pos.y);
  const step = Math.min(d, p.freeSpeed * dt);
  if (d === 0) return r;
  return { ...r, pos: { x: r.pos.x + ((rb.x - r.pos.x) / d) * step, y: r.pos.y + ((rb.y - r.pos.y) / d) * step } };
}
