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
import { emptyNews, parseNewsText, pruneNews, sanitizeNews, weekNews, type NewsStore, type NewsTeam } from './news';
import { REC_KEYS, sanitizeRecords } from './milestones';

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

  it('the record book holds the real best marks of both seasons', () => {
    const rec = news.records!;
    for (const k of REC_KEYS) {
      // Best single game (only big games can set a game record).
      const bestGame = Math.max(...allBoxes.flatMap((b) => Object.values(b).flatMap((x) => x.teams.flatMap((t) => Object.values(t.lines).map((l) => l[k] ?? 0)))));
      if (rec.game[k]) expect(rec.game[k]!.v).toBe(bestGame);
      // Best season.
      const bestSeason = Math.max(...allBoxes.map((b) => Math.max(...Object.values(playerTotals(b)).map((l) => l[k] ?? 0))));
      expect(rec.season[k]!.v).toBe(bestSeason);
    }
    expect(Object.keys(rec.game).length).toBeGreaterThan(4);
  });

  it('records are only announced from season 2; season records once a season per stat', () => {
    const lines = ms.flatMap((x) => x.body.map((b) => ({ year: x.year, b })));
    const seasonRec = lines.filter((x) => x.b.includes('this season, the most ever'));
    seasonRec.forEach((x) => expect(x.year).toBe(2));
    // Game records too: season 1 only builds the book.
    lines.filter((x) => x.b.startsWith('LEAGUE RECORD')).forEach((x) => expect(x.year).toBe(2));
    const milestones = lines.filter((x) => x.b.startsWith('MILESTONE'));
    expect(new Set(milestones.map((x) => `${x.year}${x.b}`)).size).toBe(milestones.length);
    expect(milestones.length).toBeGreaterThan(3);
    expect(news.flags.filter((f) => f.startsWith('srec:')).every((f) => f.startsWith('srec:2:'))).toBe(true);
  });

  it('tokens valid; records survive a save round trip; junk = empty', () => {
    for (const x of ms) for (const line of [x.title, ...x.body]) for (const part of parseNewsText(line)) if ('player' in part) expect(league.players[part.player]).toBeDefined();
    expect(sanitizeNews(JSON.parse(JSON.stringify(news)))).toEqual(news);
    expect(sanitizeRecords('x')).toEqual({ game: {}, season: {} });
    expect(sanitizeRecords({ game: { py: { v: 'a' } }, season: {} })).toEqual({ game: {}, season: {} });
  });
});
