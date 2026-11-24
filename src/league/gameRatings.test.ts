import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague } from './league';
import { advanceWeek, isOver, newSeason } from './season';
import { addBoxes, applyResults, statUnit, weekJobs } from './seasonRun';
import { simGames } from './weekSim';
import { simTeam } from './simTeams';
import { sanitizeBoxScores, type BoxScore, type BoxScores, type TeamBox } from './boxScore';
import { newSideStats } from '../sim/gameStats';
import { playerOfTheGame, ratingBand, rateGame, rawRating, roles, unitAverages } from './gameRatings';
import { ratingLeaders, statSummary, teamTotals } from './leaders';

describe('game ratings (4d)', () => {
  const league = generateLeague(777);
  let s = newSeason(league.teams, 1, 5);
  let boxes: BoxScores = {};
  const rules = { rules: feel.oppDrive, clock: feel.clock };
  while (!isOver(s)) {
    const res = simGames(weekJobs(league, s, s.week, feel), rules);
    s = advanceWeek(applyResults(s, res));
    boxes = addBoxes(boxes, res);
  }
  const all = Object.values(boxes).flatMap((b) => b.teams.flatMap((t) => Object.values(t.ratings ?? {})));

  it('every starter on both teams is rated every game; most land 5.8-7.8, big games are rare', () => {
    for (const b of Object.values(boxes))
      for (const t of b.teams) {
        const want = roles(statUnit(simTeam(league, t.teamId)));
        expect(Object.keys(t.ratings ?? {}).length).toBe(want.size);
      }
    expect(all.every((r) => r >= 30 && r <= 100)).toBe(true);
    const mean = all.reduce((a, b) => a + b, 0) / all.length / 10;
    expect(mean).toBeGreaterThan(6.2);
    expect(mean).toBeLessThan(6.9);
    const share = (f: (r: number) => boolean) => all.filter(f).length / all.length;
    expect(share((r) => r >= 58 && r <= 78)).toBeGreaterThan(0.7);
    expect(share((r) => r >= 85)).toBeLessThan(0.05);
    expect(share((r) => r >= 95)).toBeLessThan(0.01);
    // Ratings survive a save round trip.
    expect(sanitizeBoxScores(JSON.parse(JSON.stringify(boxes)))).toEqual(boxes);
  }, 60000);

  const team = (over: Partial<TeamBox['stats']>, points: number): TeamBox => ({ teamId: 0, stats: { ...newSideStats(), ...over }, byPeriod: [points, 0, 0, 0], lines: {} });

  it('a great QB game rates well above a bad one; an OL that allows sacks rates lower', () => {
    const me = team({ passYards: 280, rushYards: 120, sacked: 1 }, 31);
    const them = team({ passYards: 180, rushYards: 80 }, 10);
    const great = rawRating({ pa: 30, pc: 23, py: 330, ptd: 3 }, 'QB', me, them);
    const bad = rawRating({ pa: 34, pc: 15, py: 140, pint: 3, sk: 5 }, 'QB', { ...me, byPeriod: [10, 0, 0, 0] }, { ...them, byPeriod: [31, 0, 0, 0] });
    expect(great).toBeGreaterThan(8.5);
    expect(bad).toBeLessThan(5);
    const clean = rawRating({}, 'OL', me, them);
    const leaky = rawRating({}, 'OL', { ...me, stats: { ...me.stats, sacked: 6 } }, them);
    expect(clean).toBeGreaterThan(leaky + 0.8);
    expect(ratingBand(8.1)).toBe('r-great');
    expect(ratingBand(5.9)).toBe('r-poor');
    expect(ratingBand(4.9)).toBe('r-bad');
  });

  it('player of the game is the best rating; unit averages; rating leaders need half the games', () => {
    const b = Object.values(boxes)[0] as BoxScore;
    const best = playerOfTheGame(b)!;
    for (const t of b.teams) for (const r of Object.values(t.ratings!)) expect(r).toBeLessThanOrEqual(best.rating);
    const u = statUnit(simTeam(league, b.teams[0].teamId));
    const avg = unitAverages(b.teams[0], u);
    expect(avg.off).toBeGreaterThan(30);
    expect(avg.def).toBeGreaterThan(30);
    const leaders = ratingLeaders(boxes, teamTotals(boxes, league.teams.length));
    expect(leaders.length).toBe(10);
    for (let i = 1; i < leaders.length; i++) expect(leaders[i - 1].value).toBeGreaterThanOrEqual(leaders[i].value);
    expect(statSummary({ pa: 28, pc: 21, py: 290, ptd: 3 })).toBe('21/28 · 290 PASS YDS · 3 TD');
    expect(rateGame(b, [u, statUnit(simTeam(league, b.teams[1].teamId))])).toEqual([b.teams[0].ratings, b.teams[1].ratings]);
  }, 60000);
});
