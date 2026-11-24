import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague } from './league';
import { advanceWeek, isOver, newSeason } from './season';
import { addBoxes, applyResults, weekJobs } from './seasonRun';
import { simGames } from './weekSim';
import { addLine, creditLive, regroupLines, sanitizeLines, type Lines } from './playerStats';
import type { Player } from '../players/player';
import { sanitizeBoxScores, type BoxScores } from './boxScore';

describe('player stats in simmed games (4b)', () => {
  const league = generateLeague(12345);
  let s = newSeason(league.teams, 1, 777);
  let boxes: BoxScores = {};
  const rules = { rules: feel.oppDrive, clock: feel.clock };
  const withBoxes = () => {
    if (Object.keys(boxes).length) return;
    while (!isOver(s)) {
      const res = simGames(weekJobs(league, s, s.week, feel), rules);
      s = advanceWeek(applyResults(s, res));
      boxes = addBoxes(boxes, res);
    }
  };

  it("every game has a box score; each team's rushing, passing and sacks match its players' lines; the score matches", () => {
    withBoxes();
    expect(Object.keys(boxes).length).toBe(272);
    for (const b of Object.values(boxes)) {
      const g = s.games[b.gameId];
      expect(b.teams.map((t) => t.byPeriod.reduce((x, y) => x + y, 0))).toEqual(g.score);
      for (const t of b.teams) {
        const ls = Object.values(t.lines);
        const sum = (k: 'ry' | 'py' | 'sk') => ls.reduce((a, l) => a + (l[k] ?? 0), 0);
        expect(sum('ry')).toBe(t.stats.rushYards);
        expect(sum('sk')).toBe(t.stats.sacked);
        // Net passing = completion yards minus sack yards (sacks aren't in anybody's passing yards).
        expect(sum('py')).toBeGreaterThanOrEqual(t.stats.passYards);
      }
    }
  }, 60000);

  it('season lines look like football: the RB carries, WR1s get the most looks, LBs tackle, DL sack, DBs pick', () => {
    withBoxes();
    const totals: Lines = {};
    for (const b of Object.values(boxes)) for (const t of b.teams) for (const [id, l] of Object.entries(t.lines)) totals[Number(id)] = addLine(totals[Number(id)] ?? {}, l);
    const byPos = (pos: string, k: keyof Lines[number]) =>
      Object.entries(totals)
        .filter(([id]) => league.players[Number(id)].position === pos)
        .reduce((a, [, l]) => a + (l[k] ?? 0), 0);
    expect(byPos('RB', 'ra') / (byPos('RB', 'ra') + byPos('QB', 'ra'))).toBeGreaterThan(0.85);
    expect(byPos('LB', 'tk')).toBeGreaterThan(byPos('CB', 'tk'));
    expect(byPos('DL', 'sck')).toBeGreaterThan(4 * byPos('LB', 'sck'));
    // Every pick thrown is somebody's interception (LBs pick off throws to the RB / TE they cover).
    expect(byPos('CB', 'dint') + byPos('S', 'dint') + byPos('LB', 'dint')).toBe(byPos('QB', 'pint'));
    // Per QB game: 20-35 attempts, 120-260 yards, 50-75% complete.
    const qbs = Object.values(totals).filter((l) => (l.pa ?? 0) > 150);
    const per = (k: 'pa' | 'py') => qbs.reduce((a, l) => a + l[k]!, 0) / qbs.length / 17;
    expect(per('pa')).toBeGreaterThan(20);
    expect(per('pa')).toBeLessThan(35);
    expect(per('py')).toBeGreaterThan(120);
    expect(per('py')).toBeLessThan(260);
    const comp = qbs.reduce((a, l) => a + l.pc!, 0) / qbs.reduce((a, l) => a + l.pa!, 0);
    expect(comp).toBeGreaterThan(0.5);
    expect(comp).toBeLessThan(0.75);
    // The team's WR1 (wide top) gets more targets than the WR3 (slot) on average.
    let wr1 = 0;
    let wr3 = 0;
    for (const t of league.teams) {
      const depth = t.roster.filter((id) => league.players[id].position === 'WR').map((id) => totals[id]?.tg ?? 0).sort((a, b) => b - a);
      wr1 += depth[0];
      wr3 += depth[2] ?? 0;
    }
    expect(wr1).toBeGreaterThan(wr3 * 1.3);
  }, 60000);

  it('the credit dice never change the score; box scores survive a save round trip', () => {
    withBoxes();
    const s2 = newSeason(league.teams, 1, 777);
    const noBox = simGames(weekJobs(league, s2, 1, feel).map(({ teams: _t, units: _u, ...j }) => j), rules);
    expect(noBox.map((r) => r.score)).toEqual(s.games.filter((g) => g.week === 1).map((g) => g.score));
    expect(sanitizeBoxScores(JSON.parse(JSON.stringify(boxes)))).toEqual(boxes);
    expect(sanitizeBoxScores({ 3: { gameId: 4 } })).toBeNull();
    expect(sanitizeLines({ 5: { py: 'lots' } })).toBeNull();
  }, 60000);

  it("every player is in his own team's box (tackles, sacks and picks go to the defending team)", () => {
    withBoxes();
    const teamOf = new Map<number, number>();
    for (const t of league.teams) for (const id of [...t.roster, ...t.practice]) teamOf.set(id, t.id);
    for (const b of Object.values(boxes)) for (const t of b.teams) for (const id of Object.keys(t.lines)) expect(teamOf.get(Number(id))).toBe(t.teamId);
  }, 60000);
});

