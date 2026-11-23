import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { PLAYS } from './routes';
import { simulatePass, type PassShot } from './passSim';
import { simulateRun } from './runSim';
import { startCoverage, stepCoverage } from './defense';
import {
  DEF_CALL_IDS,
  callWeights,
  cornerStart,
  coverParams,
  lb2BlitzChance,
  lb2Job,
  pickShell,
  safetyStart,
  shellWeights,
  linebacker2Start,
  linebackerStart,
  pickDefCall,
  stepBlitzer,
  teamAggression,
  type DefCallId,
  type DefSituation,
} from './defCalls';

const base: DefSituation = { down: 1, toGo: 10, ballX: 45, quarter: 1, timeLeft: 100, lead: 0, aggression: 0.5 };
const share = (s: DefSituation, id: DefCallId) => {
  const w = callWeights(s, feel);
  return w[id] / DEF_CALL_IDS.reduce((sum, k) => sum + w[k], 0);
};

describe('choosing the call', () => {
  it('every call comes up in an ordinary situation, normal man most often', () => {
    for (const id of DEF_CALL_IDS) expect(share(base, id)).toBeGreaterThan(0.1);
    expect(share(base, 'man')).toBeGreaterThan(share(base, 'press'));
  });

  it('3rd and long: mostly off man', () => {
    expect(share({ ...base, down: 3, toGo: 12 }, 'off')).toBeGreaterThan(share(base, 'off') * 1.5);
  });

  it('short yardage: more press and blitz, little off', () => {
    const s: DefSituation = { ...base, down: 3, toGo: 1 };
    expect(share(s, 'blitz')).toBeGreaterThan(share(base, 'blitz'));
    expect(share(s, 'press')).toBeGreaterThan(share(base, 'press'));
    expect(share(s, 'off')).toBeLessThan(share(base, 'off'));
  });

  it('red zone: never off man', () => {
    expect(share({ ...base, ballX: 95 }, 'off')).toBe(0);
  });

  it('protecting a late lead: more off man', () => {
    expect(share({ ...base, quarter: 4, timeLeft: 60, lead: 7 }, 'off')).toBeGreaterThan(share(base, 'off'));
  });

  it('aggressive teams blitz more than soft ones', () => {
    expect(share({ ...base, aggression: 1 }, 'blitz')).toBeGreaterThan(share({ ...base, aggression: 0 }, 'blitz') * 1.8);
  });

  it('the roll picks each call in proportion to its weight', () => {
    const seen: Record<string, number> = { man: 0, press: 0, off: 0, blitz: 0 };
    for (let i = 0; i < 1000; i++) seen[pickDefCall(base, feel, (i + 0.5) / 1000)]++;
    for (const id of DEF_CALL_IDS) expect(seen[id] / 1000).toBeCloseTo(share(base, id), 1);
  });

  it('team aggression is fixed per team, between 0 and 1, and differs between teams', () => {
    const all = Array.from({ length: 32 }, (_, i) => teamAggression(i));
    expect(teamAggression(5)).toBe(teamAggression(5));
    for (const a of all) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(0.6);
    expect(teamAggression(null)).toBe(0.5);
  });
});

describe('LB2 when our tight end stays in to block (3h-b)', () => {
  it('covers the TE when he runs a route; else drops or blitzes on one roll', () => {
    expect(lb2Job(false, 0, 1)).toBe('cover');
    expect(lb2Job(true, 0.2, 0.3)).toBe('blitz');
    expect(lb2Job(true, 0.4, 0.3)).toBe('drop');
  });

  it('their coach decides: aggressive coaches and short yardage blitz more, a late lead less; never always', () => {
    const c = (s: DefSituation) => lb2BlitzChance(s, feel);
    expect(c(base)).toBeGreaterThan(0.1);
    expect(c({ ...base, aggression: 1 })).toBeGreaterThan(c({ ...base, aggression: 0 }) + 0.1);
    expect(c({ ...base, down: 3, toGo: 1 })).toBeGreaterThan(c(base));
    expect(c({ ...base, quarter: 4, timeLeft: 60, lead: 7 })).toBeLessThan(c(base));
    for (const a of [0, 0.5, 1]) for (const toGo of [1, 5, 15]) expect(c({ ...base, aggression: a, down: 3, toGo })).toBeLessThanOrEqual(feel.defCalls.lb2BlitzMax);
  });

  it('LB2 lines up over the tight end, a few yards deep', () => {
    const p = linebacker2Start(feel, 40);
    expect(p.x).toBeGreaterThan(41);
    expect(p.y).toBeGreaterThan(linebackerStart('man', feel, 40).y + 2);
  });
});

describe('safety looks (3h-c)', () => {
  it('both looks come up; long yardage and a late lead = more two deep, short yardage and the red zone = more robber', () => {
    const share = (s: DefSituation) => {
      const w = shellWeights(s, feel);
      return w.twoDeep / (w.twoDeep + w.robber);
    };
    expect(share(base)).toBeGreaterThan(0.3);
    expect(share(base)).toBeLessThan(0.7);
    expect(share({ ...base, down: 3, toGo: 12 })).toBeGreaterThan(share(base));
    expect(share({ ...base, quarter: 4, timeLeft: 60, lead: 7 })).toBeGreaterThan(share(base));
    expect(share({ ...base, down: 3, toGo: 1 })).toBeLessThan(share(base));
    expect(share({ ...base, ballX: 100 })).toBeLessThan(share(base));
    expect(pickShell(base, feel, 0)).toBe('twoDeep');
    expect(pickShell(base, feel, 0.999)).toBe('robber');
  });

  it('readable before the snap: two deep = both safeties deep and wide; robber = one deep in the middle, one shallow', () => {
    const [a, b] = [safetyStart(feel, 40, 'twoDeep', 0), safetyStart(feel, 40, 'twoDeep', 1)];
    expect(a.y).toBeLessThan(b.y - 10);
    expect(a.x).toBe(b.x);
    const [deep, robber] = [safetyStart(feel, 40, 'robber', 0), safetyStart(feel, 40, 'robber', 1)];
    expect(deep.y).toBeCloseTo(robber.y);
    expect(robber.x).toBeLessThan(deep.x - 3);
  });
});

