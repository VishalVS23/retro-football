import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague, depthChart, teamRatings, type League } from '../league/league';
import { matchupMods, simTeam } from '../league/simTeams';
import { NEUTRAL_MODS, SIM_NORMS, driveMods, unitEdges, type DriveMods } from './driveRatings';
import { simulateGame } from './simGame';
import { simulateOppDrive } from './oppDrive';
import { createRng } from './rng';
import type { Position } from '../players/positions';

const on = { ...feel.ratings, enabled: 1 };
const off = { ...feel.ratings, enabled: 0 };
const base = { kicking: feel.kicking, punting: feel.punting };

function games(mods: [DriveMods, DriveMods], n: number) {
  let aWins = 0, close = 0, blowouts = 0, ot = 0, pts = 0;
  for (let s = 1; s <= n; s++) {
    const g = simulateGame({ mods, rules: feel.oppDrive, clock: feel.clock, receives: (s % 2) as 0 | 1 }, createRng(s * 7919));
    const [a, b] = g.score;
    if (a > b) aWins++;
    if (Math.abs(a - b) <= 8) close++;
    if (Math.abs(a - b) >= 21) blowouts++;
    if (g.ot) ot++;
    pts += a + b;
  }
  return { aWins: aWins / n, close: close / n, blowouts: blowouts / n, ot: ot / n, pts: pts / n };
}

const leagues = [11, 22].map((s) => generateLeague(s * 1009));
const ranked = (lg: League) => lg.teams.map((t) => ({ id: t.id, r: teamRatings(lg, t.id).overall })).sort((x, y) => y.r - x.r);

describe('drive ratings', () => {
  it('SIM_NORMS matches the starters the generator makes (within a point)', () => {
    const take: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, CB: 3, S: 1, LB: 1 };
    for (const [pos, norms] of Object.entries(SIM_NORMS) as [Position, Record<string, number>][]) {
      for (const [key, norm] of Object.entries(norms)) {
        const vals = leagues.flatMap((lg) => lg.teams.flatMap((t) => depthChart(lg, t.id)[pos].slice(0, take[pos]).map((s) => (s.player.attributes as Record<string, number>)[key])));
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        expect(Math.abs(avg - norm), `${pos} ${key}: league ${avg.toFixed(1)} vs table ${norm}`).toBeLessThan(1);
      }
    }
  });

  it('ratings switched off = an average matchup (today\'s CPU drive)', () => {
    const lg = leagues[0];
    const [best, , ...rest] = ranked(lg);
    expect(driveMods(simTeam(lg, best.id), simTeam(lg, rest[rest.length - 1].id).defense, base, off)).toEqual(NEUTRAL_MODS);
  });

  it('edges are capped and point the right way: the best team out-rates the worst on every unit', () => {
    const lg = leagues[0];
    const r = ranked(lg);
    const best = simTeam(lg, r[0].id);
    const worst = simTeam(lg, r[r.length - 1].id);
    const e = unitEdges(best.offense, worst.defense, on);
    for (const v of Object.values(e).slice(0, 4)) expect(Math.abs(v)).toBeLessThanOrEqual(feel.ratings.simEdgeCap + 1e-9);
    expect(e.pass).toBeGreaterThan(0);
    expect(e.run).toBeGreaterThan(0);
    const [aMods, bMods] = matchupMods(best, worst, feel);
    expect(aMods.completionSteps).toBeGreaterThan(bMods.completionSteps);
    expect(aMods.runYards).toBeGreaterThan(bMods.runYards);
  });

  it('a better offense scores more per drive; no nudges = exactly the old dice', () => {
    const lg = leagues[0];
    const r = ranked(lg);
    const [strong] = matchupMods(simTeam(lg, r[0].id), simTeam(lg, r[r.length - 1].id), feel);
    const sit = { quarter: 1, timeLeft: 120, quarterLength: 120, us: 0, them: 0 };
    let plain = 0, neutral = 0, better = 0;
    for (let s = 1; s <= 2000; s++) {
      const a = simulateOppDrive(85, sit, feel.oppDrive, createRng(s));
      const b = simulateOppDrive(85, sit, feel.oppDrive, createRng(s), NEUTRAL_MODS);
      expect(b).toEqual(a);
      plain += a.points;
      neutral += b.points;
      better += simulateOppDrive(85, sit, feel.oppDrive, createRng(s), strong).points;
    }
    expect(neutral).toBe(plain);
    expect(better / 2000).toBeGreaterThan((plain / 2000) * 1.2);
  }, 30000);
});

