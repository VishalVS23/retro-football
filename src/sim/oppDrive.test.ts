import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { OPP_GOAL_X, OWN_GOAL_X } from './drive';
import { oppFieldGoalChance, simulateOppDrive, type OppDrive, type OppDriveSituation } from './oppDrive';
import { createRng } from './rng';

const r = feel.oppDrive;
const early: OppDriveSituation = { quarter: 1, timeLeft: 120, quarterLength: 120, us: 0, them: 0 };
/** Their 25 (they drive toward our goal, -x). */
const THEIR_25 = OPP_GOAL_X - 25;

function many(startX: number, n = 2000, sit = early, rules = r): OppDrive[] {
  const rng = createRng(1234);
  return Array.from({ length: n }, () => simulateOppDrive(startX, sit, rules, rng));
}
const avg = (ds: OppDrive[], f: (d: OppDrive) => number) => ds.reduce((s, d) => s + f(d), 0) / ds.length;
const share = (ds: OppDrive[], res: OppDrive['result']) => ds.filter((d) => d.result === res).length / ds.length;

describe('simulateOppDrive', () => {
  it('is repeatable with the same seed', () => {
    const a = simulateOppDrive(THEIR_25, early, r, createRng(7));
    const b = simulateOppDrive(THEIR_25, early, r, createRng(7));
    expect(a).toEqual(b);
  });

  it('from their 25: about 2 points a drive, a touchdown roughly 1 in 4, mostly punts otherwise', () => {
    const ds = many(THEIR_25);
    expect(avg(ds, (d) => d.points)).toBeGreaterThan(1.4);
    expect(avg(ds, (d) => d.points)).toBeLessThan(2.6);
    expect(share(ds, 'touchdown')).toBeGreaterThan(0.17);
    expect(share(ds, 'touchdown')).toBeLessThan(0.32);
    expect(share(ds, 'fieldGoal')).toBeGreaterThan(0.07);
    expect(share(ds, 'punt')).toBeGreaterThan(0.3);
    const turnovers = share(ds, 'interception') + share(ds, 'fumble');
    expect(turnovers).toBeGreaterThan(0.05);
    expect(turnovers).toBeLessThan(0.2);
  });

  it('a few plays and under a minute of clock on average', () => {
    const ds = many(THEIR_25);
    expect(avg(ds, (d) => d.plays)).toBeGreaterThan(4);
    expect(avg(ds, (d) => d.plays)).toBeLessThan(9);
    expect(avg(ds, (d) => d.seconds)).toBeLessThan(60);
  });

  it('better field position scores more', () => {
    const deep = avg(many(OPP_GOAL_X - 10), (d) => d.points);
    const mid = avg(many(THEIR_25), (d) => d.points);
    const short = avg(many(OWN_GOAL_X + 35), (d) => d.points); // our 35 (after a turnover)
    expect(deep).toBeLessThan(mid);
    expect(mid).toBeLessThan(short);
    expect(short).toBeGreaterThan(3);
  });

  it('a stronger offense scores more', () => {
    const weak = avg(many(THEIR_25, 2000, early, { ...r, strength: 0.8 }), (d) => d.points);
    const strong = avg(many(THEIR_25, 2000, early, { ...r, strength: 1.2 }), (d) => d.points);
    expect(strong).toBeGreaterThan(weak + 0.5);
  });

  it('results add up: scores give us the ball at our 25, other results somewhere on the field', () => {
    for (const d of many(THEIR_25, 500)) {
      if (d.result === 'touchdown') {
        expect(d.endX).toBe(OWN_GOAL_X);
        expect(d.points).toBe(d.extraPointGood ? 7 : 6);
      }
      if (d.result === 'fieldGoal') expect(d.points).toBe(3);
      if (d.result === 'touchdown' || d.result === 'fieldGoal') expect(d.ourStartX).toBe(OWN_GOAL_X + 25);
      else expect(d.points).toBe(0);
      expect(d.ourStartX).toBeGreaterThan(OWN_GOAL_X);
      expect(d.ourStartX).toBeLessThan(OPP_GOAL_X);
      expect(d.yards).toBe(d.startX - d.endX);
      expect(d.plays).toBeGreaterThan(0);
    }
  });

  it('a punt never puts us inside our own goal line (touchback = our 20)', () => {
    const punts = many(THEIR_25, 2000).filter((d) => d.result === 'punt');
    expect(punts.length).toBeGreaterThan(100);
    for (const d of punts) expect(d.ourStartX).toBeGreaterThanOrEqual(OWN_GOAL_X + 1);
  });

  it('a missed field goal: our ball at the kick spot, or our 20 if that is further out', () => {
    const misses = many(OWN_GOAL_X + 40, 3000).filter((d) => d.result === 'missedFieldGoal');
    expect(misses.length).toBeGreaterThan(0);
    for (const d of misses) expect(d.ourStartX).toBe(Math.max(d.endX + 7, OWN_GOAL_X + 20));
  });

  it('never runs past the end of the half', () => {
    const sit: OppDriveSituation = { ...early, quarter: 2, timeLeft: 20 };
    const ds = many(THEIR_25, 500, sit);
    for (const d of ds) expect(d.seconds).toBeLessThanOrEqual(20);
    expect(share(ds, 'endOfHalf')).toBeGreaterThan(0.3);
  });

  it('can carry on from Q1 into Q2', () => {
    const sit: OppDriveSituation = { ...early, timeLeft: 10 };
    expect(many(THEIR_25, 300, sit).some((d) => d.seconds > 10)).toBe(true);
  });

  it('notes a big play only for gains of 20+', () => {
    for (const d of many(THEIR_25, 500)) if (d.bigPlay) expect(d.bigPlay.yards).toBeGreaterThanOrEqual(20);
  });
});

