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
  });

  it('the deep ball is a race, not a sure thing', () => {
    const go = catches('Verticals', { to: 0, throwAt: 1.1, lead: 1 });
    expect(go).toBeGreaterThan(60);
    expect(go).toBeLessThan(92);
  });

  it('a late slant runs into the safety', () => {
    expect(catches('Slants', { to: 0, throwAt: 1.5, lead: 1 })).toBeLessThan(20);
  });

  it('throwing behind the receiver gives it to the trailing corner', () => {
    expect(catches('Verticals', { to: 0, throwAt: 1.1, lead: 0.5 })).toBeLessThan(20);
  });

  it('why the new rules exist: without momentum and late help, short routes get swarmed', () => {
    const old = {
      ...feel,
      defense: { ...feel.defense, cbTurnAcceleration: 0, cbAnticipation: 0, cbHelpBallReactionTime: feel.defense.cbBallReactionTime, helpContestRatio: 1 },
    };
    expect(catches('Slants', { to: 0, throwAt: 0.5, lead: 1 }, old)).toBeLessThan(catches('Slants', { to: 0, throwAt: 0.5, lead: 1 }) - 15);
    expect(catches('Post Corner', { to: 1, throwAt: 0.8, lead: 1 }, old)).toBeLessThan(catches('Post Corner', { to: 1, throwAt: 0.8, lead: 1 }) - 15);
  });
});
