import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague, teamRatings } from '../league/league';
import { newSeason, type Season } from '../league/season';
import { addBoxes, applyResults, weekJobs } from '../league/seasonRun';
import { simGames } from '../league/weekSim';
import { afterWeek, seasonDone } from '../league/playoffs';
import { teamStars } from '../league/teamStars';
import type { BoxScore } from '../league/boxScore';
import { createRng } from '../sim/rng';
import { addScore, flipScoring, logScoring, sanitizeScoring, type ScoringPlay } from './scoring';
import { describeScore, readGame, writeRecap } from './recap';
import { emptyNews, parseNewsText, weekNews, type NewsStore, type NewsTeam } from './news';

const rules = { rules: feel.oppDrive, clock: feel.clock };
const league = generateLeague(777);
const stars = teamStars(league);
const order = league.teams.map((t) => t.id).sort((a, b) => teamRatings(league, b).overall - teamRatings(league, a).overall);
const teams: NewsTeam[] = league.teams.map((t) => ({ abbr: t.abbr, conference: t.conference, division: t.division, stars: stars[t.id].overall, rank: order.indexOf(t.id) + 1 }));
const ME = 9;

describe('scoring log (5b)', () => {
  it('a try folds into its touchdown; a 2-pointer on its own is a 2-point play; 3 = field goal', () => {
    let log: ScoringPlay[] = [];
    log = addScore(log, 0, 1, 6, [6, 0], { kind: 'passTd', yards: 22, by: 5, qb: 1 });
    log = addScore(log, 0, 1, 1, [7, 0]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'passTd', points: 7, try: 'xp', score: [7, 0], by: 5 });
    log = addScore(log, 1, 2, 3, [7, 3]);
    expect(log[1].kind).toBe('fg');
    log = addScore(log, 1, 5, 2, [7, 5]);
    expect(log[2].kind).toBe('twoPt');
    log = addScore(log, 0, 2, 2, [9, 5], { kind: 'safety' });
    expect(log[3].kind).toBe('safety');
    // A simmed drive's touchdown comes with its try already in.
    expect(addScore([], 0, 3, 8, [8, 0], { kind: 'runTd' })[0].try).toBe('two');
    expect(flipScoring(log)[0]).toMatchObject({ side: 1, score: [0, 7] });
    expect(sanitizeScoring(JSON.parse(JSON.stringify(log)))).toEqual(log);
    expect(sanitizeScoring([{ side: 3 }, ...log])).toEqual(log);
    expect(sanitizeScoring('x')).toBeUndefined();
    expect(logScoring([], [])).toEqual([]);
  });
});

describe('recaps (5b)', () => {
  let s: Season = newSeason(league.teams, 1, 31);
  let news: NewsStore = emptyNews();
  let boxes: Record<number, BoxScore> = {};
  while (!seasonDone(s)) {
    const week = s.week;
    const res = simGames(weekJobs(league, s, week, feel), rules);
    boxes = addBoxes(boxes, res);
    s = afterWeek(applyResults(s, res), league.teams);
    news = weekNews(news, { season: s, teams, boxes, player: (id) => league.players[id], userTeamId: ME }, week, ['KEYSTONE', 'FRONTIER']);
  }
  const played = s.games.filter((g) => g.score);

  it("every simmed game's scoring log adds up to its final score, scorers play for the team that scored", () => {
    for (const g of played) {
      const log = boxes[g.id].scoring!;
      const last = log[log.length - 1];
      expect(last ? last.score : [0, 0]).toEqual(g.score);
      expect(log.reduce((n, x) => n + (x.side === 0 ? x.points : 0), 0)).toBe(g.score![0]);
      for (const x of log) {
        const team = league.teams[boxes[g.id].teams[x.side].teamId];
        if (x.by !== undefined) expect(team.roster.includes(x.by) || team.practice.includes(x.by)).toBe(true);
        expect(describeScore(x, team.id)).toBeTruthy();
      }
    }
    // Touchdowns name their scorer almost always (fillers have no id).
    const tds = played.flatMap((g) => boxes[g.id].scoring!.filter((x) => x.kind === 'passTd' || x.kind === 'runTd'));
    expect(tds.length).toBeGreaterThan(300);
    expect(tds.filter((x) => x.by !== undefined).length / tds.length).toBeGreaterThan(0.95);
  });

  it('reads the story: the decisive score puts the winner ahead for good; comebacks really trailed', () => {
    const stories = new Set<string>();
    for (const g of played) {
      const st = readGame(boxes[g.id], [g.score![0], g.score![1]], g.ot ?? 0);
      stories.add(st.story);
      if (st.winner === null) continue;
      const log = boxes[g.id].scoring!;
      if (st.decisive) {
        const after = log.slice(log.indexOf(st.decisive));
        after.forEach((x) => expect(x.score[st.winner!]).toBeGreaterThan(x.score[1 - st.winner!]));
      }
      if (st.story === 'comeback') expect(log.some((x) => x.score[1 - st.winner!] - x.score[st.winner!] >= 10)).toBe(true);
    }
    // A season has a good mix of stories.
    expect(stories.size).toBeGreaterThanOrEqual(7);
  });

  it("the user's game gets a full recap every week he plays, last in the week's news; tokens are valid", () => {
    const mineGames = played.filter((g) => g.home === ME || g.away === ME);
    for (const g of mineGames) {
      const week = news.items.filter((x) => x.week === g.week);
      const recap = week[week.length - 1];
      expect(recap.kind).toBe('recap');
      expect(recap.gameId).toBe(g.id);
      expect(recap.mine).toBe(true);
      expect(recap.body.length).toBeGreaterThanOrEqual(5);
    }
    const others = news.items.filter((x) => x.kind === 'recap' && !x.mine);
    expect(others.length).toBeGreaterThan(10);
    for (const x of news.items.filter((y) => y.kind === 'recap'))
      for (const line of [x.title, ...x.body])
        for (const part of parseNewsText(line)) {
          if ('team' in part) expect(league.teams[part.team]).toBeDefined();
          if ('player' in part) expect(league.players[part.player]).toBeDefined();
        }
    // The Championship gets a full recap.
    const final = played.find((g) => g.round === 4)!;
    expect(news.items.find((x) => x.kind === 'recap' && x.gameId === final.id)!.body.length).toBeGreaterThanOrEqual(5);
  });

  it('a game from before 5b (no scoring log) still gets a recap', () => {
    const g = played.find((x) => x.home === ME || x.away === ME)!;
    const { scoring: _drop, ...old } = boxes[g.id];
    const r = writeRecap({ game: g, box: old, teams, player: (id) => league.players[id], userTeamId: ME }, createRng(1), true);
    expect(r.title.length).toBeGreaterThan(5);
    expect(r.body.length).toBeGreaterThanOrEqual(3);
  });
});
