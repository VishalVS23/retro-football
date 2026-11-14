import { describe, expect, it } from 'vitest';
import { ROUTES, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, type Runner } from './routes';
import type { Vec } from './throw';

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
