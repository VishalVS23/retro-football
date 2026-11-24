import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { FIELD_WIDTH } from './field';
import { FORMATION_IDS, formation, nextFormation } from './formation';
import { PLAYS, routePath } from './routes';
import { simulatePass } from './passSim';
import { simulateRun } from './runSim';
import { zoneJobs } from './zone';
import { linebacker2Start, lb2ZoneSpot } from './defCalls';
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
