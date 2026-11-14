import { describe, expect, it } from 'vitest';
import {
  AIM_PUSH,
  AIM_SLINGSHOT,
  adjustReceiver,
  aimTarget,
  arcPoints,
  ballAt,
  flightTime,
  isCatch,
  makeThrow,
} from './throw';

const flight = {
  flightTimeShort: 0.5,
  flightTimeMedium: 1.0,
  flightTimeDeep: 1.6,
  shortYards: 5,
  mediumYards: 12,
  deepYards: 25,
};

describe('flight time', () => {
  it('hits the reference points from the feel notes', () => {
    expect(flightTime(5, flight)).toBeCloseTo(0.5);
    expect(flightTime(12, flight)).toBeCloseTo(1.0);
    expect(flightTime(25, flight)).toBeCloseTo(1.6);
  });

  it('grows more slowly than distance', () => {
    expect(flightTime(40, flight)).toBeGreaterThan(flightTime(25, flight));
    expect(flightTime(40, flight) / 40).toBeLessThan(flightTime(5, flight) / 5);
  });

  it('is never instant or negative', () => {
    expect(flightTime(0, flight)).toBeGreaterThan(0);
    expect(flightTime(1, flight)).toBeGreaterThan(0);
  });
});

describe('aiming', () => {
  const qb = { x: 30, y: 26 };
  const aim = { mode: AIM_PUSH, dragForMaxRatio: 0.5, maxDistanceYards: 40 };

  it('push mode throws the way you drag', () => {
    const t = aimTarget(qb, 100, 0, 400, aim); // half of max drag (200px)
    expect(t.x).toBeCloseTo(50);
    expect(t.y).toBeCloseTo(26);
  });

  it('slingshot mode throws the opposite way', () => {
    const t = aimTarget(qb, -100, 0, 400, { ...aim, mode: AIM_SLINGSHOT });
    expect(t.x).toBeCloseTo(50);
  });

  it('never throws further than the max distance', () => {
    const t = aimTarget(qb, 5000, 0, 400, aim);
    expect(t.x).toBeCloseTo(70);
  });

  it('a zero drag stays put', () => {
    expect(aimTarget(qb, 0, 0, 400, aim)).toEqual(qb);
  });
});

describe('ball arc', () => {
  const th = makeThrow({ x: 0, y: 0 }, { x: 20, y: 0 }, flight, 0.25);

  it('starts and ends on the ground and peaks halfway', () => {
    expect(ballAt(th, 0).h).toBe(0);
    expect(ballAt(th, th.duration).h).toBeCloseTo(0);
    expect(ballAt(th, th.duration / 2).h).toBeCloseTo(5); // 20 yd * 0.25
    expect(ballAt(th, th.duration / 2).x).toBeCloseTo(10);
  });

  it('reports when it has landed', () => {
    expect(ballAt(th, th.duration * 0.9).done).toBe(false);
    expect(ballAt(th, th.duration + 1).done).toBe(true);
    expect(ballAt(th, th.duration + 1).x).toBe(20);
  });

  it('gives preview points from the QB to the landing spot', () => {
    const pts = arcPoints(th, 11);
    expect(pts).toHaveLength(11);
    expect(pts[0].x).toBe(0);
    expect(pts[10].x).toBeCloseTo(20);
  });
});

describe('catching', () => {
  const wr = { x: 40, y: 20 };

  it('receiver drifts toward the ball but only so far', () => {
    const far = { x: 50, y: 20 };
    expect(adjustReceiver(wr, far, 2, 6, 0.1).x).toBeCloseTo(40.6);
    expect(adjustReceiver(wr, far, 2, 6, 5).x).toBeCloseTo(42);
  });

  it('receiver stops on the ball if it is close', () => {
    const near = { x: 41, y: 20 };
    expect(adjustReceiver(wr, near, 2, 6, 5).x).toBeCloseTo(41);
  });

  it('catches inside the radius, not outside', () => {
    expect(isCatch(wr, { x: 41.4, y: 20 }, 1.5)).toBe(true);
    expect(isCatch(wr, { x: 41.6, y: 20 }, 1.5)).toBe(false);
  });
});
