import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { FIELD_WIDTH } from './field';
import { PLAYS } from './routes';
import { simulatePass, type PassShot } from './passSim';
import { simulateRun } from './runSim';
import { breaksOn, isZoneCall, zoneJobs, zoneTarget } from './zone';
import { coverFor } from './coverRatings';
import { makeFiller } from '../league/league';
import type { Player } from '../players/player';

const mid = FIELD_WIDTH / 2;
const los = 35;
const jobs = zoneJobs('cover3', feel, los);
const play = (name: string) => PLAYS.find((p) => p.name === name)!;

describe('zone jobs (Cover 3)', () => {
  it('is a zone call; man calls are not', () => {
    expect(isZoneCall('cover3')).toBe(true);
    expect(isZoneCall('man')).toBe(false);
    expect(isZoneCall('blitz')).toBe(false);
  });

  it('three deep (outside corners, S1 in the middle), four under (slot corner, both LBs, S2)', () => {
    expect(jobs.map((j) => j.kind)).toEqual(['deep', 'under', 'deep', 'under', 'under', 'deep', 'under']);
    // The three deep lanes cover the whole width between them.
    const deep = [jobs[0], jobs[5], jobs[2]];
    expect(deep[0].yMin).toBe(0);
    expect(deep[0].yMax).toBeCloseTo(deep[1].yMin);
    expect(deep[1].yMax).toBeCloseTo(deep[2].yMin);
    expect(deep[2].yMax).toBe(FIELD_WIDTH);
  });

  it('a deep defender stays over the top of the deepest receiver in his lane; an empty lane = his landmark', () => {
    const top = jobs[0];
    expect(zoneTarget(top, [], feel)).toEqual(top.spot);
    const t = zoneTarget(top, [{ x: los + 20, y: mid - 15 }, { x: los + 8, y: mid - 14 }], feel);
    expect(t.x).toBeGreaterThan(los + 20);
    // Outside leverage: a touch nearer the sideline than his man.
    expect(t.y).toBeLessThan(mid - 15);
  });

  it('an underneath defender shades toward a receiver in his area but stays near his landmark', () => {
    const hook = jobs[3];
    const near = zoneTarget(hook, [{ x: hook.spot.x - 2, y: hook.spot.y - 1 }], feel);
    expect(near.x).toBeCloseTo(hook.spot.x - 2);
    const far = zoneTarget(hook, [{ x: hook.spot.x - 2, y: hook.spot.y - 6 }], feel); // in his area, 6+ yd off his spot
    expect(Math.hypot(far.x - hook.spot.x, far.y - hook.spot.y)).toBeCloseTo(feel.zone.underReachYards);
    // A receiver past his carry depth is the deep man's.
    expect(zoneTarget(hook, [{ x: hook.spot.x + 12, y: hook.spot.y }], feel)).toEqual(hook.spot);
  });

  it('only defenders whose area the ball lands in break on it', () => {
    const deepBall = { x: los + 30, y: mid - 15 };
    expect(breaksOn(jobs[0], deepBall, feel)).toBe(true); // top deep third
    expect(breaksOn(jobs[2], deepBall, feel)).toBe(false); // bottom deep third
    expect(breaksOn(jobs[1], deepBall, feel)).toBe(false); // curl / flat: too deep for him
    const quick = { x: los + 3, y: mid - 2 };
    expect(breaksOn(jobs[3], quick, feel)).toBe(true); // hook
    expect(breaksOn(jobs[5], quick, feel)).toBe(false); // the deep middle safety stays home
  });

  it('in a zone a defender reads with zone coverage + anticipation, not man coverage', () => {
    const p = (o: Partial<Player['attributes']>) => {
      const x = makeFiller('LB');
      for (const k of Object.keys(x.attributes) as (keyof Player['attributes'])[]) x.attributes[k] = 10;
      Object.assign(x.attributes, o);
      return x;
    };
    const base = { topSpeed: 6.8, acceleration: 16, reactionTime: 0.35, cushionYards: 0, cushionCloseTime: 1.5, ballReactionTime: 0.2, ballSpeedRatio: 0.6 };
    const zoneGuy = p({ zoneCoverage: 18, anticipation: 18 });
    expect(coverFor(zoneGuy, base, feel.ratings, true).reactionTime).toBeLessThan(coverFor(zoneGuy, base, feel.ratings).reactionTime);
  });
});