describe('clock smarts', () => {
  const q4 = (timeLeft: number, us: number, them: number): OppDriveSituation => ({ quarter: 4, timeLeft, quarterLength: 120, us, them });

  it('behind late in Q4: hurry-up, quicker plays than a normal drive', () => {
    const hurry = many(THEIR_25, 1000, q4(60, 14, 7)); // CPU down 7
    expect(hurry.every((d) => d.note === 'hurryUp')).toBe(true);
    const normal = many(THEIR_25, 1000);
    expect(avg(hurry, (d) => d.seconds / d.plays)).toBeLessThan(avg(normal, (d) => d.seconds / d.plays) - 1);
  });

  it('ahead in Q4: they run the clock down (longer plays)', () => {
    const milk = many(THEIR_25, 1000, q4(120, 7, 14));
    expect(milk.some((d) => d.note === 'runClock')).toBe(true);
    const normal = many(THEIR_25, 1000);
    expect(avg(milk, (d) => d.seconds / d.plays)).toBeGreaterThan(avg(normal, (d) => d.seconds / d.plays) + 1);
  });

  it('ahead with little time left: they kneel it out (game over, no points)', () => {
    for (const d of many(THEIR_25, 200, q4(30, 7, 14))) {
      expect(d.result).toBe('endOfHalf');
      expect(d.note).toBe('kneel');
      expect(d.seconds).toBe(30);
      expect(d.points).toBe(0);
    }
  });

  it('nothing doing at the end of Q2 from deep: they kneel out the half', () => {
    const d = simulateOppDrive(THEIR_25, { ...early, quarter: 2, timeLeft: 15 }, r, createRng(3));
    expect(d).toMatchObject({ result: 'endOfHalf', note: 'kneel', seconds: 15 });
  });

  it('in range on the last snap of the half: they kick the field goal', () => {
    // Our 20 (35-yard try), 5 seconds before halftime.
    const ds = many(OWN_GOAL_X + 20, 300, { ...early, quarter: 2, timeLeft: 5 });
    for (const d of ds) expect(['fieldGoal', 'missedFieldGoal']).toContain(d.result);
    expect(share(ds, 'fieldGoal')).toBeGreaterThan(0.8);
  });

  it('down 7 on the last snap of the game: no field goal, they go for the end zone', () => {
    const ds = many(OWN_GOAL_X + 20, 300, q4(5, 14, 7));
    expect(ds.some((d) => d.result === 'fieldGoal' || d.result === 'missedFieldGoal')).toBe(false);
  });

  it('balance across all situations stays sensible (1000 drives each)', () => {
    for (const sit of [early, q4(120, 0, 0), q4(60, 14, 7), q4(120, 7, 14)]) {
      const ds = many(THEIR_25, 1000, sit);
      const pts = avg(ds, (d) => d.points);
      expect(pts).toBeGreaterThan(0.8);
      expect(pts).toBeLessThan(3);
    }
  });
});

describe('oppFieldGoalChance', () => {
  it('sure from close in, harder further out, none past range', () => {
    expect(oppFieldGoalChance(25, r)).toBe(r.fgSureChance);
    expect(oppFieldGoalChance(45, r)).toBeLessThan(r.fgSureChance);
    expect(oppFieldGoalChance(45, r)).toBeGreaterThan(r.fgLongChance);
    expect(oppFieldGoalChance(r.fgRangeYards + 1, r)).toBe(0);
  });
});
