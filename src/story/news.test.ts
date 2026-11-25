import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague, teamRatings } from '../league/league';
import { newSeason, type Season } from '../league/season';
import { addBoxes, applyResults, weekJobs } from '../league/seasonRun';
import { simGames } from '../league/weekSim';
import { afterWeek, championOf, seasonDone } from '../league/playoffs';
import { teamStars } from '../league/teamStars';
import type { BoxScore } from '../league/boxScore';
import { emptyNews, markRead, parseNewsText, previewNews, pruneNews, raceStatus, sanitizeNews, unreadCount, weekNews, type NewsStore, type NewsTeam } from './news';

const rules = { rules: feel.oppDrive, clock: feel.clock };
const league = generateLeague(2024);
const stars = teamStars(league);
const order = league.teams.map((t) => t.id).sort((a, b) => teamRatings(league, b).overall - teamRatings(league, a).overall);
const teams: NewsTeam[] = league.teams.map((t) => ({ abbr: t.abbr, conference: t.conference, division: t.division, stars: stars[t.id].overall, rank: order.indexOf(t.id) + 1 }));
const CONFS = ['KEYSTONE', 'FRONTIER'];
const ME = 5;

describe('news (5a)', () => {
  // A whole season simmed, with the news written after every week.
  let s: Season = newSeason(league.teams, 1, 99);
  let news: NewsStore = previewNews(emptyNews(), s, teams, ME, CONFS);
  let boxes: Record<number, BoxScore> = {};
  const raceLog: { week: number; status: ReturnType<typeof raceStatus> }[] = [];
  while (!seasonDone(s)) {
    const week = s.week;
    const res = simGames(weekJobs(league, s, week, feel), rules);
    boxes = addBoxes(boxes, res);
    s = afterWeek(applyResults(s, res), league.teams);
    if (week <= 18) raceLog.push({ week, status: raceStatus(applyResults(s, []), teams) });
    news = weekNews(news, { season: s, teams, boxes, player: (id) => league.players[id], userTeamId: ME }, week, CONFS);
  }

  it('a preview first, then results every week, players of the week in the regular season', () => {
    expect(news.items[0].kind).toBe('preview');
    for (let w = 1; w <= 22; w++) expect(news.items.some((x) => x.week === w && (x.kind === 'roundup' || x.kind === 'playoffs'))).toBe(true);
    for (let w = 1; w <= 18; w++) {
      const potw = news.items.find((x) => x.week === w && x.kind === 'potw')!;
      expect(potw.body).toHaveLength(4); // offense + defense, both conferences
    }
    // Ids are unique and increasing.
    expect(news.items.every((x, i, all) => i === 0 || x.id > all[i - 1].id)).toBe(true);
  });

  it('the playoff race is never wrong: clinched teams make it, eliminated ones never do, division champs win the division', () => {
    const seeds = s.seeds!;
    const inField = new Set(seeds.flat());
    const divWinners = new Set(seeds.flatMap((c) => c.slice(0, 4)));
    for (const { status } of raceLog) {
      status.clinched.forEach((id) => expect(inField.has(id)).toBe(true));
      status.eliminated.forEach((id) => expect(inField.has(id)).toBe(false));
      status.division.forEach((id) => expect(divWinners.has(id)).toBe(true));
      status.topSeed.forEach((id) => expect(seeds.some((c) => c[0] === id)).toBe(true));
    }
    // By the end, every team's fate has been announced at most once.
    const keys = news.flags.filter((f) => f.startsWith('clinch:') || f.startsWith('elim:'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(10);
  });

  it('the playoff field once, the champion once, with the final game', () => {
    expect(news.items.filter((x) => x.title === 'THE PLAYOFF FIELD IS SET')).toHaveLength(1);
    const champ = news.items.filter((x) => x.kind === 'champion');
    expect(champ).toHaveLength(1);
    expect(champ[0].gameId).toBe(championOf(s)!.game.id);
    expect(champ[0].body[0]).toContain(`{t:${championOf(s)!.champion}}`);
  });

  it('tokens: every team / player id in the text exists', () => {
    for (const x of news.items)
      for (const line of [x.title, ...x.body])
        for (const part of parseNewsText(line)) {
          if ('team' in part) expect(league.teams[part.team]).toBeDefined();
          if ('player' in part) expect(league.players[part.player]).toBeDefined();
        }
    expect(parseNewsText('{t:3} beat {a:4}, {p:12}!')).toEqual([{ team: 3, full: true }, { text: ' beat ' }, { team: 4, full: false }, { text: ', ' }, { player: 12 }, { text: '!' }]);
  });

  it('read / unread, the preview only once a season, old news pruned, a damaged store = empty', () => {
    expect(unreadCount(news)).toBe(news.items.length);
    const one = markRead(news, news.items[1].id);
    expect(unreadCount(one)).toBe(news.items.length - 1);
    expect(unreadCount(markRead(news, 'all'))).toBe(0);
    expect(previewNews(news, newSeason(league.teams, 1, 99), teams, ME, CONFS)).toBe(news);
    const y3 = pruneNews({ ...news, items: [...news.items, { ...news.items[0], id: 9999, year: 3 }] }, 3);
    expect(y3.items.every((x) => x.year >= 2)).toBe(true);
    expect(pruneNews(news, 2).items.length).toBe(news.items.length);
    expect(sanitizeNews(JSON.parse(JSON.stringify(news)))).toEqual(news);
    expect(sanitizeNews('junk')).toEqual(emptyNews());
    const bad = sanitizeNews({ nextId: 1, items: [{ id: 4, year: 1, week: 1, kind: 'roundup', title: 'X', body: ['a'] }, { id: 'x' }], flags: [3, 'a'] });
    expect(bad.items).toHaveLength(1);
    expect(bad.nextId).toBe(5);
    expect(bad.flags).toEqual(['a']);
  });
});
