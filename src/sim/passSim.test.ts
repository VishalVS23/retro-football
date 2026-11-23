import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { PLAYS } from './routes';
import { simulatePass, type PassShot } from './passSim';

const play = (name: string) => PLAYS.find((p) => p.name === name)!;

/** Catches out of 200 snaps (corner speeds rolled per snap, like the game). */
function catches(name: string, shot: PassShot, f = feel) {
  let n = 0;
  for (let s = 1; s <= 200; s++) if (simulatePass(play(name), shot, s * 7919, f).result === 'catch') n++;
  return n / 2; // percent
}

describe('balance: whole pass plays (all defenders, as in the game)', () => {
  it('short and medium routes thrown on time and led well are usually caught', () => {
    expect(catches('Slants', { to: 0, throwAt: 0.5, lead: 1 })).toBeGreaterThanOrEqual(55); // slant
    expect(catches('Post Corner', { to: 0, throwAt: 0.8, lead: 1 })).toBeGreaterThanOrEqual(55); // post
    expect(catches('Post Corner', { to: 1, throwAt: 0.8, lead: 1 })).toBeGreaterThanOrEqual(55); // corner
    expect(catches('Hitch Slant', { to: 0, throwAt: 1.1, lead: 1 })).toBeGreaterThanOrEqual(70); // hitch
    expect(catches('Curls', { to: 0, throwAt: 1.5, lead: 1 })).toBeGreaterThanOrEqual(65); // curl
  }, 30000);

  it('the deep ball is a race, not a sure thing', () => {
    const go = catches('Verticals', { to: 0, throwAt: 1.1, lead: 1 });
    expect(go).toBeGreaterThan(60);
    expect(go).toBeLessThan(92);
  }, 30000);

  it('a late slant runs into the safety', () => {
    expect(catches('Slants', { to: 0, throwAt: 1.5, lead: 1 })).toBeLessThan(20);
  }, 30000);

  it('throwing behind the receiver gives it to the trailing corner', () => {
    expect(catches('Verticals', { to: 0, throwAt: 1.1, lead: 0.5 })).toBeLessThan(20);
  }, 30000);

  it('why the new rules exist: without momentum and late help, short routes get swarmed', () => {
    const old = {
      ...feel,
      defense: { ...feel.defense, cbTurnAcceleration: 0, cbAnticipation: 0, cbHelpBallReactionTime: feel.defense.cbBallReactionTime, helpContestRatio: 1 },
    };
    expect(catches('Slants', { to: 0, throwAt: 0.5, lead: 1 }, old)).toBeLessThan(catches('Slants', { to: 0, throwAt: 0.5, lead: 1 }) - 15);
    expect(catches('Post Corner', { to: 1, throwAt: 0.8, lead: 1 }, old)).toBeLessThan(catches('Post Corner', { to: 1, throwAt: 0.8, lead: 1 }) - 15);
  }, 30000);
});

// ---------- Run after the catch, and two holes the user found (2026-11-22) ----------

/** Catch rate and average gain (yards from the line) over 300 snaps, average QB (with his misses). */
function playOut(name: string, shot: PassShot, jukeYards: number) {
  let caught = 0;
  let gain = 0;
  for (let s = 1; s <= 300; s++) {
    const r = simulatePass(play(name), shot, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards } });
    if (!r.sacked && r.result === 'catch') {
      caught++;
      gain += r.gain!;
    }
  }
  return { rate: (caught / 300) * 100, gain: gain / Math.max(1, caught) };
}

describe('after the catch', () => {
  it('playing out the run never changes how the pass itself turned out (own dice)', () => {
    for (let s = 1; s <= 40; s++) {
      const shot = { to: 0, throwAt: 0.5, lead: 1 };
      const plain = simulatePass(play('Slants'), shot, s * 7919, feel, 35, { qb: null });
      const run = simulatePass(play('Slants'), shot, s * 7919, feel, 35, { qb: null, afterCatch: { jukeYards: 2.5 } });
      expect(run.result).toBe(plain.result);
      if (run.result === 'catch') expect(run.gain!).toBeGreaterThan(0);
    }
  }, 30000);

  it('RB checkdown: no longer a free 6 yards (the LB comes up on him)', () => {
    const check = playOut('Slants', { to: 3, throwAt: 1.3, lead: 1 }, 0);
    expect(check.rate).toBeLessThan(90);
    expect(check.gain).toBeLessThan(4.5);
    // Still a safe throw.
    expect(check.rate).toBeGreaterThan(70);
  }, 60000);

  it('late dig across the field: good, but no sure thing (the safety drives on it)', () => {
    const dig = playOut('Crossers', { to: 0, throwAt: 1.8, lead: 1 }, 2.5);
    expect(dig.rate).toBeLessThan(80);
    expect(dig.rate).toBeGreaterThan(50);
    expect(dig.gain).toBeGreaterThan(10);
  }, 60000);
});

// ---------- The tight end (3h-b) ----------

describe('balance: the tight end', () => {
  const sackTime = (name: string, extra = {}) => {
    let sum = 0;
    for (let s = 1; s <= 40; s++) {
      let t = 0.8;
      for (; t < 4.5; t += 0.1) if (simulatePass(play(name), { to: 0, throwAt: t, lead: 1 }, s * 7919, feel, 35, extra).sacked) break;
      sum += t;
    }
    return sum / 40;
  };

  it('a TE in to block buys time (when LB2 drops); when LB2 blitzes he picks him up (about the normal pocket)', () => {
    const route = sackTime('Verticals');
    expect(sackTime('Crossers')).toBeGreaterThan(route + 0.15);
    expect(Math.abs(sackTime('Crossers', { lb2: 'blitz' }) - route)).toBeLessThan(0.2);
  }, 60000);

  it('his short routes work; a ball near a blocking TE never counts as his', () => {
    expect(catches('TE Drag', { to: 4, throwAt: 1.0, lead: 1 })).toBeGreaterThan(75);
    expect(catches('Curls', { to: 4, throwAt: 0.9, lead: 1 })).toBeGreaterThan(30); // his flat
    // The deep seam into the single safety is a gamble until the second safety (3h-c); thrown late, a real shot.
    expect(catches('TE Seam', { to: 4, throwAt: 1.8, lead: 1 })).toBeGreaterThan(25);
    for (let s = 1; s <= 30; s++) expect(simulatePass(play('Crossers'), { to: 4, throwAt: 1.0, lead: 1 }, s, feel).result).not.toBe('catch');
  }, 60000);
});