describe('how each call lines up and plays', () => {
  it('press corners line up close, off corners far, normal in between; the blitzing LB creeps up', () => {
    const wr = { x: 40, y: 10 };
    expect(cornerStart('press', feel, wr).x - wr.x).toBeLessThan(cornerStart('man', feel, wr).x - wr.x);
    expect(cornerStart('off', feel, wr).x - wr.x).toBeGreaterThan(cornerStart('man', feel, wr).x - wr.x + 2);
    expect(linebackerStart('blitz', feel, 40).x).toBeLessThan(linebackerStart('man', feel, 40).x - 2);
  });

  it('normal man = the old coverage values', () => {
    const { cb } = coverParams('man', feel, 40, false);
    expect(cb.cushionYards).toBe(feel.defense.cbCushionYards);
    expect(cb.reactionTime).toBe(feel.defense.cbReactionTime);
    expect(cb.cushionFloorYards).toBe(0);
  });

  it('an off-man corner keeps his floor cushion over a receiver who stands still', () => {
    const { cb } = coverParams('off', feel, 40, false);
    const wr = { x: 40, y: 10 };
    let c = startCoverage(cornerStart('off', feel, wr), wr);
    for (let i = 0; i < 300; i++) c = stepCoverage(c, wr, 1 / 60, cb);
    expect(c.pos.x - wr.x).toBeGreaterThan(feel.defCalls.offFloorYards * 0.5);
  });

  it('the blitzer waits a moment after the snap, then runs at the QB at blitz speed', () => {
    const at = { x: 42, y: 26 };
    const qb = { x: 35, y: 26 };
    expect(stepBlitzer(at, qb, feel.defCalls.blitzDelay / 2, 0.1, feel)).toEqual(at);
    const moved = stepBlitzer(at, qb, 1, 0.1, feel);
    expect(at.x - moved.x).toBeCloseTo(feel.defCalls.blitzSpeed * 0.1, 5);
  });
});

// ---------- Balance: every call has a weakness (measured headless, average players, well-led throws) ----------

const play = (name: string) => PLAYS.find((p) => p.name === name)!;
function catches(name: string, shot: PassShot, call: DefCallId) {
  let n = 0;
  for (let s = 1; s <= 200; s++) {
    const r = simulatePass(play(name), shot, s * 7919, feel, 35, { call, shell: 'robber' }); // one deep, as tuned (3h-c)
    if (!r.sacked && r.result === 'catch') n++;
  }
  return n / 2;
}
const sacks = (name: string, shot: PassShot, call: DefCallId) => {
  let n = 0;
  for (let s = 1; s <= 50; s++) if (simulatePass(play(name), shot, s * 7919, feel, 35, { call, shell: 'robber' }).sacked) n++;
  return n * 2;
};
const SLANT_QUICK: PassShot = { to: 0, throwAt: 0.5, lead: 1 };
const HITCH: PassShot = { to: 0, throwAt: 1.1, lead: 1 };
const CURL: PassShot = { to: 0, throwAt: 1.5, lead: 1 };
const GO: PassShot = { to: 0, throwAt: 1.1, lead: 1 };

describe('balance: defensive calls', () => {
  it('press man: short routes get harder, the deep ball easier', () => {
    expect(catches('Curls', CURL, 'press')).toBeLessThan(catches('Curls', CURL, 'man') - 10);
    expect(catches('Hitch Slant', HITCH, 'press')).toBeLessThan(catches('Hitch Slant', HITCH, 'man'));
    expect(catches('Verticals', GO, 'press')).toBeGreaterThan(catches('Verticals', GO, 'man') + 5);
  }, 60000);

  it('off man: hitches open up, the deep ball gets hard (but never impossible)', () => {
    expect(catches('Hitch Slant', HITCH, 'off')).toBeGreaterThan(catches('Hitch Slant', HITCH, 'man') + 8);
    const go = catches('Verticals', GO, 'off');
    expect(go).toBeLessThan(catches('Verticals', GO, 'man') - 15);
    expect(go).toBeGreaterThan(20);
  }, 60000);

  it('blitz: hold the ball and you get sacked; throw quick or to the RB and it works', () => {
    expect(sacks('Verticals', { to: 0, throwAt: 1.7, lead: 1 }, 'blitz')).toBeGreaterThan(90);
    expect(sacks('Hitch Slant', HITCH, 'blitz')).toBe(0);
    expect(catches('Slants', SLANT_QUICK, 'blitz')).toBeGreaterThanOrEqual(catches('Slants', SLANT_QUICK, 'man') - 5);
    expect(catches('Post Corner', { to: 3, throwAt: 0.7, lead: 1 }, 'blitz')).toBeGreaterThan(85); // RB flat
  }, 60000);

  it('blitz: stuffs the Dive, but the Toss gets outside it', () => {
    const avg = (name: string, call: DefCallId) => {
      let y = 0;
      for (let s = 1; s <= 200; s++) y += simulateRun(play(name), s * 7919, feel, 2.5, 45, undefined, call).yards;
      return y / 200;
    };
    expect(avg('Dive', 'blitz')).toBeLessThan(avg('Dive', 'man') - 1);
    expect(avg('Toss', 'blitz')).toBeGreaterThanOrEqual(avg('Toss', 'man') - 0.2);
  }, 60000);
});