describe('timeouts and risk', () => {
  const rules = feel.oppDrive;
  it('hurry-up: the offense uses its timeouts and saves time', () => {
    const sit = { quarter: 4, timeLeft: 55, quarterLength: 120, us: 7, them: 3 };
    let usedSome = 0, tSaved = 0, tPlain = 0;
    for (let s = 1; s <= 500; s++) {
      const a = simulateOppDrive(85, { ...sit, offenseTimeouts: 3 }, rules, createRng(s));
      const b = simulateOppDrive(85, sit, rules, createRng(s));
      if (a.timeoutsUsed.offense > 0) usedSome++;
      expect(a.timeoutsUsed.offense).toBeLessThanOrEqual(3);
      expect(b.timeoutsUsed.offense).toBe(0);
      tSaved += a.seconds / Math.max(1, a.plays);
      tPlain += b.seconds / Math.max(1, b.plays);
    }
    expect(usedSome).toBeGreaterThan(250);
    expect(tSaved).toBeLessThan(tPlain);
  });

  it('running the clock: the defense (behind) uses its timeouts', () => {
    const sit = { quarter: 4, timeLeft: 110, quarterLength: 120, us: 3, them: 10, defenseTimeouts: 3 };
    let used = 0;
    for (let s = 1; s <= 300; s++) used += simulateOppDrive(85, sit, rules, createRng(s)).timeoutsUsed.defense;
    expect(used).toBeGreaterThan(150);
  });

  it('two scores down in Q4: they take shots downfield', () => {
    const sit = { quarter: 4, timeLeft: 110, quarterLength: 120, us: 17, them: 3 };
    const d = simulateOppDrive(85, sit, rules, createRng(3));
    expect(['risky', 'hurryUp']).toContain(d.note);
  });
});

describe('whole simulated games', () => {
  it('is repeatable, and the score is what the drives add up to', () => {
    const input = { mods: [NEUTRAL_MODS, NEUTRAL_MODS] as [DriveMods, DriveMods], rules: feel.oppDrive, clock: feel.clock, receives: 0 as const };
    for (let s = 1; s <= 200; s++) {
      const a = simulateGame(input, createRng(s));
      expect(simulateGame(input, createRng(s)).score).toEqual(a.score);
      if (a.ot < 3) {
        const sum = [0, 1].map((side) => a.drives.filter((d) => d.side === side).reduce((t, d) => t + d.drive.points, 0));
        expect(sum).toEqual(a.score);
      }
      expect(a.score[0]).not.toBe(a.score[1]); // overtime always settles it
    }
  });

  it('two average teams: about a coin flip, mostly close, the odd blowout and overtime', () => {
    const g = games([NEUTRAL_MODS, NEUTRAL_MODS], 2000);
    expect(g.aWins).toBeGreaterThan(0.45);
    expect(g.aWins).toBeLessThan(0.55);
    expect(g.close).toBeGreaterThan(0.5);
    expect(g.blowouts).toBeGreaterThan(0.005);
    expect(g.ot).toBeGreaterThan(0.03);
    expect(g.pts).toBeGreaterThan(14);
    expect(g.pts).toBeLessThan(28);
  }, 60000);

  it('the best team beats the worst most of the time but not always; a good team beats a middling one more often than not', () => {
    for (const lg of leagues) {
      const r = ranked(lg);
      const pair = (a: number, b: number) => games(matchupMods(simTeam(lg, r[a].id), simTeam(lg, r[b].id), feel), 800);
      const top = pair(0, r.length - 1);
      expect(top.aWins).toBeGreaterThan(0.8);
      expect(top.aWins).toBeLessThan(0.96);
      const good = pair(4, 15);
      expect(good.aWins).toBeGreaterThan(0.58);
      expect(good.aWins).toBeLessThan(0.82);
    }
  }, 120000);
});