// ---------- Balance (Z-a): every route against Cover 3, average QB, run after the catch ----------

function rate(name: string, shot: PassShot, call: 'man' | 'cover3', n = 300) {
  let c = 0;
  for (let s = 1; s <= n; s++) {
    const r = simulatePass(play(name), shot, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards: 2.5 }, call, shell: 'robber' });
    if (!r.sacked && r.result === 'catch') c++;
  }
  return (c / n) * 100;
}

describe('balance: Cover 3', () => {
  it('the drag is no longer a sure thing against zone (92% against everything before)', () => {
    const drag = rate('TE Drag', { to: 4, throwAt: 1.0, lead: 1 }, 'cover3');
    expect(drag).toBeGreaterThan(70);
    expect(drag).toBeLessThan(88);
  }, 60000);

  it('open against Cover 3: seams, flats, curls, the dig under the deep middle', () => {
    expect(rate('TE Seam', { to: 4, throwAt: 1.2, lead: 1 }, 'cover3')).toBeGreaterThan(70); // 7% into one deep + robber in man
    expect(rate('Curls', { to: 0, throwAt: 1.5, lead: 1 }, 'cover3')).toBeGreaterThan(50);
    expect(rate('Crossers', { to: 0, throwAt: 1.5, lead: 1 }, 'cover3')).toBeGreaterThan(60);
    expect(rate('Post Corner', { to: 3, throwAt: 1.0, lead: 1 }, 'cover3')).toBeGreaterThan(75); // RB flat
  }, 120000);

  it('tough against Cover 3: the deep ball outside and the post, never hopeless', () => {
    const go = rate('Verticals', { to: 0, throwAt: 1.1, lead: 1 }, 'cover3');
    const post = rate('Post Corner', { to: 0, throwAt: 0.8, lead: 1 }, 'cover3');
    expect(go).toBeLessThan(rate('Verticals', { to: 0, throwAt: 1.1, lead: 1 }, 'man') - 20);
    expect(go).toBeGreaterThan(25);
    expect(post).toBeLessThan(40);
    expect(post).toBeGreaterThan(12);
  }, 120000);

  it('nothing thrown on time is a sure thing', () => {
    const shots: [string, PassShot][] = [
      ['Slants', { to: 0, throwAt: 0.5, lead: 1 }],
      ['Hitch Slant', { to: 0, throwAt: 1.1, lead: 1 }],
      ['Crossers', { to: 1, throwAt: 1.0, lead: 1 }],
      ['TE Seam', { to: 4, throwAt: 1.2, lead: 1 }],
      ['Slants', { to: 3, throwAt: 1.3, lead: 1 }],
    ];
    for (const [name, shot] of shots) expect(rate(name, shot, 'cover3')).toBeLessThan(93);
  }, 120000);
});

describe('balance: runs against Cover 3', () => {
  const avg = (name: string, call: 'man' | 'cover3') => {
    let y = 0;
    for (let s = 1; s <= 300; s++) y += simulateRun(play(name), s * 7919, feel, 2.5, 45, undefined, call, {}, 'robber').yards;
    return y / 300;
  };
  it('the corners bail, so the Toss gets outside more; the hook LBs sit on the Dive; about even overall', () => {
    const [dm, dz, tm, tz] = [avg('Dive', 'man'), avg('Dive', 'cover3'), avg('Toss', 'man'), avg('Toss', 'cover3')];
    expect(tz).toBeGreaterThan(tm + 0.3);
    expect(dz).toBeGreaterThan(1);
    expect(Math.abs((dz + tz) / 2 - (dm + tm) / 2)).toBeLessThan(0.5);
  }, 60000);
});
