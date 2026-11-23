import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generateLeague, depthChart, teamRatings, type League } from '../league/league';
import { matchupMods, simTeam } from '../league/simTeams';
import { NEUTRAL_MODS, SIM_NORMS, driveMods, unitEdges, type DriveMods } from './driveRatings';
import { SIM_OT_START_T, SIM_START_T, freshGameState, simulateFrom, simulateGame, type SimGameState } from './simGame';
import { newClock } from './clock';
import { TOTAL_LENGTH } from './field';
import { newGameStats, recordOurSimDrive, recordTheirDrive } from './gameStats';
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
    const take: Partial<Record<Position, number>> = { QB: 1, RB: 1, TE: 1, WR: 3, CB: 3, S: 2, LB: 2 };
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

  it('11-on-11 (3h-d): the TE, LB2 and S2 count in the simmed drives', () => {
    const lg = leagues[0];
    const mid = ranked(lg)[16].id;
    const t = simTeam(lg, mid);
    const opp = simTeam(lg, ranked(lg)[15].id);
    const boost = (p: (typeof t.offense.skill)[number], keys: string[], v: number) => {
      const q = { ...p, attributes: { ...p.attributes } };
      for (const k of keys) (q.attributes as Record<string, number>)[k] = v;
      return q;
    };
    const plain = unitEdges(t.offense, opp.defense, on);
    // A star TE: better passing and running.
    const te = { ...t.offense, skill: [...t.offense.skill] as typeof t.offense.skill };
    te.skill[4] = boost(te.skill[4], ['speed', 'routeRunning', 'hands', 'runBlocking'], 19);
    const withTe = unitEdges(te, opp.defense, on);
    expect(withTe.pass).toBeGreaterThan(plain.pass);
    expect(withTe.run).toBeGreaterThan(plain.run);
    // Their star LB2 and S2: worse passing (and running) for us.
    const def = { ...opp.defense, cover: [...opp.defense.cover] as typeof opp.defense.cover };
    def.cover[4] = boost(def.cover[4], ['speed', 'manCoverage', 'tackling'], 19);
    def.safety2 = boost(def.safety2, ['speed', 'zoneCoverage', 'ballSkills', 'tackling'], 19);
    const vsStars = unitEdges(t.offense, def, on);
    expect(vsStars.pass).toBeLessThan(plain.pass);
    expect(vsStars.picks).toBeLessThan(plain.picks);
    expect(vsStars.run).toBeLessThan(plain.run);
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
      const sum = [0, 1].map((side) => a.log.filter((d) => d.side === side).reduce((t, d) => t + d.points, 0));
      expect(sum).toEqual(a.score);
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

describe('carrying a game on from any moment (SIM TO END OF GAME)', () => {
  const rules = { mods: [NEUTRAL_MODS, NEUTRAL_MODS] as [DriveMods, DriveMods], rules: feel.oppDrive, clock: feel.clock };
  const base = (over: Partial<SimGameState> = {}): SimGameState => ({
    ...freshGameState(0, feel.clock),
    ...over,
  });

  it('from the opening kickoff it is exactly a whole game', () => {
    for (let s = 1; s <= 50; s++) {
      expect(simulateFrom(base(), rules, createRng(s))).toEqual(simulateGame({ ...rules, receives: 0 }, createRng(s)));
    }
  });

  it('mid-game: keeps the score so far, plays to the end, and the box score adds up', () => {
    for (let s = 1; s <= 300; s++) {
      const start = base({ score: [14, 10], clock: { ...newClock(feel.clock), quarter: 3, timeLeft: 70 }, startT: 60, down: 3, firstDownT: 66 });
      const r = simulateFrom(start, rules, createRng(s));
      expect(r.score[0]).toBeGreaterThanOrEqual(14);
      expect(r.score[1]).toBeGreaterThanOrEqual(10);
      expect(r.score[0]).not.toBe(r.score[1]);
      expect(r.log[0].side).toBe(0);
      expect(r.log[0].drive!.startX).toBe(TOTAL_LENGTH - 60);
      const sum = [0, 1].map((side) => r.log.filter((e) => e.side === side).reduce((t, e) => t + e.points, 0));
      expect([14 + sum[0], 10 + sum[1]]).toEqual(r.score);
      expect(r.log.every((e) => e.period >= 3)).toBe(true);
      let g = newGameStats();
      for (const e of r.log) if (e.drive) g = e.side === 0 ? recordOurSimDrive(g, e.drive) : recordTheirDrive(g, e.drive);
      expect(g.qb.completions).toBeLessThanOrEqual(g.qb.attempts);
      expect(g.qb.touchdowns).toBeLessThanOrEqual(r.log.filter((e) => e.side === 0 && e.drive?.result === 'touchdown').length);
    }
  });

  it('a try still to take comes first, then the other side gets the ball at its 25', () => {
    const r = simulateFrom(base({ score: [6, 0], startT: 108, tryPending: true }), rules, createRng(5));
    expect(r.log[0].try?.kind).toBe('extraPoint');
    expect(r.log[0].side).toBe(0);
    expect(r.log[1].side).toBe(1);
    expect(r.log[1].drive!.startX).toBe(TOTAL_LENGTH - SIM_START_T);
  });

  it('a touchdown at 0:00 of Q2: the try, then halftime, and the CPU gets the second-half kickoff', () => {
    const start = base({ score: [6, 3], clock: { ...newClock(feel.clock), quarter: 2, timeLeft: 0 }, startT: 108, tryPending: true });
    const r = simulateFrom(start, rules, createRng(9));
    expect(r.log[0].try).toBeDefined();
    expect(r.log[0].period).toBe(2);
    expect(r.log[1].side).toBe(1);
    expect(r.log[1].period).toBeGreaterThanOrEqual(3);
  });

  it('overtime in progress: our possession first, then theirs; the shootout settles it', () => {
    for (let s = 1; s <= 200; s++) {
      const ot = base({ score: [17, 17], clock: { ...newClock(feel.clock), quarter: 4, timeLeft: 0, ot: 1 }, startT: SIM_OT_START_T, otFirst: 0 });
      const r = simulateFrom(ot, rules, createRng(s));
      expect(r.score[0]).not.toBe(r.score[1]);
      expect(r.ot).toBeGreaterThanOrEqual(1);
      expect(r.log[0].side).toBe(0);
      expect(r.log[0].period).toBe(5);
      const shoot = simulateFrom(base({ score: [31, 31], clock: { ...newClock(feel.clock), quarter: 4, timeLeft: 0, ot: 3 }, startT: 108, tryPending: true, otFirst: 0 }), rules, createRng(s));
      expect(shoot.log[0].try?.kind).toBe('twoPoint');
      expect(shoot.score[0]).not.toBe(shoot.score[1]);
    }
  });
});

describe('stopping early (SIM TO END OF QUARTER / SIM THIS DRIVE)', () => {
  const rules = { mods: [NEUTRAL_MODS, NEUTRAL_MODS] as [DriveMods, DriveMods], rules: feel.oppDrive, clock: feel.clock };
  const q = (quarter: 1 | 2 | 3 | 4, timeLeft: number) => ({ ...newClock(feel.clock), quarter, timeLeft });
  const at = (over: Partial<SimGameState>): SimGameState => ({ ...freshGameState(0, feel.clock), ...over });

  it('a drive paused at 0:00 plays exactly like the full drive up to that point', () => {
    const sit = { quarter: 1, timeLeft: 40, quarterLength: 120, us: 0, them: 0 };
    for (let s = 1; s <= 400; s++) {
      const full = simulateOppDrive(85, sit, feel.oppDrive, createRng(s));
      const paused = simulateOppDrive(85, { ...sit, stopAfterSeconds: 40 }, feel.oppDrive, createRng(s));
      if (full.seconds <= 40 && full.result !== 'endOfHalf') expect(paused).toEqual(full);
      else if (paused.result !== 'quarterEnd') {
        // The last play started before 0:00 and ended the drive: same drive, the clock stops at 0:00.
        expect({ ...paused, seconds: full.seconds }).toEqual(full);
        expect(paused.seconds).toBe(40);
      } else {
        expect(paused.seconds).toBe(40);
        expect(paused.series!.down).toBeGreaterThanOrEqual(1);
        expect(paused.points).toBe(0);
      }
    }
  });

  it('end of Q1: stops at 0:00 exactly; a drive still going carries on at the same down in Q2', () => {
    let carried = 0;
    for (let s = 1; s <= 300; s++) {
      const r = simulateFrom(at({ clock: q(1, 90), startT: 40, down: 2, firstDownT: 47 }), rules, createRng(s), 'quarter');
      expect(r.over).toBe(false);
      expect(r.event).toBe('endQuarter');
      expect(r.next!.clock.quarter).toBe(2);
      expect(r.next!.clock.timeLeft).toBe(feel.clock.quarterLength);
      expect(r.log.every((e) => e.period === 1)).toBe(true);
      const last = r.log[r.log.length - 1].drive!;
      if (last.result === 'quarterEnd') {
        carried++;
        expect(r.next!.offense).toBe(r.log[r.log.length - 1].side);
        expect(r.next!.down).toBe(last.series!.down);
      }
    }
    expect(carried).toBeGreaterThan(50);
  });

  it('end of Q2: halftime, and the CPU gets the second-half kickoff; Q4: the game ends or overtime is next', () => {
    for (let s = 1; s <= 200; s++) {
      const half = simulateFrom(at({ clock: q(2, 70), startT: 50 }), rules, createRng(s), 'quarter');
      expect(half.event).toBe('halftime');
      expect(half.next!.offense).toBe(1);
      expect(half.next!.startT).toBe(SIM_START_T);
      expect(half.next!.timeouts).toEqual([feel.clock.timeoutsPerHalf, feel.clock.timeoutsPerHalf]);
      const end = simulateFrom(at({ score: [10, 10], clock: q(4, 60), startT: 50 }), rules, createRng(s), 'quarter');
      if (end.score[0] === end.score[1]) expect(end.toOvertime).toBe(true);
      else expect(end.over).toBe(true);
    }
  });

  it('this drive only: one possession of ours, then the CPU has the ball', () => {
    for (let s = 1; s <= 300; s++) {
      const r = simulateFrom(at({ clock: q(3, 100), startT: 45, down: 1, firstDownT: 55 }), rules, createRng(s), 'drive');
      expect(r.log).toHaveLength(1);
      expect(r.log[0].side).toBe(0);
      expect(r.over).toBe(false);
      expect(r.next!.offense).toBe(1);
    }
  });

  it('quarter after quarter adds up to a whole game', () => {
    for (let s = 1; s <= 100; s++) {
      const rng = createRng(s);
      let state: SimGameState | null = freshGameState(0, feel.clock);
      let r = simulateFrom(state, rules, rng, 'quarter');
      for (let i = 0; i < 6 && r.next; i++) {
        state = r.next;
        r = simulateFrom(state, rules, rng, 'quarter');
      }
      expect(r.over || r.toOvertime).toBe(true);
    }
  });
});
