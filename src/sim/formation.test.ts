import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { FIELD_WIDTH } from './field';
import { FORMATION_IDS, formation, nextFormation, playFor } from './formation';
import { PLAYS, ROUTES, TE, nextRoute, routePath } from './routes';
import { simulatePass } from './passSim';
import { simulateRun } from './runSim';
import { zoneJobs } from './zone';
import { linebacker2Start, lb2ZoneSpot, spreadCheckOn, tripsCheckOn, tripsCornerJob } from './defCalls';
import type { DefCallId, ShellId } from './defCalls';

const mid = FIELD_WIDTH / 2;
const play = (name: string) => PLAYS.find((p) => p.name === name)!;

describe('formations (F-a)', () => {
  it('FLIP mirrors NORMAL top <-> bottom: every player, every route', () => {
    const a = formation(40), b = formation(40, 'flip');
    a.skill.forEach((s, i) => {
      expect(b.skill[i].pos.y).toBeCloseTo(2 * mid - s.pos.y);
      expect(b.skill[i].pos.x).toBeCloseTo(s.pos.x);
      const pa = routePath(s.pos, play('Crossers').routes[i], s.towardMiddle);
      const pb = routePath(b.skill[i].pos, play('Crossers').routes[i], b.skill[i].towardMiddle);
      pa.forEach((p, k) => expect(pb[k].y).toBeCloseTo(2 * mid - p.y));
    });
    a.rush.forEach((r, i) => expect(b.rush[i].y).toBeCloseTo(2 * mid - r.y));
    a.block.forEach((r, i) => expect(b.block[i].y).toBeCloseTo(2 * mid - r.y));
    expect(b.qb).toEqual(a.qb);
  });

  it('the defense reads the sides: LB2 over the TE, his hook toward the strength, zone landmarks mirrored', () => {
    const b = formation(40, 'flip');
    expect(linebacker2Start(feel, 40, b.sides).y).toBeCloseTo(2 * mid - linebacker2Start(feel, 40).y);
    expect(lb2ZoneSpot(feel, 40, b.sides).y).toBeCloseTo(2 * mid - lb2ZoneSpot(feel, 40).y);
    const n = zoneJobs('cover3', feel, 40), f = zoneJobs('cover3', feel, 40, 1);
    n.forEach((j, i) => expect(f[i].spot.y).toBeCloseTo(2 * mid - j.spot.y));
    // Cover 2: each half stays with the safety on that side.
    const c2 = zoneJobs('cover2', feel, 40, 1);
    expect(c2[5].spot.y).toBeLessThan(mid);
  });

  it('the button cycles through every formation and back', () => {
    let id = FORMATION_IDS[0];
    for (let i = 0; i < FORMATION_IDS.length; i++) id = nextFormation(id);
    expect(id).toBe(FORMATION_IDS[0]);
  });

  it('balance: FLIP plays like NORMAL (mirrored), passes and runs', () => {
    const looks: [DefCallId, ShellId][] = [['man', 'twoDeep'], ['cover3', 'robber'], ['cover2', 'twoDeep']];
    const shots: [string, number, number][] = [['Slants', 0, 0.5], ['Curls', 0, 1.5], ['TE Seam', 4, 1.2], ['Verticals', 2, 1.1]];
    for (const [call, shell] of looks)
      for (const [name, to, t] of shots) {
        const rate = (f: 'normal' | 'flip') => {
          let c = 0;
          for (let s = 1; s <= 80; s++) {
            const r = simulatePass(play(name), { to, throwAt: t, lead: 1 }, s * 7919, feel, 35, { qb: null, call, shell, formation: f });
            if (!r.sacked && r.result === 'catch') c++;
          }
          return c;
        };
        expect(Math.abs(rate('normal') - rate('flip')), `${call} ${name}`).toBeLessThan(12);
      }
    const runs = (f: 'normal' | 'flip') => {
      let y = 0;
      for (const n of ['Dive', 'Toss']) for (let s = 1; s <= 80; s++) y += simulateRun(play(n), s * 7919, feel, 2.5, 45, undefined, 'man', {}, 'twoDeep', undefined, f).yards;
      return y / 160;
    };
    expect(Math.abs(runs('normal') - runs('flip'))).toBeLessThan(0.2);
  }, 120000);
});

