import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague } from './league';
import { finalPlaces, gamesInWeek, isOver, newSeason, rankTeams, recordText, sanitizeSeason, standingRows, type Season } from './season';
import { addBoxes, applyResults, weekJobs } from './seasonRun';
import { simGames } from './weekSim';
import { closeSeasonStats, emptyStats, sanitizeStats, type StatsStore } from './boxScore';
import { FINAL_WEEK, WILD_CARD_WEEK, afterWeek, championOf, playoffResult, playoffSeeds, seasonDone, summarize, winnerOf, withPlayoffGames, type SeasonSummary } from './playoffs';

const rules = { rules: feel.oppDrive, clock: feel.clock };
const league = generateLeague(31337);

/** Sims one week of the season (every game) and moves on. */
function simWeek(s: Season): { s: Season; res: ReturnType<typeof simGames> } {
  const res = simGames(weekJobs(league, s, s.week, feel), rules);
  return { s: afterWeek(applyResults(s, res), league.teams), res };
}

function simSeason(s: Season, stats?: { v: StatsStore }): Season {
  while (!seasonDone(s)) {
    const r = simWeek(s);
    if (stats) stats.v = { ...stats.v, boxes: addBoxes(stats.v.boxes, r.res) };
    s = r.s;
  }
  return s;
}

describe('playoffs (4e)', () => {
  let regular = newSeason(league.teams, 1, 42);
  while (!isOver(regular)) regular = simWeek(regular).s;
  const done = simSeason(regular);

  it('the regular season ending starts the playoffs: 6 seeds a conference, division winners first, 3 v 6 and 4 v 5 at the higher seed', () => {
    expect(regular.week).toBe(WILD_CARD_WEEK);
    const rows = standingRows(regular, league.teams);
    const seeds = regular.seeds!;
    expect(seeds.map((c) => c.length)).toEqual([6, 6]);
    expect(seeds.flat().every((t, i, a) => a.indexOf(t) === i)).toBe(true);
    for (const [c, conf] of seeds.entries()) {
      expect(conf.every((t) => league.teams[t].conference === c)).toBe(true);
      // Seeds 1-4: one per division.
      expect(new Set(conf.slice(0, 4).map((t) => league.teams[t].division)).size).toBe(4);
      // Wild cards are the best of the rest.
      const rest = rankTeams(regular, rows, league.teams.map((_, id) => id).filter((id) => league.teams[id].conference === c && !conf.slice(0, 4).includes(id)));
      expect(conf.slice(4)).toEqual(rest.slice(0, 2));
    }
    const wc = gamesInWeek(regular, WILD_CARD_WEEK);
    expect(wc.length).toBe(4);
    for (const conf of seeds) {
      expect(wc).toContainEqual(expect.objectContaining({ home: conf[2], away: conf[5], round: 1 }));
      expect(wc).toContainEqual(expect.objectContaining({ home: conf[3], away: conf[4], round: 1 }));
    }
    // The picture during the season uses the same rules.
    expect(playoffSeeds(regular, league.teams).map((c) => c.seeds)).toEqual(seeds);
  }, 60000);

  it('rounds: 4, 4, 2, 1 games; the 1 seed hosts the lowest seed left; the final is neutral; one champion; standings untouched', () => {
    const rounds = [1, 2, 3, 4].map((r) => done.games.filter((g) => g.round === r));
    expect(rounds.map((r) => r.length)).toEqual([4, 4, 2, 1]);
    expect(done.games.filter((g) => g.round).every((g) => g.score && g.score[0] !== g.score[1])).toBe(true);
    for (const [c, conf] of done.seeds!.entries()) {
      const wcWinners = rounds[0].filter((g) => league.teams[g.home].conference === c).map((g) => winnerOf(g)!);
      const lowest = [...wcWinners].sort((a, b) => conf.indexOf(b) - conf.indexOf(a))[0];
      expect(rounds[1]).toContainEqual(expect.objectContaining({ home: conf[0], away: lowest }));
    }
    expect(rounds[3][0].neutral).toBe(true);
    const champ = championOf(done)!;
    expect(champ.champion).toBe(winnerOf(rounds[3][0]));
    expect(playoffResult(done, champ.champion)).toBe('champion');
    expect(playoffResult(done, champ.runnerUp)).toBe('runnerUp');
    expect(done.week).toBe(FINAL_WEEK + 1);
    expect(standingRows(done, league.teams)).toEqual(standingRows(regular, league.teams));
    // A finished season survives a save round trip; nothing to add once it's done.
    expect(sanitizeSeason(JSON.parse(JSON.stringify(done)), 32)).toEqual(done);
    expect(withPlayoffGames(done, league.teams)).toBe(done);
    expect(sanitizeSeason({ ...done, seeds: undefined }, 32)).toBeNull();
  }, 60000);

  it('20 seasons: valid brackets, top seeds win more than low seeds, champions vary, the save stays small', () => {
    let s = newSeason(league.teams, 1, 7);
    const stats = { v: emptyStats() };
    const summaries: SeasonSummary[] = [];
    const winsBySeed = [0, 0, 0, 0, 0, 0];
    const gamesBySeed = [0, 0, 0, 0, 0, 0];
    const sizes: number[] = [];
    let points = 0;
    let games = 0;
    for (let year = 1; year <= 20; year++) {
      s = simSeason(s, stats);
      for (const g of s.games) {
        if (!g.score) continue;
        points += g.score[0] + g.score[1];
        games++;
        if (!g.round) continue;
        for (const t of [g.home, g.away]) {
          const seed = s.seeds!.find((c) => c.includes(t))!.indexOf(t);
          gamesBySeed[seed]++;
          if (winnerOf(g) === t) winsBySeed[seed]++;
        }
      }
      summaries.push(summarize(s, 0, recordText(standingRows(s, league.teams)[0]))!);
      stats.v = { ...closeSeasonStats(stats.v, year), seasons: summaries.slice() };
      sizes.push(JSON.stringify(sanitizeStats(stats.v)).length);
      s = newSeason(league.teams, year + 1, 7 + year, finalPlaces(s, league.teams));
    }
    const titles = new Map<number, number>();
    for (const x of summaries) titles.set(x.champion, (titles.get(x.champion) ?? 0) + 1);
    const winPct = (i: number) => winsBySeed[i] / Math.max(1, gamesBySeed[i]);
    // Seeds 1-2 win more of their playoff games than seeds 5-6, but the low seeds win some.
    expect((winPct(0) + winPct(1)) / 2).toBeGreaterThan((winPct(4) + winPct(5)) / 2);
    expect(winsBySeed[4] + winsBySeed[5]).toBeGreaterThan(0);
    // The same rosters every year (no aging / draft until Stages 8 and 12), but no team wins most titles.
    expect(titles.size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...titles.values())).toBeLessThanOrEqual(10);
    // Scoring stays about 30 a game.
    expect(points / games).toBeGreaterThan(22);
    expect(points / games).toBeLessThan(40);
    // The stats store only grows by one season's player totals a year (box scores are dropped).
    const perSeason = (sizes[19] - sizes[0]) / 19;
    expect(perSeason).toBeLessThan(120_000);
  }, 180000);
});
