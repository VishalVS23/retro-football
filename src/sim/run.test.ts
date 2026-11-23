import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { formation } from './formation';
import { PLAYS, RB, routePath, startRunner, stepRunner } from './routes';
import { canTackle, checkTackles, remember, startCarrier, stepPursuers, type Pursuer } from './carry';
import { laneSteer, pathYAt, reachedHandoff, stepRunRusher } from './run';
import { simulateRun } from './runSim';

const dt = 1 / 60;
const play = (name: string) => PLAYS.find((p) => p.name === name)!;

describe('running back', () => {
  it('lines up behind the QB and is the 4th skill player', () => {
    const f = formation(45);
    expect(f.skill).toHaveLength(4);
    expect(f.skill[RB]).toBe(f.rb);
    expect(f.rb.pos.x).toBeLessThan(f.qb.x - 2);
  });

  it('gets the handoff at the second point of his run path, right next to the QB', () => {
    const f = formation(45);
    const path = routePath(f.rb.pos, play('Dive').routes[RB], f.rb.towardMiddle);
    let r = startRunner(path);
    let t = 0;
    while (!reachedHandoff(r)) {
      r = stepRunner(r, path, dt, feel.routes);
      t += dt;
    }
    expect(t).toBeGreaterThan(0.3);
    expect(t).toBeLessThan(1);
    expect(Math.hypot(r.pos.x - f.qb.x, r.pos.y - f.qb.y)).toBeLessThan(1.5);
  });

  it('the Toss goes round the outside (bottom side)', () => {
    const f = formation(45);
    const path = routePath(f.rb.pos, play('Toss').routes[RB], f.rb.towardMiddle);
    expect(pathYAt(path, 45)).toBeGreaterThan(f.rush[1].y + 3); // outside the bottom rusher at the line
  });
});

describe('lane steering', () => {
  const path = [{ x: 40, y: 20 }, { x: 44, y: 24 }, { x: 50, y: 24 }];
  it('reads the path between points', () => {
    expect(pathYAt(path, 42)).toBeCloseTo(22);
    expect(pathYAt(path, 30)).toBe(20);
    expect(pathYAt(path, 60)).toBe(24);
  });
  it('steers toward the lane, and lets go once past the end of the path', () => {
    expect(laneSteer({ x: 42, y: 20 }, path, 2, 1.5)).toBe(1); // lane is well below him
    expect(laneSteer({ x: 46, y: 24 }, path, 2, 1.5)).toBe(0); // in the lane
    expect(laneSteer({ x: 47, y: 26 }, path, 2, 1.5)).toBeLessThan(0); // below the lane: steer up
    expect(laneSteer({ x: 51, y: 10 }, path, 2, 1.5)).toBe(0); // past the end: your thumb only
  });
});

describe('run blocking', () => {
  const p = { driveSpeed: 1.2, freeSpeed: 6 };
  it('a held lineman is pushed back, then goes after the RB once he sheds the block', () => {
    const r0 = { pos: { x: 46, y: 24 }, shedAt: 1 };
    const held = stepRunRusher(r0, { x: 42, y: 27 }, 0.5, 0.5, p);
    expect(held.pos.x).toBeCloseTo(46.6);
    expect(held.pos.y).toBeCloseTo(23.4); // pushed away from the RB (he's below)
    expect(stepRunRusher(r0, { x: 42, y: 24 }, 1.2, 0.5, p).pos.x).toBeCloseTo(43);
  });

  it('a held defender is pushed along and cannot tackle; a reading one stands still but can', () => {
    const c = startCarrier({ x: 40, y: 20 });
    const held: Pursuer = { pos: { x: 40.5, y: 20 }, speed: 6, stunned: 0, held: 0.5 };
    const reading: Pursuer = { pos: { x: 40.5, y: 20 }, speed: 6, stunned: 0, wait: 0.5 };
    const tackle = { tackleReachYards: 1.1, brokenTackleChance: 0.15, jukeEvadeChance: 0.6, stunTime: 0.7 };
    expect(canTackle(held)).toBe(false);
    expect(checkTackles([held], c, () => 0.5, tackle).tackled).toBe(false);
    expect(canTackle(reading)).toBe(true);
    const [h, w] = stepPursuers([held, reading], remember([], 0, c, 1), 0.1, 0.1, {
      reactionTime: 0.2,
      leadTime: 0.35,
      runSpeed: 7,
      driveSpeed: 1.2,
    });
    expect(h.pos.x).toBeCloseTo(40.62);
    expect(h.held).toBeCloseTo(0.4);
    expect(w.pos.x).toBe(40.5);
    expect(w.wait).toBeCloseTo(0.4);
  });
});

describe('run play balance (headless, 300 runs each)', () => {
  const stats = (name: string, jukeYards: number) => {
    const gains = Array.from({ length: 300 }, (_, i) => simulateRun(play(name), i + 1, feel, jukeYards).yards);
    return {
      avg: gains.reduce((a, b) => a + b, 0) / gains.length,
      stuffed: gains.filter((g) => g <= 0).length / gains.length,
      long: gains.filter((g) => g >= 10).length / gains.length,
    };
  };
  for (const name of ['Dive', 'Toss']) {
    it(`${name}: gains a few yards on average, juking or not, with no runaway big plays`, () => {
      for (const juke of [0, 2.2]) {
        const s = stats(name, juke);
        expect(s.avg).toBeGreaterThan(1.2);
        expect(s.avg).toBeLessThan(6);
        // Beating one defender must not be a free touchdown: chasers are faster than the runner.
        expect(s.long).toBeLessThan(0.08);
      }
    });
    it(`${name}: a runner who never jukes is sometimes stuffed; juking avoids most of that`, () => {
      const lazy = stats(name, 0);
      const juker = stats(name, 2.2);
      expect(lazy.stuffed).toBeGreaterThan(0.05);
      expect(juker.stuffed).toBeLessThan(lazy.stuffed / 2);
    });
    it(`${name}: holding the steering one way the whole run is no exploit`, () => {
      // User 2026-11-21: a Toss with the steering held down gained 12+ yd every time (a defender in
      // front parked just out of tackling reach). Headless it was 15.8 yd and 100% went 10+.
      for (const steer of [-1, 1]) {
        const gains = Array.from({ length: 300 }, (_, i) => simulateRun(play(name), i + 1, feel, 0, 45, steer).yards);
        expect(gains.reduce((a, b) => a + b, 0) / gains.length).toBeLessThan(4);
        // 9% with the 2-man line; ~17% since the 4-man line (3h-a): nearly every tackle on these is the
        // corner's, and when he misses it's a long one. The average stays ~2.5 yd (lane ~2.2): a gamble, not an exploit.
        expect(gains.filter((g) => g >= 10).length / gains.length).toBeLessThan(0.2);
      }
    });
    it(`${name}: twitching up and down fast doesn't shake the defenders`, () => {
      // User 2026-11-21: spamming up/down after a catch scored every other time (defenders read the
      // runner's last split second, so their aim swung ~3 yd each twitch). Now no better than the lane.
      const twitch = (t: number) => (Math.floor(t / 0.15) % 2 ? 1 : -1);
      const avg = (steer?: (t: number) => number) =>
        Array.from({ length: 300 }, (_, i) => simulateRun(play(name), i + 1, feel, 0, 45, steer).yards).reduce((a, b) => a + b, 0) / 300;
      expect(avg(twitch)).toBeLessThanOrEqual(avg() + 0.5);
    });
  }
});
