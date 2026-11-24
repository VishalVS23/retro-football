import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { jumpTarget, leans, mainLean, newScouting, playKey, recordSnap, sanitizeScouting, teamAdjustSpeed, type ScoutedSnap } from './scouting';
import { callWeights, shellWeights, type DefSituation } from './defCalls';
import { simulatePass } from './passSim';
import { PLAYS } from './routes';

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

describe('sitting on a play (A-b)', () => {
  const slant = (y = 20): ScoutedSnap => ({ play: 'Slants', run: false, air: 6, y, to: 0, caught: true, yards: 7 });
  it('after a play is called again and again to the same target, he keys on it (a fast coach sooner)', () => {
    expect(playKey(many([slant()]), 0.5, feel)).toBeNull();
    const k = playKey(many([slant(18), slant(22), slant(20)]), 0.5, feel);
    expect(k).toMatchObject({ play: 'Slants', to: 0 });
    expect(k!.dx).toBeCloseTo(6);
    expect(k!.y).toBeGreaterThan(19.5);
    expect(k!.y).toBeLessThan(20.5);
    expect(playKey(many([slant(), mid, slant()]), 1, feel)).not.toBeNull();
    expect(playKey(many([slant(), mid, slant()]), 0, feel)).toBeNull();
  });
  it('mixing it up (or going elsewhere) lets it go; the RB is never keyed', () => {
    expect(playKey(many([slant(), slant(), slant(), mid, run, deep, mid, run]), 1, feel)).toBeNull();
    const rb: ScoutedSnap = { play: 'Post Corner', run: false, air: 2, y: 30, to: 3, caught: true, yards: 4 };
    expect(playKey(many([rb, rb, rb, rb]), 1, feel)).toBeNull();
  });
  it('the jumper goes part of the way toward the spot', () => {
    const t = jumpTarget({ x: 40, y: 10 }, { x: 50, y: 20 }, feel);
    expect(t.x).toBeCloseTo(40 + 10 * feel.adjust.jumpBlend);
  });
  it('old memories (before A-b) still load', () => {
    const s = many([slant()]);
    delete s.landings;
    expect(sanitizeScouting(JSON.parse(JSON.stringify(s))).landings).toEqual({});
  });
});

describe('balance: a defender sitting on a play (A-b)', () => {
  const rate = (to: number, throwAt: number, jump?: { cover: number; spot: { x: number; y: number } }) => {
    let c = 0;
    let lx = 0, ly = 0;
    for (let s = 1; s <= 120; s++) {
      const r = simulatePass(PLAYS.find((p) => p.name === 'Slants')!, { to, throwAt, lead: 1 }, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards: 2.5 }, call: 'man', shell: 'twoDeep', jump });
      if (!r.sacked && r.result === 'catch') c++;
      lx += r.landing!.x;
      ly += r.landing!.y;
    }
    return { pct: (c / 120) * 100, spot: { x: lx / 120, y: ly / 120 } };
  };
  it('the keyed throw gets clearly harder (never hopeless); the other slant on the same play does not', () => {
    const honest = rate(0, 0.5);
    const jump = { cover: 0, spot: honest.spot };
    const keyed = rate(0, 0.5, jump).pct;
    expect(keyed).toBeLessThan(honest.pct - 12);
    expect(keyed).toBeGreaterThan(20);
    expect(Math.abs(rate(2, 0.5, jump).pct - rate(2, 0.5).pct)).toBeLessThan(5);
  }, 60000);
});
