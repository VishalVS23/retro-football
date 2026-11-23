import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { generatePlayer } from '../players/generate';
import { generateLeague, depthChart } from '../league/league';
import { createRng } from './rng';
import { KICK_NORMS, isPressureKick, kickerRules, pressureSweep, punterRules, type KickRole } from './kickRatings';
import { fieldGoalDistance, inFieldGoalRange, resolveKick, type KickRules } from './kicking';
import { resolvePunt } from './punting';
import type { Player } from '../players/player';

const on = { ...feel.ratings, enabled: 1 };
const off = { ...feel.ratings, enabled: 0 };

/** A kicker / punter exactly `delta` points above (below) the average starter (fractions allowed, so 0 = exactly average). */
const mk = (role: KickRole, delta: number, traits: Player['traits'] = []): Player => {
  const p = generatePlayer(createRng(5), { id: 1, position: role, quality: 12, age: 27 });
  for (const [k, v] of Object.entries(KICK_NORMS[role])) (p.attributes as Record<string, number>)[k] = v! + delta;
  p.traits = traits;
  return p;
};

/** Share of meter taps (spread evenly across the bar) that make a field goal of `yards`. */
const makeRate = (yards: number, r: KickRules) => {
  let good = 0;
  const n = 2001;
  for (let i = 0; i < n; i++) if (resolveKick(yards, -1 + (2 * i) / (n - 1), r).result === 'good') good++;
  return good / n;
};

describe('kicker and punter averages', () => {
  it('KICK_NORMS matches the starters the generator makes (within a point)', () => {
    const leagues = [11, 22, 33].map((s) => generateLeague(s * 1009));
    for (const [role, norms] of Object.entries(KICK_NORMS) as [KickRole, Record<string, number>][]) {
      for (const [key, norm] of Object.entries(norms)) {
        const vals = leagues.flatMap((lg) => lg.teams.map((t) => (depthChart(lg, t.id)[role][0].player.attributes as Record<string, number>)[key]));
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        expect(Math.abs(avg - norm), `${role} ${key}: league ${avg.toFixed(1)} vs table ${norm}`).toBeLessThan(1);
      }
    }
  });

  it('an average kicker / punter, ratings off, or nobody = exactly today', () => {
    for (const k of [mk('K', 0), null]) expect(kickerRules(k, feel.kicking, on)).toEqual(feel.kicking);
    expect(kickerRules(mk('K', 6), feel.kicking, off)).toEqual(feel.kicking);
    for (const p of [mk('P', 0), null]) expect(punterRules(p, feel.punting, on)).toEqual(feel.punting);
    expect(punterRules(mk('P', 6), feel.punting, off)).toEqual(feel.punting);
  });
});

describe('kicker', () => {
  it('a great leg has about 6-8 yd more range; a weak one less', () => {
    const great = kickerRules(mk('K', 5), feel.kicking, on).maxRangeYards;
    const weak = kickerRules(mk('K', -4), feel.kicking, on).maxRangeYards;
    expect(great - feel.kicking.maxRangeYards).toBeGreaterThanOrEqual(6);
    expect(great - feel.kicking.maxRangeYards).toBeLessThanOrEqual(8);
    expect(weak).toBeLessThan(feel.kicking.maxRangeYards - 4);
    // The FIELD GOAL button follows his range: a 58-yarder only for the big leg.
    const x = [...Array(120).keys()].find((bx) => fieldGoalDistance(bx) === 58)!;
    expect(inFieldGoalRange(x, kickerRules(mk('K', 5), feel.kicking, on))).toBe(true);
    expect(inFieldGoalRange(x, feel.kicking)).toBe(false);
  });

  it('accuracy widens the green; a great kicker makes clearly more 45-yarders', () => {
    const avg = makeRate(45, feel.kicking);
    const great = makeRate(45, kickerRules(mk('K', 5), feel.kicking, on));
    const poor = makeRate(45, kickerRules(mk('K', -4), feel.kicking, on));
    expect(kickerRules(mk('K', 5), feel.kicking, on).farGreen).toBeGreaterThan(feel.kicking.farGreen * 1.3);
    expect(great).toBeGreaterThan(avg * 1.5);
    expect(poor).toBeLessThan(avg * 0.7);
    expect(poor).toBeGreaterThan(0); // never impossible
  });

  it('extra points stay easy even for a poor kicker', () => {
    expect(makeRate(19, kickerRules(mk('K', -4), feel.kicking, on))).toBeGreaterThan(0.25);
    expect(makeRate(19, feel.kicking)).toBeGreaterThan(0.35);
  });
});

describe('pressure kicks', () => {
  it('overtime, or Q4 last 2 minutes within one score', () => {
    expect(isPressureKick({ quarter: 4, timeLeft: 90, margin: -2, overtime: false })).toBe(true);
    expect(isPressureKick({ quarter: 4, timeLeft: 90, margin: 8, overtime: false })).toBe(true);
    expect(isPressureKick({ quarter: 4, timeLeft: 90, margin: 14, overtime: false })).toBe(false);
    expect(isPressureKick({ quarter: 4, timeLeft: 200, margin: 0, overtime: false })).toBe(false);
    expect(isPressureKick({ quarter: 2, timeLeft: 5, margin: 0, overtime: false })).toBe(false);
    expect(isPressureKick({ quarter: 5, timeLeft: 0, margin: 0, overtime: true })).toBe(true);
  });

  it('the meter speeds up, less for a calm kicker, not at all with ice in his veins', () => {
    const t = 1;
    expect(pressureSweep(t, mk('K', 0), false, on)).toBe(t);
    const avg = pressureSweep(t, mk('K', 0), true, on);
    const calm = pressureSweep(t, mk('K', 5), true, on);
    const shaky = pressureSweep(t, mk('K', -4), true, on);
    expect(avg).toBeCloseTo(t / (1 + feel.ratings.pressureMeterSpeedUp), 5);
    expect(calm).toBeGreaterThan(avg);
    expect(shaky).toBeLessThan(avg);
    expect(shaky).toBeGreaterThan(t / 2.01);
    expect(pressureSweep(t, mk('K', -4, ['iceVeins']), true, on)).toBe(t);
  });
});

describe('punter', () => {
  it('a big leg punts further; accuracy means fewer shanks', () => {
    const big = punterRules(mk('P', 5), feel.punting, on);
    expect(big.centreYards - feel.punting.centreYards).toBeCloseTo(7.5, 5);
    expect(resolvePunt(0, big).air).toBeGreaterThan(resolvePunt(0, feel.punting).air);
    expect(big.green).toBeGreaterThan(feel.punting.green * 1.2);
    const weak = punterRules(mk('P', -4), feel.punting, on);
    expect(weak.green).toBeLessThan(feel.punting.green);
    expect(weak.centreYards).toBeLessThan(feel.punting.centreYards);
    expect(weak.edgeYards).toBeGreaterThan(feel.punting.shankMaxYards); // a good punt still beats a shank
  });
});
