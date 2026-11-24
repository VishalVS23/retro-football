import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague, teamRatings } from './league';
import { advanceWeek, isOver, newSeason, standingRows, SEASON_WEEKS, GAMES_PER_TEAM } from './season';
import { applyResults, weekJobs } from './seasonRun';
import { simGames } from './weekSim';
import { matchupMods, simTeam } from './simTeams';

describe('a whole simmed season (4a)', () => {
  it('every game gets played once; records spread out; better teams win more, never all', () => {
    const league = generateLeague(12345);
    let s = newSeason(league.teams, 1, 777);
    const rules = { rules: feel.oppDrive, clock: feel.clock };
    while (!isOver(s)) {
      s = applyResults(s, simGames(weekJobs(league, s, s.week, feel), rules));
      s = advanceWeek(s);
    }
    expect(s.week).toBe(SEASON_WEEKS + 1);
    expect(s.games.every((g) => g.score)).toBe(true);
    const rows = standingRows(s, league.teams);
    rows.forEach((r) => expect(r.w + r.l + r.t).toBe(GAMES_PER_TEAM));
    const wins = rows.map((r) => r.w + r.t / 2).sort((a, b) => b - a);
    expect(wins[0]).toBeGreaterThanOrEqual(11); // somebody is good
    expect(wins[0]).toBeLessThan(17); // ...but not perfect (with this seed)
    expect(wins[31]).toBeLessThanOrEqual(6);
    // The best-rated quarter of the league wins clearly more than the worst quarter.
    const byRating = league.teams.map((t) => t.id).sort((a, b) => teamRatings(league, b).overall - teamRatings(league, a).overall);
    const avg = (ids: number[]) => ids.reduce((a, id) => a + rows[id].pct, 0) / ids.length;
    expect(avg(byRating.slice(0, 8))).toBeGreaterThan(avg(byRating.slice(24)) + 0.2);
    // Simming again gives the same results (each game has its own dice).
    const again = applyResults(newSeason(league.teams, 1, 777), simGames(weekJobs(league, newSeason(league.teams, 1, 777), 1, feel), rules));
    expect(again.games.filter((g) => g.week === 1).map((g) => g.score)).toEqual(s.games.filter((g) => g.week === 1).map((g) => g.score));
  }, 60000);

  it('home field (4b): a team against itself wins ~55% at home', () => {
    const league = generateLeague(4242);
    let home = 0;
    const n = 3000;
    for (const id of [3, 17, 24]) {
      const t = simTeam(league, id);
      const mods = matchupMods(t, t, feel, 0);
      for (const r of simGames(Array.from({ length: n / 3 }, (_, k) => ({ gameId: k, mods, seed: (k * 7919 + id * 104729) >>> 0 })), { rules: feel.oppDrive, clock: feel.clock }))
        home += r.score[0] > r.score[1] ? 1 : r.score[0] === r.score[1] ? 0.5 : 0;
    }
    expect(home / n).toBeGreaterThan(0.52);
    expect(home / n).toBeLessThan(0.58);
  }, 60000);

  it("the user's game is left out of the week's sims while it's his to play", () => {
    const league = generateLeague(1);
    const s = newSeason(league.teams, 1, 5);
    const jobs = weekJobs(league, s, 1, feel, 0);
    expect(jobs.every((j) => s.games[j.gameId].home !== 0 && s.games[j.gameId].away !== 0)).toBe(true);
  });
});
