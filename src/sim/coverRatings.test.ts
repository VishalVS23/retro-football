import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { makeFiller } from '../league/league';
import type { Player } from '../players/player';
import type { Position } from '../players/positions';
import { PLAYS } from './routes';
import { simulatePass, type PassShot } from './passSim';
import { contestedCatchRatio, contestMods, coverFor, matchupEdge, receiverCatchChance, receiverRunParams, safetyReadTime } from './coverRatings';

/** A player with every attribute 10, then the overrides. */
function pl(pos: Position, over: Partial<Player['attributes']> = {}, traits: Player['traits'] = []): Player {
  const p = makeFiller(pos);
  for (const k of Object.keys(p.attributes) as (keyof Player['attributes'])[]) p.attributes[k] = 10;
  Object.assign(p.attributes, over);
  p.traits = traits;
  return p;
}
const R = feel.ratings;
const off = { ...R, enabled: 0 };
const baseCover = {
  topSpeed: 7.8,
  acceleration: 16,
  reactionTime: 0.25,
  cushionYards: 5,
  cushionCloseTime: 1.5,
  ballReactionTime: 0.2,
  ballSpeedRatio: 0.6,
  turnAcceleration: 17,
  anticipation: 0.8,
};

describe('receiver and defender ratings', () => {
  it('a 10 changes nothing; switched off, nothing changes either', () => {
    expect(receiverRunParams(pl('WR'), feel.routes, R)).toEqual(feel.routes);
    expect(receiverRunParams(pl('WR', { speed: 18 }), feel.routes, off)).toEqual(feel.routes);
    expect(receiverCatchChance(pl('WR'), 0.95, R)).toBeCloseTo(0.95);
    expect(coverFor(pl('CB'), baseCover, R)).toEqual(baseCover);
    expect(contestMods(pl('CB'), R)).toEqual({ breakup: 1, intercept: 1, hold: 1 });
    expect(safetyReadTime(pl('S'), 0.25, R)).toBeCloseTo(0.25);
  });

  it('fast receivers run faster, good route runners cut sharper, good hands drop less', () => {
    const fast = receiverRunParams(pl('WR', { speed: 18, routeRunning: 16 }), feel.routes, R);
    expect(fast.topSpeed).toBeGreaterThan(feel.routes.topSpeed);
    expect(fast.cutSpeedRatio).toBeGreaterThan(feel.routes.cutSpeedRatio);
    expect(1 - receiverCatchChance(pl('WR', { hands: 15 }), 0.95, R)).toBeCloseTo(0.025);
    expect(1 - receiverCatchChance(pl('WR', { hands: 5 }), 0.95, R)).toBeCloseTo(0.1);
  });

  it('good coverage reacts sooner and turns quicker; ball skills mean more breakups and picks', () => {
    const good = coverFor(pl('CB', { speed: 16, manCoverage: 18 }), baseCover, R);
    expect(good.topSpeed).toBeGreaterThan(baseCover.topSpeed);
    expect(good.reactionTime).toBeCloseTo(baseCover.reactionTime / 2);
    expect(good.turnAcceleration!).toBeGreaterThan(baseCover.turnAcceleration);
    const hawk = contestMods(pl('CB', { ballSkills: 16 }), R);
    expect(hawk.breakup).toBeGreaterThan(1.2);
    expect(hawk.intercept).toBeGreaterThan(1.2);
    expect(safetyReadTime(pl('S', { zoneCoverage: 18, anticipation: 18 }), 0.25, R)).toBeCloseTo(0.125);
  });

  it('traits: a gambler picks more but guesses more; contested-catch receivers get fewer balls broken up', () => {
    const gambler = pl('CB', {}, ['gamblesOnPicks']);
    expect(contestMods(gambler, R).intercept).toBeCloseTo(R.gambleInterceptBoost);
    expect(coverFor(gambler, baseCover, R).anticipation!).toBeGreaterThan(baseCover.anticipation);
    expect(contestedCatchRatio(pl('WR', {}, ['contestedCatches']), R)).toBe(R.contestedBreakupRatio);
    expect(contestedCatchRatio(pl('WR'), R)).toBe(1);
  });

  it('matchup arrows: a clearly faster receiver has the edge, an even one has none', () => {
    expect(matchupEdge(pl('WR', { speed: 16, routeRunning: 14 }), pl('CB'))).toBe(1);
    expect(matchupEdge(pl('WR'), pl('CB', { speed: 15, manCoverage: 14 }))).toBe(-1);
    expect(matchupEdge(pl('WR', { speed: 11 }), pl('CB'))).toBe(0);
  });
});

const play = (name: string) => PLAYS.find((p) => p.name === name)!;
const v = (x: number) => ({ speed: x, acceleration: x, routeRunning: x, hands: x, manCoverage: x, ballSkills: x });
function catches(name: string, shot: PassShot, wr: number, cb: number) {
  const offense = [pl('WR', v(wr)), pl('WR', v(wr)), pl('WR', v(wr)), pl('RB')];
  const defense = { cover: [pl('CB', v(cb)), pl('CB', v(cb)), pl('CB', v(cb)), pl('LB')], safety: pl('S') };
  let n = 0;
  for (let s = 1; s <= 250; s++) if (simulatePass(play(name), shot, s * 7919, feel, 35, { qb: pl('QB'), offense, defense }).result === 'catch') n++;
  return (n / 250) * 100;
}
const SLOW = 60000;

describe('balance: receivers vs corners in whole pass plays', () => {
  const go: PassShot = { to: 0, throwAt: 1.1, lead: 1 };
  const post: PassShot = { to: 0, throwAt: 0.8, lead: 1 };
  const hitch: PassShot = { to: 0, throwAt: 1.1, lead: 1 };

  it('the deep ball: a star receiver on a weak corner is usually open, the reverse rarely', () => {
    expect(catches('Verticals', go, 16, 8)).toBeGreaterThan(80);
    expect(catches('Verticals', go, 8, 16)).toBeLessThan(40);
    const even = catches('Verticals', go, 10, 10);
    expect(even).toBeGreaterThan(60);
    expect(even).toBeLessThan(88);
  }, SLOW);

  it('mismatches show on the post too, but nothing is automatic or hopeless', () => {
    const good = catches('Post Corner', post, 16, 8);
    const bad = catches('Post Corner', post, 8, 16);
    expect(good - bad).toBeGreaterThan(30);
    expect(good).toBeLessThan(97);
    expect(bad).toBeGreaterThan(15);
  }, SLOW);

  it('a star corner takes the hitch away instead of overrunning it', () => {
    expect(catches('Hitch Slant', hitch, 8, 16)).toBeLessThan(catches('Hitch Slant', hitch, 10, 10) - 10);
  }, SLOW);
});
