import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague } from './league';
import { advanceWeek, newSeason } from './season';
import { addBoxes, applyResults, weekJobs } from './seasonRun';
import { simGames } from './weekSim';
import { closeSeasonStats, emptyStats, type BoxScores } from './boxScore';
import { LEADER_CATS, PROFILE_COLUMNS, gameLog, leaders, pastSeasons, playerTotals, teamTotals } from './leaders';
import { POSITIONS } from '../players/positions';

describe('stats screens (4c)', () => {
  const league = generateLeague(4242);
  let s = newSeason(league.teams, 1, 99);
  let boxes: BoxScores = {};
  const rules = { rules: feel.oppDrive, clock: feel.clock };
  // Four weeks of games.
  for (let w = 0; w < 4; w++) {
    const res = simGames(weekJobs(league, s, s.week, feel), rules);
    s = advanceWeek(applyResults(s, res));
    boxes = addBoxes(boxes, res);
  }
  const totals = playerTotals(boxes);

  it('leaders: top 10, best first, only players above 0; pass yards are led by QBs, sacks by pass rushers', () => {
    for (const c of LEADER_CATS) {
      const rows = leaders(totals, c.key);
      expect(rows.length).toBeLessThanOrEqual(10);
      expect(rows.every((r) => r.value > 0)).toBe(true);
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].value).toBeGreaterThanOrEqual(rows[i].value);
    }
    expect(leaders(totals, 'py').every((r) => league.players[r.id].position === 'QB')).toBe(true);
    expect(leaders(totals, 'sck').filter((r) => ['DL', 'LB'].includes(league.players[r.id].position)).length).toBe(leaders(totals, 'sck').length);
    expect(leaders({}, 'py')).toEqual([]);
  });

  it("team totals: games, points and yards match the box scores; one team's yards gained are another's allowed", () => {
    const teams = teamTotals(boxes, league.teams.length);
    const sum = (f: (t: (typeof teams)[number]) => number) => teams.reduce((a, t) => a + f(t), 0);
    expect(sum((t) => t.games)).toBe(Object.keys(boxes).length * 2);
    expect(sum((t) => t.pointsFor)).toBe(sum((t) => t.pointsAgainst));
    expect(sum((t) => t.yards)).toBe(sum((t) => t.yardsAllowed));
    expect(sum((t) => t.takeaways)).toBe(sum((t) => t.giveaways));
    const played = s.games.filter((g) => g.score);
    expect(sum((t) => t.pointsFor)).toBe(played.reduce((a, g) => a + g.score![0] + g.score![1], 0));
    expect(teams.every((t) => t.games >= 3 && t.games <= 4)).toBe(true); // byes start in week 5
  });

  it("game log: one row per game his team played, his line in it; the rows add up to his season", () => {
    const team = league.teams[3];
    const qb = team.roster.find((id) => league.players[id].position === 'QB' && totals[id]?.pa)!;
    const log = gameLog(s, boxes, qb, team.id);
    expect(log.map((g) => g.week)).toEqual([...log.map((g) => g.week)].sort((a, b) => a - b));
    expect(log.length).toBe(s.games.filter((g) => g.score && (g.home === team.id || g.away === team.id)).length);
    expect(log.reduce((a, g) => a + (g.line?.py ?? 0), 0)).toBe(totals[qb].py);
    expect(log.every((g) => g.opponent !== team.id)).toBe(true);
  });

  it('past seasons come from the history kept when a season closes', () => {
    const id = Number(Object.keys(totals)[0]);
    const closed = closeSeasonStats({ ...emptyStats(), boxes }, 1);
    expect(pastSeasons(closed, id)).toEqual([{ year: 1, line: totals[id] }]);
    expect(pastSeasons(emptyStats(), id)).toEqual([]);
  });

  it('every position has a stat table except linemen, and the columns read a line', () => {
    for (const p of POSITIONS) expect(PROFILE_COLUMNS[p].length > 0).toBe(p !== 'OL');
    const qbCols = PROFILE_COLUMNS.QB.map((c) => `${c.label} ${c.value({ pa: 30, pc: 20, py: 250, ptd: 2 })}`);
    expect(qbCols.slice(0, 3)).toEqual(['C/ATT 20/30', 'YDS 250', 'TD 2']);
    expect(PROFILE_COLUMNS.K[1].value({})).toBe('-');
  });
});