describe('TRIPS (F-b)', () => {
  it('three receivers on top, the TE alone on the bottom; the third runs his routes from inside', () => {
    const f = formation(40, 'trips');
    expect(f.wrs.every((w) => w.pos.y < mid)).toBe(true);
    expect(f.wrs[0].pos.y).toBeLessThan(f.wrs[1].pos.y);
    expect(f.wrs[1].pos.y).toBeLessThan(f.wrs[2].pos.y);
    expect(f.te.pos.y).toBeGreaterThan(mid);
    expect(f.wrs[2].towardMiddle).toBe(1);
  });

  it('the Trips check: man calls only, not with a bracket; the corner stays home on the TE side', () => {
    expect(tripsCheckOn('trips', 'man', null)).toBe(true);
    expect(tripsCheckOn('trips', 'cover3', null)).toBe(false);
    expect(tripsCheckOn('trips', 'man', 0)).toBe(false);
    expect(tripsCheckOn('normal', 'man', null)).toBe(false);
    const job = tripsCornerJob(feel, 40, formation(40, 'trips').sides);
    expect(job.spot.y).toBeGreaterThan(mid);
  });

  it('balance: TRIPS passes about like NORMAL overall (better vs zone, worse vs man), runs about the same', () => {
    const looks: [DefCallId, ShellId][] = [['man', 'twoDeep'], ['man', 'robber'], ['cover3', 'robber'], ['cover2', 'twoDeep']];
    // Every pass play, every target, at the time that route is usually thrown.
    const T: Record<string, number> = { Slant: 0.5, Out: 1.0, Go: 1.1, Post: 0.8, Corner: 0.8, Dig: 1.5, Drag: 1.0, Hitch: 1.1, Curl: 1.5, Flat: 1.0, Check: 1.3, Wheel: 1.4, Seam: 1.2 };
    const shots: [string, number, number][] = [];
    for (const p of PLAYS) if (!p.run) p.routes.forEach((r, i) => !r.block && T[r.name] !== undefined && shots.push([p.name, i, T[r.name]]));
    const yards = (f: 'normal' | 'trips') => {
      let g = 0, n = 0;
      for (const [call, shell] of looks)
        for (const [name, to, t] of shots)
          for (let s = 1; s <= 25; s++) {
            const r = simulatePass(play(name), { to, throwAt: t, lead: 1 }, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards: 2.5 }, call, shell, formation: f });
            g += r.sacked ? -6 : r.result === 'catch' ? r.gain ?? 0 : 0;
            n++;
          }
      return g / n;
    };
    const a = yards('normal'), b = yards('trips');
    expect(Math.abs(b - a) / a).toBeLessThan(0.1);
    const runs = (f: 'normal' | 'trips') => {
      let y = 0;
      for (const [call, shell] of looks) for (const n of ['Dive', 'Toss']) for (let s = 1; s <= 60; s++) y += simulateRun(play(n), s * 7919, feel, 2.5, 45, undefined, call, {}, shell, undefined, f).yards;
      return y / (looks.length * 120);
    };
    expect(Math.abs(runs('trips') - runs('normal'))).toBeLessThan(0.35);
  }, 240000);
});

describe('SPREAD (F-c2)', () => {
  it('two by two: the third receiver in the bottom slot, the TE split out wide at the bottom', () => {
    const f = formation(40, 'spread');
    expect(f.wrs[0].pos.y).toBeLessThan(mid);
    expect(f.wrs[1].pos.y).toBeLessThan(mid);
    expect(f.wrs[2].pos.y).toBeGreaterThan(mid);
    expect(f.te.pos.y).toBeGreaterThan(f.wrs[2].pos.y + 3);
    expect(f.te.pos.y - mid).toBeGreaterThan(10);
  });

  it('the split-out TE runs receiver routes: Block = Hitch on a pass, Go on a run; Seam = Go; Drag = Drag; Flat = Out', () => {
    expect(playFor(play('Crossers'), 'spread').routes[TE].name).toBe('Hitch');
    expect(playFor(play('Dive'), 'spread').routes[TE].name).toBe('Go');
    expect(playFor(play('TE Seam'), 'spread').routes[TE].name).toBe('Go');
    expect(playFor(play('TE Drag'), 'spread').routes[TE].points).toEqual(ROUTES.find((r) => r.name === 'Drag')!.points);
    expect(playFor(play('Curls'), 'spread').routes[TE].name).toBe('Out');
    expect(playFor(play('Crossers'), 'spread').routes[TE].block).toBeFalsy();
    // Other formations: unchanged.
    expect(playFor(play('Crossers'), 'trips')).toBe(play('Crossers'));
    // AUDIBLE: out wide he cycles the receiver routes.
    expect(ROUTES).toContain(nextRoute(ROUTES[0], TE, true));
  });

  it('the Spread check: man calls only, not with a bracket', () => {
    expect(spreadCheckOn('spread', 'man', null)).toBe(true);
    expect(spreadCheckOn('spread', 'press', null)).toBe(true);
    expect(spreadCheckOn('spread', 'cover3', null)).toBe(false);
    expect(spreadCheckOn('spread', 'man', 1)).toBe(false);
    expect(spreadCheckOn('trips', 'man', null)).toBe(false);
  });

  it('balance: passing within ~10% of NORMAL; the Dive the same; the Toss weaker (no TE) but helped by the slot block', () => {
    const looks: [DefCallId, ShellId][] = [['man', 'twoDeep'], ['man', 'robber'], ['cover3', 'robber'], ['cover2', 'twoDeep']];
    const T: Record<string, number> = { Slant: 0.5, Out: 1.0, Go: 1.1, Post: 0.8, Corner: 0.8, Dig: 1.5, Drag: 1.0, Hitch: 1.1, Curl: 1.5, Flat: 1.0, Check: 1.3, Wheel: 1.4, Seam: 1.2 };
    const yards = (f: 'normal' | 'spread') => {
      let g = 0, n = 0;
      for (const p of PLAYS) {
        if (p.run) continue;
        playFor(p, f).routes.forEach((r, to) => {
          if (r.block || T[r.name] === undefined) return;
          for (const [call, shell] of looks)
            for (let s = 1; s <= 15; s++) {
              const res = simulatePass(p, { to, throwAt: T[r.name], lead: 1 }, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards: 2.5 }, call, shell, formation: f });
              g += res.sacked ? -6 : res.result === 'catch' ? res.gain ?? 0 : 0;
              n++;
            }
        });
      }
      return g / n;
    };
    const a = yards('normal'), b = yards('spread');
    expect(Math.abs(b - a) / a).toBeLessThan(0.12);
    const runs = (f: 'normal' | 'spread', n: string, fl = feel) => {
      let y = 0;
      for (const [call, shell] of looks) for (let s = 1; s <= 60; s++) y += simulateRun(play(n), s * 7919, fl, 2.5, 45, undefined, call, {}, shell, undefined, f).yards;
      return y / (looks.length * 60);
    };
    expect(Math.abs(runs('spread', 'Dive') - runs('normal', 'Dive'))).toBeLessThan(0.25);
    const toss = runs('spread', 'Toss');
    expect(toss).toBeLessThan(runs('normal', 'Toss'));
    expect(toss).toBeGreaterThan(runs('spread', 'Toss', { ...feel, formations: { ...feel.formations, spreadSlotBlockTime: 0 } }) + 0.3);
  }, 240000);
});

