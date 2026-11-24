import { describe, expect, it } from 'vitest';
import { TEAM_DEFS } from './teams';
import {
  BYE_FIRST_WEEK,
  GAMES_PER_TEAM,
  REMATCH_GAP,
  SEASON_WEEKS,
  advanceWeek,
  divisionStandings,
  finalPlaces,
  gamesInWeek,
  newSeason,
  recordResult,
  sanitizeSeason,
  standingRows,
  teamGame,
  teamSchedule,
  type Season,
} from './season';

const teams = TEAM_DEFS;
const sameDiv = (a: number, b: number) => teams[a].conference === teams[b].conference && teams[a].division === teams[b].division;

describe('season schedule (4a)', () => {
  for (const year of [1, 2, 3, 4, 5, 6, 7]) {
    it(`year ${year}: 17 games each, one a week, a bye in weeks 5-12, 8 or 9 at home, division rivals twice`, () => {
      const s = newSeason(teams, year, 1000 + year * 77);
      let soon = 0;
      expect(s.games.length).toBe((teams.length * GAMES_PER_TEAM) / 2);
      for (let id = 0; id < teams.length; id++) {
        const mine = teamSchedule(s, id);
        expect(mine.length).toBe(GAMES_PER_TEAM);
        const weeks = mine.map((g) => g.week);
        expect(new Set(weeks).size).toBe(GAMES_PER_TEAM); // never twice in one week
        const bye = [...Array(SEASON_WEEKS)].map((_, i) => i + 1).find((w) => !weeks.includes(w))!;
        expect(bye).toBeGreaterThanOrEqual(BYE_FIRST_WEEK);
        expect(bye).toBeLessThanOrEqual(12);
        const home = mine.filter((g) => g.home === id).length;
        expect(home).toBeGreaterThanOrEqual(8);
        expect(home).toBeLessThanOrEqual(9);
        // Each division rival: twice, once at each place.
        const rivals = teams.map((_, o) => o).filter((o) => o !== id && sameDiv(id, o));
        for (const r of rivals) {
          const vs = mine.filter((g) => g.home === r || g.away === r);
          expect(vs.length).toBe(2);
          expect(vs.filter((g) => g.home === id).length).toBe(1);
          if (Math.abs(vs[0].week - vs[1].week) < REMATCH_GAP) soon++;
        }
        // Everyone else at most once; exactly 11 other opponents.
        const others = mine.filter((g) => !sameDiv(g.home, g.away)).map((g) => (g.home === id ? g.away : g.home));
        expect(others.length).toBe(11);
        expect(new Set(others).size).toBe(11);
        // 13 games in its conference, 4 or 5... (4 full + 1 same spot) against the other one.
        expect(others.filter((o) => teams[o].conference !== teams[id].conference).length).toBe(5);
      }
      // Division rematches are spread out (each counted twice here, once per team): only a few come soon after the first game.
      expect(soon / 2).toBeLessThanOrEqual(6);
    });
  }

  it('the same seed gives the same schedule; the rotation changes the opponents each year', () => {
    expect(newSeason(teams, 1, 42).games).toEqual(newSeason(teams, 1, 42).games);
    const opp = (s: Season) => new Set(teamSchedule(s, 0).map((g) => (g.home === 0 ? g.away : g.home)));
    const a = opp(newSeason(teams, 1, 42));
    const b = opp(newSeason(teams, 2, 42));
    expect([...a].filter((x) => !b.has(x)).length).toBeGreaterThan(3);
  });

  it('builds fast enough for a phone (a few dozen seasons in well under a second each)', () => {
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) newSeason(teams, 1 + (i % 6), i * 101);
    expect((Date.now() - t0) / 20).toBeLessThan(250);
  });
});

describe('results and standings (4a)', () => {
  /** Plays a season where the lower team id always wins by 7 (ties never). */
  const playAll = (s: Season) => {
    let x = s;
    for (let w = 1; w <= SEASON_WEEKS; w++) {
      for (const g of gamesInWeek(x, w)) x = recordResult(x, g.id, g.home < g.away ? [21, 14] : [14, 21]);
      x = advanceWeek(x);
    }
    return x;
  };

  it('records add up: wins = losses, everyone plays 17, the week moves on', () => {
    const s = playAll(newSeason(teams, 1, 7));
    expect(s.week).toBe(SEASON_WEEKS + 1);
    const rows = standingRows(s, teams);
    expect(rows.reduce((a, r) => a + r.w, 0)).toBe(rows.reduce((a, r) => a + r.l, 0));
    rows.forEach((r) => expect(r.w + r.l + r.t).toBe(GAMES_PER_TEAM));
    rows.forEach((r) => expect(r.div.w + r.div.l).toBe(6));
    expect(rows[0].streak).toBe('W17');
  });

  it('division order: better record first; a tie on record goes to head-to-head', () => {
    const s0 = newSeason(teams, 1, 7);
    const div = teams.map((t, id) => ({ t, id })).filter((x) => x.t.conference === 0 && x.t.division === 0).map((x) => x.id);
    const [a, b] = div;
    // a and b each win one game; b beat a.
    let s = s0;
    const ab = s.games.find((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a))!;
    s = recordResult(s, ab.id, ab.home === b ? [20, 10] : [10, 20]);
    const other = s.games.find((g) => (g.home === a || g.away === a) && g.id !== ab.id && !(g.home === b || g.away === b))!;
    s = recordResult(s, other.id, other.home === a ? [30, 0] : [0, 30]);
    const ds = divisionStandings(s, teams, 0, 0);
    const ia = ds.findIndex((r) => r.teamId === a);
    const ib = ds.findIndex((r) => r.teamId === b);
    expect(ds[ia].w).toBe(1);
    expect(ds[ib].w).toBe(1);
    expect(ib).toBeLessThan(ia); // b won the head-to-head (even though a has the better points difference)
  });

  it('final places feed next season; a ranked season survives a save round trip', () => {
    const s = playAll(newSeason(teams, 1, 9));
    const places = finalPlaces(s, teams);
    expect(places.filter((p) => p === 0).length).toBe(8);
    const next = newSeason(teams, 2, 99, places);
    expect(next.places).toEqual(places);
    expect(sanitizeSeason(JSON.parse(JSON.stringify(s)), teams.length)).toEqual(s);
    expect(sanitizeSeason({ ...s, week: 40 }, teams.length)).toBeNull();
    expect(sanitizeSeason(null, teams.length)).toBeNull();
  });

  it("a team's game this week, or null on its bye", () => {
    const s = newSeason(teams, 1, 3);
    let byes = 0;
    for (let w = 1; w <= SEASON_WEEKS; w++) if (!teamGame(s, 0, w)) byes++;
    expect(byes).toBe(1);
  });
});
