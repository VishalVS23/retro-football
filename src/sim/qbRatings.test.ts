import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { makeFiller } from '../league/league';
import type { Player } from '../players/player';
import { PLAYS } from './routes';
import { simulatePass, type PassShot } from './passSim';
import { accuracyFor, arm, missLanding, missRadius, offTargetCatchFactor } from './qbRatings';

/** A QB with every attribute 10, then the given overrides. */
function qb(over: Partial<Player['attributes']> = {}): Player {
  const q = makeFiller('QB');
  for (const k of Object.keys(q.attributes) as (keyof Player['attributes'])[]) q.attributes[k] = 10;
  Object.assign(q.attributes, over);
  return q;
}
const R = feel.ratings;
const F = feel.throw;

describe('QB ratings', () => {
  it('an average arm is today; a big arm is faster and longer, a weak one slower and shorter', () => {
    expect(arm(qb(), R)).toEqual({ speed: 1, range: 1 });
    expect(arm(null, R)).toEqual({ speed: 1, range: 1 });
    const big = arm(qb({ throwPower: 18 }), R);
    const weak = arm(qb({ throwPower: 5 }), R);
    expect(big.speed).toBeGreaterThan(1.15);
    expect(big.range).toBeGreaterThan(1.15);
    expect(weak.speed).toBeLessThan(0.9);
    expect(arm(qb({ throwPower: 18 }), { ...R, enabled: 0 })).toEqual({ speed: 1, range: 1 }); // switched off
  });

  it('accuracy is short / medium / deep by throw length, blended in between', () => {
    const q = qb({ shortAccuracy: 16, mediumAccuracy: 10, deepAccuracy: 4 });
    expect(accuracyFor(q, 3, F, R)).toBe(16);
    expect(accuracyFor(q, F.mediumYards, F, R)).toBe(10);
    expect(accuracyFor(q, 40, F, R)).toBe(4);
    const between = accuracyFor(q, (F.shortYards + F.mediumYards) / 2, F, R);
    expect(between).toBeGreaterThan(10);
    expect(between).toBeLessThan(16);
  });

  it('the miss grows with distance, under pressure and with worse accuracy; composure helps under pressure', () => {
    const avg = qb();
    expect(missRadius(avg, 30, false, F, R)).toBeGreaterThan(missRadius(avg, 8, false, F, R));
    expect(missRadius(avg, 15, true, F, R)).toBeGreaterThan(missRadius(avg, 15, false, F, R));
    expect(missRadius(qb({ mediumAccuracy: 5 }), 12, false, F, R)).toBeGreaterThan(missRadius(avg, 12, false, F, R) * 2);
    expect(missRadius(qb({ mediumAccuracy: 16 }), 12, false, F, R)).toBeLessThan(missRadius(avg, 12, false, F, R) / 2);
    expect(missRadius(qb({ composure: 18 }), 15, true, F, R)).toBeLessThan(missRadius(avg, 15, true, F, R));
  });

  it('off-target balls are harder to catch: free up to a small miss, then worse the further off', () => {
    expect(offTargetCatchFactor(0, 1.5, R)).toBe(1);
    expect(offTargetCatchFactor(R.offTargetFreeYards, 1.5, R)).toBe(1);
    expect(offTargetCatchFactor(1, 1.5, R)).toBeLessThan(1);
    expect(offTargetCatchFactor(1.5, 1.5, R)).toBeCloseTo(1 - R.offTargetCatchLoss);
    expect(offTargetCatchFactor(5, 1.5, R)).toBeCloseTo(1 - R.offTargetCatchLoss);
  });

  it('the ball always lands inside the oval: up to the radius across the throw, less along it', () => {
    const from = { x: 30, y: 20 };
    const aim = { x: 50, y: 20 }; // straight downfield: along = x, across = y
    for (let i = 0; i < 500; i++) {
      const p = missLanding(from, aim, 2, 0.4, (i * 0.618) % 1, (i * 0.377) % 1);
      expect(Math.abs(p.y - aim.y)).toBeLessThanOrEqual(2 + 1e-9);
      expect(Math.abs(p.x - aim.x)).toBeLessThanOrEqual(0.8 + 1e-9);
    }
  });
});

const play = (name: string) => PLAYS.find((p) => p.name === name)!;
function catches(name: string, shot: PassShot, opts?: Parameters<typeof simulatePass>[5]) {
  let n = 0;
  for (let s = 1; s <= 250; s++) if (simulatePass(play(name), shot, s * 7919, feel, 35, opts).result === 'catch') n++;
  return (n / 250) * 100;
}

/** These run hundreds of whole plays: give them time. */
const SLOW = 30000;

describe('balance: QB ratings in whole pass plays', () => {
  const routes: [string, PassShot][] = [
    ['Slants', { to: 0, throwAt: 0.5, lead: 1 }],
    ['Hitch Slant', { to: 0, throwAt: 1.1, lead: 1 }],
    ['Curls', { to: 0, throwAt: 1.5, lead: 1 }],
    ['Verticals', { to: 0, throwAt: 1.1, lead: 1 }],
  ];

  it('an average QB stays close to perfect throws (the small miss is the one exception to 10 = today)', () => {
    for (const [name, shot] of routes) expect(catches(name, shot) - catches(name, shot, { qb: qb() }), name).toBeLessThan(13);
  }, SLOW);

  it('a weak, inaccurate QB under pressure is clearly worse, but not hopeless', () => {
    const bad = qb({ shortAccuracy: 5, mediumAccuracy: 5, deepAccuracy: 5, composure: 6 });
    let lost = 0;
    for (const [name, shot] of routes) {
      const c = catches(name, shot, { qb: bad, pressured: true });
      lost += catches(name, shot, { qb: qb() }) - c;
      expect(c, name).toBeGreaterThan(15);
    }
    expect(lost / routes.length).toBeGreaterThan(15);
  }, SLOW);

  it('a typical 4-star QB beats a 2-star one, by a lot more under pressure', () => {
    const two = qb({ throwPower: 11, shortAccuracy: 12, mediumAccuracy: 9, deepAccuracy: 11, composure: 9 });
    const four = qb({ throwPower: 15, shortAccuracy: 15, mediumAccuracy: 15, deepAccuracy: 14, composure: 13 });
    let calm = 0;
    let pressured = 0;
    for (const [name, shot] of routes) {
      calm += catches(name, shot, { qb: four }) - catches(name, shot, { qb: two });
      pressured += catches(name, shot, { qb: four, pressured: true }) - catches(name, shot, { qb: two, pressured: true });
    }
    expect(calm / routes.length).toBeGreaterThan(3);
    expect(pressured / routes.length).toBeGreaterThan(12);
  }, SLOW);

  it('a big arm completes more quick throws than a weak one', () => {
    const big = catches('Slants', routes[0][1], { qb: qb({ throwPower: 18 }) });
    const weak = catches('Slants', routes[0][1], { qb: qb({ throwPower: 5 }) });
    expect(big - weak).toBeGreaterThan(10);
  }, SLOW);
});