describe('BUNCH (F-c1)', () => {
  it('a tight triangle on top: the slot on the line, the other two a step behind; the TE alone on the bottom', () => {
    const f = formation(40, 'bunch');
    expect(f.wrs.every((w) => w.pos.y < mid)).toBe(true);
    const ys = f.wrs.map((w) => w.pos.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(4);
    expect(f.wrs[1].pos.x).toBeGreaterThan(f.wrs[0].pos.x);
    expect(f.wrs[1].pos.x).toBeGreaterThan(f.wrs[2].pos.x);
    expect(f.te.pos.y).toBeGreaterThan(mid);
  });

  it('the defense uses the Trips check against it too (three receivers to one side)', () => {
    expect(tripsCheckOn('bunch', 'man', null)).toBe(true);
    expect(tripsCheckOn('bunch', 'cover2', null)).toBe(false);
  });

  it('balance: BUNCH passes within ~10% of NORMAL (short game, weak deep outside), runs about the same', () => {
    const looks: [DefCallId, ShellId][] = [['man', 'twoDeep'], ['man', 'robber'], ['cover3', 'robber'], ['cover2', 'twoDeep']];
    const T: Record<string, number> = { Slant: 0.5, Out: 1.0, Go: 1.1, Post: 0.8, Corner: 0.8, Dig: 1.5, Drag: 1.0, Hitch: 1.1, Curl: 1.5, Flat: 1.0, Check: 1.3, Wheel: 1.4, Seam: 1.2 };
    const shots: [string, number, number][] = [];
    for (const p of PLAYS) if (!p.run) p.routes.forEach((r, i) => !r.block && T[r.name] !== undefined && shots.push([p.name, i, T[r.name]]));
    const yards = (f: 'normal' | 'bunch') => {
      let g = 0, n = 0;
      for (const [call, shell] of looks)
        for (const [name, to, t] of shots)
          for (let s = 1; s <= 20; s++) {
            const r = simulatePass(play(name), { to, throwAt: t, lead: 1 }, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards: 2.5 }, call, shell, formation: f });
            g += r.sacked ? -6 : r.result === 'catch' ? r.gain ?? 0 : 0;
            n++;
          }
      return g / n;
    };
    const a = yards('normal'), b = yards('bunch');
    expect(Math.abs(b - a) / a).toBeLessThan(0.12);
    const runs = (f: 'normal' | 'bunch') => {
      let y = 0;
      for (const [call, shell] of looks) for (const n of ['Dive', 'Toss']) for (let s = 1; s <= 60; s++) y += simulateRun(play(n), s * 7919, feel, 2.5, 45, undefined, call, {}, shell, undefined, f).yards;
      return y / (looks.length * 120);
    };
    expect(Math.abs(runs('bunch') - runs('normal'))).toBeLessThan(0.35);
  }, 240000);
});
