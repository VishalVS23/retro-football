import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { colorDistance, kitColors, MIN_COLOR_DISTANCE, TURF } from './colors';
import { FILLER_QUALITY, depthChart, generateLeague, pickOpponent, sanitizeLeague, teamRatings, type League } from './league';
import { CONFERENCES, DIVISIONS, TEAM_DEFS } from './teams';
import { ACTIVE_MAX, POSITIONS, PRACTICE_MAX, ROSTER_TARGET, STARTERS } from '../players/positions';
import { currentAbility } from '../players/player';

const league = generateLeague(12345);

describe('teams', () => {
  it('32 teams, 2 conferences x 4 divisions x 4, unique names and abbreviations', () => {
    expect(TEAM_DEFS).toHaveLength(32);
    expect(new Set(TEAM_DEFS.map((t) => t.abbr)).size).toBe(32);
    expect(new Set(TEAM_DEFS.map((t) => t.nickname)).size).toBe(32);
    expect(new Set(TEAM_DEFS.map((t) => t.city)).size).toBe(32);
    for (let c = 0; c < CONFERENCES.length; c++) {
      for (let d = 0; d < DIVISIONS[c].length; d++) {
        expect(TEAM_DEFS.filter((t) => t.conference === c && t.division === d)).toHaveLength(4);
      }
    }
    for (const t of TEAM_DEFS) expect(t.abbr).toMatch(/^[A-Z]{3}$/);
  });

  it('every team’s main colour stands out from the grass (so at home it wears its own colour)', () => {
    for (const t of TEAM_DEFS) expect(colorDistance(t.colors[0], TURF), t.abbr).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
  });

  it('every pair of teams gets two different-looking colours, none blending into the grass', () => {
    for (const a of TEAM_DEFS) {
      for (const b of TEAM_DEFS) {
        if (a === b) continue;
        const k = kitColors(a, b);
        expect(colorDistance(k.ours, k.theirs), `${a.abbr} v ${b.abbr}`).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
        expect(colorDistance(k.ours, TURF)).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
        expect(colorDistance(k.theirs, TURF)).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
      }
    }
  });
});

describe('league generation', () => {
  it('is the same for the same seed', () => {
    expect(generateLeague(12345)).toEqual(league);
    expect(generateLeague(99).players[0]).not.toEqual(league.players[0]);
  });

  it('gives every team a full 31-man roster and a 5-man practice squad, each player on one team', () => {
    const seen = new Set<number>();
    for (const t of league.teams) {
      expect(t.roster).toHaveLength(ACTIVE_MAX);
      expect(t.practice).toHaveLength(PRACTICE_MAX);
      for (const pos of POSITIONS) expect(t.roster.filter((id) => league.players[id].position === pos)).toHaveLength(ROSTER_TARGET[pos]);
      for (const id of [...t.roster, ...t.practice]) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      for (const id of t.practice) expect(league.players[id].age).toBeLessThanOrEqual(23);
    }
    expect(seen.size).toBe(league.players.length);
    league.players.forEach((p, i) => expect(p.id).toBe(i));
  });

  it('no two players on a team share a name', () => {
    for (const t of league.teams) {
      const names = [...t.roster, ...t.practice].map((id) => `${league.players[id].firstName} ${league.players[id].lastName}`);
      // Rare repeats are fine league-wide, but within a team they'd be confusing.
      expect(new Set(names).size, t.abbr).toBe(names.length);
    }
  });

  it('has good and bad teams, but nobody hopeless or unbeatable', () => {
    const overall = league.teams.map((t) => teamRatings(league, t.id).overall);
    const best = Math.max(...overall);
    const worst = Math.min(...overall);
    expect(best - worst).toBeGreaterThan(2.5);
    expect(best - worst).toBeLessThan(7);
    expect(worst).toBeGreaterThan(7.5);
    expect(best).toBeLessThan(17);
  });

  it('starters are better than backups, practice squads are young and raw', () => {
    let starters = 0;
    let backups = 0;
    let ns = 0;
    let nb = 0;
    for (const t of league.teams) {
      const chart = depthChart(league, t.id);
      for (const pos of POSITIONS) {
        chart[pos].forEach((s, i) => {
          if (i < STARTERS[pos]) (starters += s.rating), ns++;
          else (backups += s.rating), nb++;
        });
      }
    }
    expect(starters / ns).toBeGreaterThan(backups / nb + 1.5);
    const squad = league.teams.flatMap((t) => t.practice.map((id) => league.players[id]));
    const avgPotentialGap = squad.reduce((s, p) => s + p.potential - currentAbility(p), 0) / squad.length;
    expect(avgPotentialGap).toBeGreaterThan(1.5);
  });
});

describe('depth chart', () => {
  it('a full roster needs no fillers and nobody starts twice', () => {
    for (const t of league.teams) {
      const chart = depthChart(league, t.id);
      const ids: number[] = [];
      for (const pos of POSITIONS) {
        expect(chart[pos].length).toBeGreaterThanOrEqual(STARTERS[pos]);
        for (const s of chart[pos].slice(0, STARTERS[pos])) {
          expect(s.filler).toBe(false);
          expect(s.player.position).toBe(pos);
          ids.push(s.player.id);
        }
        // Best first.
        for (let i = 1; i < chart[pos].length; i++) expect(chart[pos][i - 1].rating).toBeGreaterThanOrEqual(chart[pos][i].rating);
      }
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no tight end: a spare player or a filler steps in', () => {
    const team = league.teams[0];
    const te = team.roster.filter((id) => league.players[id].position === 'TE');
    const chart = depthChart(league, team.id, new Set(te));
    expect(chart.TE).toHaveLength(1);
    const sub = chart.TE[0];
    expect(sub.filler || sub.player.position !== 'TE').toBe(true);
    if (!sub.filler) {
      // A spare (non-starting) player who is better than a filler there.
      expect(sub.rating).toBeGreaterThan(FILLER_QUALITY);
      const starters = POSITIONS.flatMap((p) => (p === 'TE' ? [] : chart[p].slice(0, STARTERS[p]).map((s) => s.player.id)));
      expect(starters).not.toContain(sub.player.id);
    }
  });

  it('every corner hurt: fillers (below average) start', () => {
    const team = league.teams[3];
    const out = new Set(team.roster.filter((id) => ['CB', 'S'].includes(league.players[id].position)));
    const chart = depthChart(league, team.id, out);
    expect(chart.CB).toHaveLength(STARTERS.CB);
    expect(chart.CB.some((s) => s.filler || s.player.position !== 'CB')).toBe(true);
    for (const s of chart.CB) expect(s.rating).toBeGreaterThanOrEqual(FILLER_QUALITY);
  });
});

describe('opponent and storage', () => {
  it('never picks the user’s own team as the opponent', () => {
    const l: League = { ...league, userTeamId: 5 };
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(pickOpponent(l, rng)).not.toBe(5);
  });

  it('accepts a sound league and rejects a damaged one', () => {
    const copy = JSON.parse(JSON.stringify({ ...league, userTeamId: 3 }));
    expect(sanitizeLeague(copy)).toEqual({ ...league, userTeamId: 3 });
    expect(sanitizeLeague(null)).toBeNull();
    expect(sanitizeLeague({ ...copy, teams: copy.teams.slice(1) })).toBeNull();
    expect(sanitizeLeague({ ...copy, userTeamId: 40 })).toBeNull();
    const badRoster = JSON.parse(JSON.stringify(copy));
    badRoster.teams[0].roster[0] = 999999;
    expect(sanitizeLeague(badRoster)).toBeNull();
  });
});
