import { describe, expect, it } from 'vitest';
import {
  blockerSpot,
  reachedQb,
  resolvePass,
  startCoverage,
  stepCoverage,
  stepRusher,
  type Coverage,
  type Rusher,
} from './defense';
import { ROUTES, routePath, runnerAfter, startRunner, stepRunner } from './routes';

const cover = {
  topSpeed: 7.6,
  acceleration: 16,
  reactionTime: 0.25,
  cushionYards: 5,
  cushionCloseTime: 1.5,
  ballReactionTime: 0.2,
  ballSpeedRatio: 0.6,
};
const run = { topSpeed: 8, acceleration: 16, cutSpeedRatio: 0.55 };
const contest = {
  catchRadiusYards: 1.5,
  contestRadiusYards: 2.5,
  breakupChance: 0.6,
  interceptChance: 0.35,
  receiverCatchChance: 0.95,
  defenderCatchChance: 0.75,
};
const rush = { blockedSpeed: 1, freeSpeed: 6, sackReachYards: 1.2 };
const dt = 1 / 60;

function simulateRoute(name: string, seconds: number) {
  const wrStart = { x: 34.5, y: 14.7 };
  const path = routePath(wrStart, ROUTES.find((r) => r.name === name)!, 1);
  let wr = startRunner(path);
  let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
  for (let t = 0; t < seconds; t += dt) {
    wr = stepRunner(wr, path, dt, run);
    cb = stepCoverage(cb, wr.pos, dt, cover);
  }
  return { wr: wr.pos, cb: cb.pos };
}

describe('coverage', () => {
  it('starts off the receiver and closes in on a go route', () => {
    const early = simulateRoute('Go', 0.3);
    const late = simulateRoute('Go', 2.5);
    expect(early.cb.x - early.wr.x).toBeGreaterThan(2);
    expect(Math.hypot(late.cb.x - late.wr.x, late.cb.y - late.wr.y)).toBeLessThan(3);
  });

  it('loses a step when the receiver cuts (slant opens up)', () => {
    const { wr, cb } = simulateRoute('Slant', 1.2);
    expect(Math.hypot(cb.x - wr.x, cb.y - wr.y)).toBeGreaterThan(1.5);
  });

  it('breaks on the ball after reacting to the throw', () => {
    let c = startCoverage({ x: 50, y: 20 }, { x: 45, y: 20 });
    const landing = { x: 50, y: 30 };
    for (let i = 0; i < 6; i++) c = stepCoverage(c, { x: 45, y: 20 }, dt, cover, { landing, sinceThrow: i * dt });
    const before = c.pos.y;
    for (let i = 6; i < 60; i++) c = stepCoverage(c, { x: 45, y: 20 }, dt, cover, { landing, sinceThrow: i * dt });
    expect(c.pos.y).toBeGreaterThan(before + 2);
  });
});

describe('balance', () => {
  it('a well-led slant thrown on time is usually caught', () => {
    const wrStart = { x: 34.5, y: 14.7 };
    const path = routePath(wrStart, ROUTES[0], 1);
    let wr = startRunner(path);
    let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
    for (let i = 0; i < 36; i++) {
      // throw at ~0.6s
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, cover);
    }
    const flight = 1.0;
    const landing = runnerAfter(wr, path, flight, run).pos; // perfectly led
    for (let i = 0; i < 60; i++) {
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, cover, { landing, sinceThrow: (i + 1) * dt });
    }
    // Count how many of 100 evenly spaced rolls are catches.
    let catches = 0;
    for (let k = 0; k < 100; k++) if (resolvePass(wr.pos, cb.pos, landing, (k + 0.5) / 100, contest) === 'catch') catches++;
    expect(catches).toBeGreaterThanOrEqual(60);
  });
});

describe('pass rush', () => {
  it('blocked rushers crawl, free rushers fly', () => {
    const qb = { x: 30, y: 26 };
    let blocked: Rusher = { pos: { x: 36, y: 26 }, shedAt: 99 };
    let free: Rusher = { pos: { x: 36, y: 26 }, shedAt: 0 };
    for (let i = 0; i < 30; i++) {
      blocked = stepRusher(blocked, qb, i * dt, dt, rush);
      free = stepRusher(free, qb, i * dt, dt, rush);
    }
    expect(36 - blocked.pos.x).toBeCloseTo(0.5, 1);
    expect(36 - free.pos.x).toBeCloseTo(3, 1);
  });

  it('a sack happens at roughly the old 3 second pocket time with default-ish values', () => {
    const qb = { x: 30, y: 26.7 };
    let rushers: Rusher[] = [
      { pos: { x: 36, y: 23.7 }, shedAt: 2.2 },
      { pos: { x: 36, y: 29.7 }, shedAt: 2.4 },
    ];
    let t = 0;
    while (!reachedQb(rushers, qb, rush) && t < 10) {
      t += dt;
      rushers = rushers.map((r) => stepRusher(r, qb, t, dt, rush));
    }
    expect(t).toBeGreaterThan(2.5);
    expect(t).toBeLessThan(3.5);
  });

  it('puts the blocker between the rusher and the QB', () => {
    const spot = blockerSpot({ pos: { x: 36, y: 26 }, shedAt: 9 }, { x: 30, y: 26 });
    expect(spot.x).toBeCloseTo(35);
  });
});

describe('resolving the pass', () => {
  const landing = { x: 50, y: 20 };

  it('open receiver usually catches, occasionally drops', () => {
    expect(resolvePass({ x: 50.5, y: 20 }, { x: 56, y: 20 }, landing, 0.0, contest)).toBe('catch');
    expect(resolvePass({ x: 50.5, y: 20 }, { x: 56, y: 20 }, landing, 0.94, contest)).toBe('catch');
    expect(resolvePass({ x: 50.5, y: 20 }, { x: 56, y: 20 }, landing, 0.97, contest)).toBe('drop');
  });

  it('nobody near the ball is incomplete', () => {
    expect(resolvePass({ x: 45, y: 20 }, { x: 56, y: 20 }, landing, 0.0, contest)).toBe('incomplete');
  });

  it('a ball thrown straight to the defender is usually picked, sometimes dropped (never "incomplete")', () => {
    expect(resolvePass({ x: 45, y: 20 }, { x: 50.2, y: 20 }, landing, 0.1, contest)).toBe('interception');
    expect(resolvePass({ x: 45, y: 20 }, { x: 50.2, y: 20 }, landing, 0.7, contest)).toBe('interception');
    expect(resolvePass({ x: 45, y: 20 }, { x: 50.2, y: 20 }, landing, 0.9, contest)).toBe('droppedInt');
  });

  it('a tight defender can intercept, break it up, or lose the battle', () => {
    const wr = { x: 50.8, y: 20 };
    const cb = { x: 50.3, y: 20 }; // closer than the receiver
    expect(resolvePass(wr, cb, landing, 0.05, contest)).toBe('interception');
    expect(resolvePass(wr, cb, landing, 0.5, contest)).toBe('breakup');
    expect(resolvePass(wr, cb, landing, 0.9, contest)).toBe('catch');
  });

  it('a trailing defender can break it up but never intercepts', () => {
    const wr = { x: 50.2, y: 20 };
    const cb = { x: 51.5, y: 20 };
    for (const roll of [0, 0.1, 0.2]) expect(resolvePass(wr, cb, landing, roll, contest)).not.toBe('interception');
    expect(resolvePass(wr, cb, landing, 0.05, contest)).toBe('breakup');
  });
});
