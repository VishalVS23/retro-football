import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { leans, mainLean, newScouting, recordSnap, sanitizeScouting, teamAdjustSpeed, type ScoutedSnap } from './scouting';
import { callWeights, shellWeights, type DefSituation } from './defCalls';

const run: ScoutedSnap = { play: 'Dive', run: true };
const quick: ScoutedSnap = { play: 'Slants', run: false, air: 4, to: 0, caught: true, yards: 6 };
const deep: ScoutedSnap = { play: 'Verticals', run: false, air: 25, to: 2, caught: false };
const mid: ScoutedSnap = { play: 'Curls', run: false, air: 11, to: 1, caught: true, yards: 12 };
const many = (snaps: ScoutedSnap[]) => snaps.reduce((s, x) => recordSnap(s, x, feel), newScouting());

describe('scouting memory (A-a)', () => {
  it('notes play, run / pass, short / deep and targets; catches and yards are game totals', () => {
    const s = many([quick, quick, deep]);
    expect(s.plays.Slants).toBeGreaterThan(s.plays.Verticals * 0 + 1); // two Slants, faded once
    expect(s.pass).toBeGreaterThan(2);
    expect(s.run).toBe(0);
    expect(s.short).toBeGreaterThan(1);
    expect(s.deep).toBe(1);
    expect(s.catches).toEqual([2, 0, 0, 0, 0]);
    expect(s.yards[0]).toBe(12);
    expect(s.targets[2]).toBe(1);
  });

  it('old snaps fade: after a habit stops, he slowly lets it go', () => {
    let s = many(Array(6).fill(run));
    const before = leans(s, feel).run;
    for (let i = 0; i < 6; i++) s = recordSnap(s, mid, feel);
    expect(before).toBeGreaterThan(0.7);
    expect(leans(s, feel).run).toBe(0);
  });

  it('an ordinary mix leans on nothing; a couple of snaps prove little; each habit shows', () => {
    expect(leans(many([run, mid, quick, run, mid, deep, mid, run]), feel)).toEqual({ run: 0, short: 0, deep: 0 });
    expect(leans(many([run]), feel).run).toBeLessThan(0.3);
    expect(leans(many(Array(6).fill(run)), feel).run).toBeGreaterThan(0.7);
    expect(leans(many(Array(6).fill(quick)), feel).short).toBeGreaterThan(0.7);
    expect(leans(many(Array(6).fill(deep)), feel).deep).toBeGreaterThan(0.7);
    expect(mainLean(leans(many(Array(6).fill(deep)), feel), feel)).toBe('deep');
    expect(mainLean(leans(newScouting(), feel), feel)).toBeNull();
  });

  it('a damaged or missing memory comes back empty; a good one survives', () => {
    expect(sanitizeScouting(undefined)).toEqual(newScouting());
    expect(sanitizeScouting({ plays: {}, run: 'x' })).toEqual(newScouting());
    const s = many([quick, run]);
    expect(sanitizeScouting(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('coaches adjust at different speeds, fixed per team', () => {
    const all = Array.from({ length: 32 }, (_, i) => teamAdjustSpeed(i));
    expect(teamAdjustSpeed(3)).toBe(teamAdjustSpeed(3));
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(0.6);
  });
});

describe('the coach leans into what we keep doing', () => {
  const base: DefSituation = { down: 1, toGo: 10, ballX: 45, quarter: 1, timeLeft: 100, lead: 0, aggression: 0.5 };
  const share = (s: DefSituation, ids: string[]) => {
    const w = callWeights(s, feel) as Record<string, number>;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    return ids.reduce((a, id) => a + w[id], 0) / total;
  };
  const with_ = (l: Partial<{ run: number; short: number; deep: number }>, speed = 0.5): DefSituation => ({ ...base, leans: { run: 0, short: 0, deep: 0, ...l }, adjustSpeed: speed });

  it('no habit = his normal mix', () => {
    expect(callWeights(with_({}), feel)).toEqual(callWeights(base, feel));
  });
  it('runs -> more blitz and press, more robber', () => {
    expect(share(with_({ run: 1 }), ['blitz', 'press'])).toBeGreaterThan(share(base, ['blitz', 'press']) + 0.15);
    const sw = (s: DefSituation) => shellWeights(s, feel).robber / (shellWeights(s, feel).robber + shellWeights(s, feel).twoDeep);
    expect(sw(with_({ run: 1 }))).toBeGreaterThan(sw(base) + 0.15);
  });
  it('quick short passes -> more press and Cover 2; deep shots -> more off man and Cover 2, more two deep', () => {
    expect(share(with_({ short: 1 }), ['press', 'cover2'])).toBeGreaterThan(share(base, ['press', 'cover2']) + 0.15);
    expect(share(with_({ deep: 1 }), ['off', 'cover2'])).toBeGreaterThan(share(base, ['off', 'cover2']) + 0.15);
  });
  it('a fast-adjusting coach leans harder than a slow one', () => {
    expect(share(with_({ run: 1 }, 1), ['blitz'])).toBeGreaterThan(share(with_({ run: 1 }, 0), ['blitz']) + 0.05);
  });
});