describe('player stats in games the user plays (4b-2)', () => {
  const pl = (id: number) => ({ id }) as Player;
  const [qb, wr, rb, cb, lb, dl, k, p] = [1, 2, 3, 10, 11, 12, 4, 5].map(pl);

  it('a catch: QB and receiver get the yards, the tackler a tackle; a fumble = a forced fumble, lost only if they fell on it', () => {
    const off: Lines = {};
    const def: Lines = {};
    creditLive(off, def, { k: 'catch', qb, to: wr, yards: 14, td: false, tackler: cb });
    creditLive(off, def, { k: 'catch', qb, to: wr, yards: 6, td: false, tackler: cb, fumble: 'kept' });
    creditLive(off, def, { k: 'catch', qb, to: wr, yards: 30, td: true });
    expect(off[1]).toEqual({ pa: 3, pc: 3, py: 50, ptd: 1 });
    expect(off[2]).toEqual({ tg: 3, rec: 3, rcy: 50, rcl: 30, rctd: 1 });
    expect(def[10]).toEqual({ tk: 2, ff: 1 });
    creditLive(off, def, { k: 'run', carrier: rb, yards: -2, td: false, tackler: dl, fumble: 'lost' });
    expect(off[3]).toEqual({ ra: 1, ry: -2, rl: -2, fl: 1 });
    expect(def[12]).toEqual({ tk: 1, ff: 1 });
  });

  it('incompletions, picks, sacks, kicks and punts; fillers and missing players get nothing', () => {
    const off: Lines = {};
    const def: Lines = {};
    creditLive(off, def, { k: 'inc', qb, to: wr, defended: cb });
    creditLive(off, def, { k: 'inc', qb, to: wr });
    creditLive(off, def, { k: 'int', qb, to: wr, by: cb });
    creditLive(off, def, { k: 'sack', qb, by: lb });
    creditLive(off, def, { k: 'fg', kicker: k, yards: 44, good: true });
    creditLive(off, def, { k: 'fg', kicker: k, yards: 51, good: false });
    creditLive(off, def, { k: 'xp', kicker: k, good: true });
    creditLive(off, def, { k: 'punt', punter: p, net: 38 });
    creditLive(off, def, { k: 'run', carrier: pl(-1), yards: 5, td: false, tackler: null });
    expect(off[1]).toEqual({ pa: 3, pint: 1, sk: 1 });
    expect(off[2]).toEqual({ tg: 3 });
    expect(def[10]).toEqual({ pd: 2, dint: 1 });
    expect(def[11]).toEqual({ sck: 1, tk: 1 });
    expect(off[4]).toEqual({ fga: 2, fgm: 1, fgl: 44, xpa: 1, xpm: 1 });
    expect(off[5]).toEqual({ pu: 1, puy: 38 });
    expect(off[-1]).toBeUndefined();
  });

  it("regroups lines from a 4b-1 box score into each player's own team", () => {
    const [a, b] = regroupLines({ 1: { pa: 5 }, 20: { tk: 3 } }, { 2: { rec: 2 }, 10: { tk: 1 } }, (id) => id < 10);
    expect(a).toEqual({ 1: { pa: 5 }, 2: { rec: 2 } });
    expect(b).toEqual({ 20: { tk: 3 }, 10: { tk: 1 } });
  });
});
