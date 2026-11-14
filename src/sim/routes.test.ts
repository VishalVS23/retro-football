import { describe, expect, it } from 'vitest';
import { ROUTES, routePath, startRunner, stepRunner, type Runner } from './routes';
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

  it('is deterministic', () => {
    const path = routePath(start, route('Slant'), 1);
    expect(run(path, 1.7)).toEqual(run(path, 1.7));
  });
});
