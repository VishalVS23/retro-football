import { describe, expect, it } from 'vitest';
import { OPP_GOAL_X, TRY_X } from './drive';
import { fieldGoalDistance, inFieldGoalRange, kickDifficulty, meterPosition, resolveKick, type KickRules } from './kicking';

const rules: KickRules = {
  maxRangeYards: 55,
  nearYards: 20,
  nearGreen: 0.4,
  farGreen: 0.1,
  nearSweepTime: 1.2,
  farSweepTime: 0.6,
  powerLossRatio: 0.15,
};

describe('kicking', () => {
  it('field goal distance = line of scrimmage to the posts (+7 hold, +10 end zone)', () => {
    expect(fieldGoalDistance(OPP_GOAL_X - 20)).toBe(37); // from their 20
    expect(fieldGoalDistance(TRY_X)).toBe(19); // extra point from their 2
    expect(inFieldGoalRange(OPP_GOAL_X - 38, rules)).toBe(true); // 55 yd
    expect(inFieldGoalRange(OPP_GOAL_X - 39, rules)).toBe(false); // 56 yd
  });

  it('longer kicks: smaller green zone and a faster marker', () => {
    const near = kickDifficulty(19, rules);
    const mid = kickDifficulty(40, rules);
    const far = kickDifficulty(55, rules);
    expect(near).toEqual({ green: 0.4, sweepTime: 1.2 });
    expect(mid.green).toBeLessThan(near.green);
    expect(mid.green).toBeGreaterThan(far.green);
    expect(far.green).toBeCloseTo(0.1);
    expect(far.sweepTime).toBeCloseTo(0.6);
  });

  it('the marker starts at the left end and bounces end to end', () => {
    expect(meterPosition(0, 1)).toBe(-1);
    expect(meterPosition(0.5, 1)).toBeCloseTo(0);
    expect(meterPosition(1, 1)).toBeCloseTo(1);
    expect(meterPosition(1.5, 1)).toBeCloseTo(0);
    expect(meterPosition(2, 1)).toBeCloseTo(-1);
    for (let t = 0; t < 5; t += 0.07) expect(Math.abs(meterPosition(t, 0.8))).toBeLessThanOrEqual(1);
  });

  it('a dead-centre tap is good and straight from anywhere in range', () => {
    for (const d of [19, 35, 55]) expect(resolveKick(d, 0, rules)).toMatchObject({ result: 'good', aim: 0 });
  });

  it('inside the green = good; nearer the edge = nearer the upright', () => {
    const k = resolveKick(19, 0.3, rules);
    expect(k.result).toBe('good');
    expect(k.aim).toBeCloseTo(0.75);
  });

  it('outside the green hooks wide to that side (left = top of the screen)', () => {
    expect(resolveKick(19, -0.5, rules).result).toBe('wideLeft');
    expect(resolveKick(19, 0.5, rules).result).toBe('wideRight');
    // The same tap that's fine from close in misses from long range.
    expect(resolveKick(19, 0.2, rules).result).toBe('good');
    expect(resolveKick(55, 0.2, rules).result).toBe('wideRight');
  });

  it('an off-centre tap on a kick at the edge of range falls short', () => {
    expect(resolveKick(55, 0.08, rules).result).toBe('short'); // inside the green but not enough leg
    expect(resolveKick(50, 0.08, rules).result).toBe('good');
  });
});
