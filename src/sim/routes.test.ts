import { describe, expect, it } from 'vitest';
import { PLAYS, RB, RB_ROUTES, ROUTES, ROUTE_MAX_X, nextRoute, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, withHotRoute, type Runner } from './routes';
import type { Vec } from './throw';
import { TOTAL_LENGTH } from './field';

const params = { topSpeed: 8, acceleration: 16, cutSpeedRatio: 0.5 };
const start = { x: 35, y: 15 };
const route = (name: string) => ROUTES.find((r) => r.name === name)!;

function run(path: Vec[], seconds: number, dt = 1 / 60): Runner {
  let r = startRunner(path);
  for (let t = 0; t < seconds - 1e-9; t += dt) r = stepRunner(r, path, dt, params);
  return r;
}

describe('routes', () => {
  it('mirrors routes depending on which side the receiver is on', () => {
    const top = routePath(start, route('Slant'), 1);
    const bottom = routePath(start, route('Slant'), -1);
    expect(top[2].y).toBe(27);
    expect(bottom[2].y).toBe(3);
  });

  it('a Go route runs straight downfield, faster over time', () => {
    const path = routePath(start, route('Go'), 1);
    const r1 = run(path, 1);
    const r2 = run(path, 2);
    expect(r1.pos.y).toBeCloseTo(15);
    expect(r1.pos.x - 35).toBeGreaterThan(4); // ~6 yd in the first second (accelerating)
    expect(r2.pos.x - r1.pos.x).toBeCloseTo(8, 0); // then top speed
  });

  it('slows down at a cut', () => {
    const path = routePath(start, route('Out'), 1);
    let r = startRunner(path);
    let before = 0;
    while (r.seg === 0) {
      before = r.speed;
      r = stepRunner(r, path, 1 / 60, params);
    }
    expect(r.speed).toBeLessThan(before * 0.75);
  });

  it('follows the route shape (out breaks toward the sideline)', () => {
    const path = routePath(start, route('Out'), 1);
    const r = run(path, 2.2);
    expect(r.pos.x).toBeCloseTo(43, 0);
    expect(r.pos.y).toBeLessThan(15);
  });

  it('keeps running after the route ends, but stops at the sideline', () => {
    const path = routePath(start, route('Out'), 1);
    const r = run(path, 10);
    expect(r.pos.y).toBeCloseTo(0.5);
    expect(r.speed).toBe(0);
  });

  it('near their goal line routes get shorter and stop at the back of the end zone', () => {
    const atTheir2 = { x: 107.5, y: 10 };
    const go = routePath(atTheir2, route('Go'), 1);
    expect(go[go.length - 1].x).toBe(ROUTE_MAX_X); // not 40 yd downfield
    const post = routePath(atTheir2, route('Post'), 1);
    expect(Math.max(...post.map((p) => p.x))).toBeLessThanOrEqual(ROUTE_MAX_X);
    expect(post[post.length - 1].y).toBe(20); // still breaks to the middle, flattened along the back line
    // He runs to the back line and stays inside it.
    const r = run(go, 10);
    expect(r.pos.x).toBeLessThanOrEqual(TOTAL_LENGTH);
    expect(r.speed).toBe(0);
  });

  it('routes away from the goal line are unchanged', () => {
    const at25 = { x: 35, y: 10 };
    expect(routePath(at25, route('Go'), 1)).toEqual([at25, { x: 75, y: 10 }]);
  });

    it('predicts where the runner will be later', () => {
    const path = routePath(start, route('Slant'), 1);
    const now = run(path, 0.5);
    const later = runnerAfter(now, path, 1, params);
    expect(later.pos.x).toBeCloseTo(run(path, 1.5).pos.x, 1);
    expect(later.pos.y).toBeCloseTo(run(path, 1.5).pos.y, 1);
  });

  it('receiver never drifts AWAY from an underthrown ball', () => {
    // Go route; ball lands 5 yd behind where he'll be when it arrives.
    const path = routePath(start, route('Go'), 1);
    let r = run(path, 1);
    const flight = 1;
    const predicted = runnerAfter(r, path, flight, params).pos;
    const landing = { x: predicted.x - 5, y: predicted.y };
    let lastGap = Infinity;
    for (let t = 1 / 60; t <= flight + 1e-9; t += 1 / 60) {
      r = stepRunner(r, path, 1 / 60, params);
      const pos = receiverInFlight(r.pos, predicted, landing, t, 2, 6);
      const gapToPredicted = predicted.x - pos.x;
      expect(gapToPredicted).toBeLessThanOrEqual(lastGap + 0.2); // keeps closing on the landing side
      lastGap = gapToPredicted;
    }
    const final = receiverInFlight(r.pos, predicted, landing, flight, 2, 6);
    expect(final.x).toBeCloseTo(predicted.x - 2, 1); // came back the full 2 yd toward the ball
  });

  it('is deterministic', () => {
    const path = routePath(start, route('Slant'), 1);
    expect(run(path, 1.7)).toEqual(run(path, 1.7));
  });
});

