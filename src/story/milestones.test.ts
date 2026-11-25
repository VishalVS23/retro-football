import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague, teamRatings } from '../league/league';
import { finalPlaces, newSeason, type Season } from '../league/season';
import { addBoxes, applyResults, weekJobs } from '../league/seasonRun';
import { simGames } from '../league/weekSim';
import { afterWeek, seasonDone } from '../league/playoffs';
import { playerTotals } from '../league/leaders';
import { teamStars } from '../league/teamStars';
import type { BoxScore } from '../league/boxScore';
import { emptyNews, loreNews, parseNewsText, pruneNews, sanitizeNews, weekNews, type NewsStore, type NewsTeam } from './news';
import { LEGACY, REC_KEYS, sanitizeRecords } from './milestones';

const rules = { rules: feel.oppDrive, clock: feel.clock };
const league = generateLeague(4040);
const stars = teamStars(league);
const order = league.teams.map((t) => t.id).sort((a, b) => teamRatings(league, b).overall - teamRatings(league, a).overall);
const teams: NewsTeam[] = league.teams.map((t) => ({ abbr: t.abbr, conference: t.conference, division: t.division, stars: stars[t.id].overall, rank: order.indexOf(t.id) + 1 }));
const ME = 12;

describe('records and milestones (5c)', () => {
  let news: NewsStore = emptyNews();
  const allBoxes: Record<number, BoxScore>[] = [];
  let s: Season = newSeason(league.teams, 1, 8);
  for (let year = 1; year <= 2; year++) {
    let boxes: Record<number, BoxScore> = {};
    while (!seasonDone(s)) {
      const week = s.week;
      const res = simGames(weekJobs(league, s, week, feel), rules);
      boxes = addBoxes(boxes, res);
      s = afterWeek(applyResults(s, res), league.teams);
      news = weekNews(news, { season: s, teams, boxes, player: (id) => league.players[id], userTeamId: ME }, week, ['KEYSTONE', 'FRONTIER']);
    }
    allBoxes.push(boxes);
    if (year === 1) {
      s = newSeason(league.teams, 2, 9, finalPlaces(s, league.teams));
      news = pruneNews(news, 2);
    }
  }
  const ms = news.items.filter((x) => x.kind === 'milestone');

  it('big games are news about once or twice a week, not every line', () => {
    const big = ms.flatMap((x) => x.body).filter((b) => !b.startsWith('LEAGUE RECORD') && !b.startsWith('MILESTONE'));
    expect(big.length).toBeGreaterThan(20); // two seasons
    expect(big.length).toBeLessThan(140);
  });

  it('the record book starts from the old league and holds whichever is higher', () => {
    const rec = news.records!;
    let broken = 0;
    for (const k of REC_KEYS) {
      const bestGame = Math.max(...allBoxes.flatMap((b) => Object.values(b).flatMap((x) => x.teams.flatMap((t) => Object.values(t.lines).map((l) => l[k] ?? 0)))));
      expect(rec.game[k]!.v).toBe(Math.max(LEGACY.game[k]!.v, bestGame));
      const bestSeason = Math.max(...allBoxes.map((b) => Math.max(...Object.values(playerTotals(b)).map((l) => l[k] ?? 0))));
      expect(rec.season[k]!.v).toBe(Math.max(LEGACY.season[k]!.v, bestSeason));
      if (rec.game[k]!.year > 0) broken++;
      if (rec.season[k]!.year > 0) broken++;
    }
    // Sims rarely reach the old marks: they're there for great players to chase.
    expect(broken).toBeLessThanOrEqual(3);
    const announced = ms.flatMap((x) => x.body).filter((b) => b.startsWith('LEAGUE RECORD'));
    expect(announced.length).toBeGreaterThanOrEqual(broken > 0 ? 1 : 0);
    expect(announced.length).toBeLessThanOrEqual(broken * 2);
    announced.forEach((b) => expect(b).toMatch(/old record/));
  });

  it("milestones are said once; the old league's story is told once per save", () => {
    const lines = ms.flatMap((x) => x.body.map((b) => ({ year: x.year, b })));
    const milestones = lines.filter((x) => x.b.startsWith('MILESTONE'));
    expect(new Set(milestones.map((x) => `${x.year}${x.b}`)).size).toBe(milestones.length);
    expect(milestones.length).toBeGreaterThan(3);
    const lore = loreNews(emptyNews(), 1);
    expect(lore.items[0].body[0]).toMatch(/old league/);
    expect(loreNews(lore, 1)).toBe(lore); // once per save
    expect(pruneNews(lore, 5).flags).toContain('lore'); // never pruned away, so never said twice
  });

  it('tokens valid; records survive a save round trip; junk = empty', () => {
    for (const x of ms) for (const line of [x.title, ...x.body]) for (const part of parseNewsText(line)) if ('player' in part) expect(league.players[part.player]).toBeDefined();
    expect(sanitizeNews(JSON.parse(JSON.stringify(news)))).toEqual(news);
    expect(sanitizeRecords('x')).toEqual(LEGACY);
    expect(sanitizeRecords({ game: { py: { v: 'a' } }, season: {} })).toEqual(LEGACY);
    // A saved mark below the old league's (a save from before the old book) gives way to it; above it stays.
    expect(sanitizeRecords({ game: { py: { v: 300, id: 4, team: 1, year: 1, week: 2 } }, season: {} }).game.py).toEqual(LEGACY.game.py);
    expect(sanitizeRecords({ game: { py: { v: 500, id: 4, team: 1, year: 1, week: 2 } }, season: {} }).game.py!.v).toBe(500);
  });
});