describe('stop routes (Hitch, Curl)', () => {
  const runStop = (name: string, seconds: number) => {
    const path = routePath(start, route(name), 1);
    let r = startRunner(path, route(name).stop);
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) r = stepRunner(r, path, 1 / 60, params);
    return { r, path };
  };

  it('a hitch plants on its last point and stays there', () => {
    const { r, path } = runStop('Hitch', 4);
    const end = path[path.length - 1];
    expect(r.pos.x).toBeCloseTo(end.x);
    expect(r.pos.y).toBeCloseTo(end.y);
    expect(r.speed).toBe(0);
  });

  it('a curl comes back toward the QB and inside after pushing upfield', () => {
    const { path } = runStop('Curl', 0);
    expect(path[2].x).toBeLessThan(path[1].x); // comes back
    expect(path[2].y).toBeGreaterThan(path[1].y); // leans toward the middle (receiver up top)
    const { r } = runStop('Curl', 5);
    expect(r.pos.x).toBeCloseTo(path[2].x);
  });

  it('predicting a stopped receiver gives the same spot', () => {
    const { r, path } = runStop('Hitch', 3);
    expect(runnerAfter(r, path, 1, params).pos).toEqual(r.pos);
  });
});

describe('hot routes', () => {
  it('cycles through every route and wraps round', () => {
    let r = ROUTES[0];
    const seen = new Set<string>();
    for (let i = 0; i < ROUTES.length; i++) {
      seen.add(r.name);
      r = nextRoute(r);
    }
    expect(seen.size).toBe(ROUTES.length);
    expect(r.name).toBe(ROUTES[0].name); // back to the start
  });

  it('changes one receiver for this snap and never touches the playbook', () => {
    const play = PLAYS[0];
    const before = play.routes.map((r) => r.name);
    const hot = withHotRoute(play, 1, route('Go'));
    expect(hot.routes.map((r) => r.name)).toEqual([before[0], 'Go', before[2], before[3]]);
    expect(play.routes.map((r) => r.name)).toEqual(before);
  });

  it('every play has four routes (3 receivers + RB) and the new plays exist', () => {
    for (const p of PLAYS) expect(p.routes).toHaveLength(4);
    expect(PLAYS.map((p) => p.name)).toEqual(expect.arrayContaining(['Hitch Slant', 'Curls', 'Dive', 'Toss']));
    expect(PLAYS).toHaveLength(8);
    expect(PLAYS.filter((p) => p.run).map((p) => p.name)).toEqual(['Dive', 'Toss']);
  });

  it('RB hot routes cycle through the RB routes only; run paths never change', () => {
    let r = RB_ROUTES[0];
    for (let i = 0; i < RB_ROUTES.length; i++) {
      expect(RB_ROUTES).toContain(r);
      r = nextRoute(r);
    }
    expect(r).toBe(RB_ROUTES[0]);
    const dive = PLAYS.find((p) => p.name === 'Dive')!.routes[RB];
    expect(nextRoute(dive)).toBe(dive);
  });
});
