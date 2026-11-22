import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { PLAYS } from './routes';
import { simulateRun, type RunPlayers } from './runSim';
import { checkTackles, startCarrier, type Pursuer } from './carry';
import { fumbleChance } from './fumble';
import { oddsShift } from './ratings';
import { generatePlayer } from '../players/generate';
import { generateLeague, depthChart } from '../league/league';
import { createRng } from './rng';
import type { Position } from '../players/positions';
import { ROLE_NORMS, carryFor, pursuerFor, roleRating, securityRatio, tackleFor, type CarrierRole, type TacklerRole } from './runRatings';

/** A player exactly `delta` points above (below) the average starter at `role` in everything that matters here. */
const mk = (pos: Position, role: CarrierRole | TacklerRole, delta: number) => {
  const p = generatePlayer(createRng(7), { id: 1, position: pos, quality: 12, age: 26 });
  for (const [k, v] of Object.entries(ROLE_NORMS[role])) (p.attributes as Record<string, number>)[k] = Math.max(1, Math.min(20, Math.round(v! + delta)));
  p.traits = [];
  return p;
};
const on = { ...feel.ratings, enabled: 1 };
const off = { ...feel.ratings, enabled: 0 };

describe('role averages', () => {
  it('ROLE_NORMS matches the average starters the generator makes (within a point)', () => {
    const leagues = [11, 22, 33].map((s) => generateLeague(s * 1009));
    const take: Record<CarrierRole | TacklerRole, number> = { QB: 1, RB: 1, WR: 3, CB: 3, LB: 1, S: 1, DL: 2 };
    for (const [role, norms] of Object.entries(ROLE_NORMS) as [CarrierRole | TacklerRole, Record<string, number>][]) {
      for (const [key, norm] of Object.entries(norms)) {
        const vals: number[] = [];
        for (const lg of leagues)
          for (const t of lg.teams) for (const slot of depthChart(lg, t.id)[role].slice(0, take[role])) vals.push((slot.player.attributes as Record<string, number>)[key]);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        expect(Math.abs(avg - norm), `${role} ${key}: league ${avg.toFixed(1)} vs table ${norm}`).toBeLessThan(1);
      }
    }
  });

  it('an average starter reads as 10; switched off or nobody = 10', () => {
    const rb = mk('RB', 'RB', 0);
    expect(roleRating(rb, 'speed', 'RB', on)).toBeCloseTo(10 + Math.round(ROLE_NORMS.RB.speed!) - ROLE_NORMS.RB.speed!, 5);
    expect(roleRating(mk('RB', 'RB', 5), 'speed', 'RB', off)).toBe(10);
    expect(roleRating(null, 'speed', 'RB', on)).toBe(10);
  });

  it('judged by the job he is doing: a receiver playing corner is a poor tackler', () => {
    const wr = mk('WR', 'WR', 0);
    expect(roleRating(wr, 'tackling', 'CB', on)).toBeLessThan(5);
  });
});

describe('the numbers', () => {
  it('odds: 0 steps = no change, never leaves 0..1, one step doubles the odds', () => {
    expect(oddsShift(0.15, 0)).toBe(0.15);
    expect(oddsShift(0.5, 1)).toBeCloseTo(2 / 3, 5);
    expect(oddsShift(0.6, 50)).toBeLessThanOrEqual(1);
    expect(oddsShift(0.6, -50)).toBeGreaterThanOrEqual(0);
  });

  it('a faster, shiftier, quicker runner: more speed, bigger juke, quicker recovery', () => {
    const base = { ...feel.running };
    const star = carryFor(mk('RB', 'RB', 5), 'RB', base, on);
    expect(star.runSpeed).toBeGreaterThan(base.runSpeed);
    expect(star.jukeSpeed).toBeGreaterThan(base.jukeSpeed);
    expect(star.jukeRecoverTime!).toBeLessThan(base.jukeRecoverTime);
    expect(carryFor(mk('RB', 'RB', 5), 'RB', base, off)).toEqual(base);
  });

  it('strong runners break more tackles; sure tacklers allow fewer; each counts once', () => {
    const tk = feel.tackling;
    expect(tackleFor(mk('RB', 'RB', 5), 'RB', tk, on).brokenTackleChance).toBeGreaterThan(tk.brokenTackleChance);
    const fights = mk('RB', 'RB', 0);
    fights.traits = ['extraYards'];
    expect(tackleFor(fights, 'RB', tk, on).brokenTackleChance).toBeGreaterThan(tackleFor(mk('RB', 'RB', 0), 'RB', tk, on).brokenTackleChance);
    const sure = pursuerFor(mk('LB', 'LB', 5), 'LB', { pos: { x: 0, y: 0 }, speed: 7, stunned: 0 }, on);
    expect(sure.brokenSteps!).toBeLessThan(0);
    expect(sure.jukeSteps!).toBeLessThan(0);
    expect(sure.speed).toBeGreaterThan(7);
  });

  it('checkTackles uses each tackler his own numbers', () => {
    const at = { x: 50, y: 20 };
    const runner = startCarrier(at);
    const tackle = { tackleReachYards: 1.1, brokenTackleChance: 0.3, jukeEvadeChance: 0.6, stunTime: 0.5 };
    const make = (brokenSteps: number): Pursuer => ({ pos: { x: 50.5, y: 20 }, speed: 7, stunned: 0, brokenSteps });
    // A roll of 0.4: breaks a 0.3 tackle? No. Against a weak tackler (odds x4 -> 0.63) he breaks it.
    expect(checkTackles([make(0)], runner, () => 0.4, tackle).tackled).toBe(true);
    expect(checkTackles([make(2)], runner, () => 0.4, tackle).tackled).toBe(false);
  });

  it('fumbles: good ball security halves them, poor doubles; strip trait and big hitter add', () => {
    const f = feel.fumble;
    const safe = securityRatio(mk('RB', 'RB', feel.ratings.securityHalvingPoints), 'RB', on);
    expect(safe).toBeCloseTo(0.5, 1);
    expect(fumbleChance({ ratio: safe }, f)).toBeCloseTo(f.chance * safe, 5);
    expect(fumbleChance({ bigHitter: true, tacklerSpeed: 1 }, f)).toBe(Math.max(f.chance, f.bigHitChance));
    expect(fumbleChance({ ratio: 1000 }, f)).toBeLessThanOrEqual(1);
  });
});

// ---------- Balance (headless Dive / Toss, a runner who jukes the first tackler) ----------

const team = (rbD: number, defD: number): RunPlayers => ({
  rb: mk('RB', 'RB', rbD),
  cover: [mk('CB', 'CB', defD), mk('CB', 'CB', defD), mk('CB', 'CB', defD), mk('LB', 'LB', defD)],
  safety: mk('S', 'S', defD),
  rush: [mk('DL', 'DL', defD), mk('DL', 'DL', defD)],
});
function runs(name: string, players: RunPlayers | undefined) {
  const play = PLAYS.find((p) => p.name === name)!;
  let yards = 0;
  let big = 0;
  for (let s = 1; s <= 300; s++) {
    const r = simulateRun(play, s * 7919, feel, 2.5, 45, undefined, 'man', players);
    yards += r.yards;
    if (r.yards >= 10) big++;
  }
  return { avg: yards / 300, big: big / 300 };
}

describe('balance: ball carriers vs tacklers', () => {
  it('average runner vs average defense = today', () => {
    for (const name of ['Dive', 'Toss']) expect(Math.abs(runs(name, team(0, 0)).avg - runs(name, undefined).avg)).toBeLessThan(0.3);
  }, 60000);

  it('a star RB gains clearly more, and against a weak defense breaks some long ones (but not every run)', () => {
    for (const name of ['Dive', 'Toss']) {
      const avg = runs(name, team(0, 0)).avg;
      expect(runs(name, team(5, 0)).avg).toBeGreaterThan(avg + 0.7);
      const vsWeak = runs(name, team(5, -4));
      expect(vsWeak.avg).toBeGreaterThan(avg + 2);
      expect(vsWeak.big).toBeLessThan(0.15);
    }
  }, 60000);

  it('a weak RB vs a star defense: less, but never hopeless', () => {
    for (const name of ['Dive', 'Toss']) {
      const r = runs(name, team(-4, 4)).avg;
      expect(r).toBeLessThan(runs(name, team(0, 0)).avg - 0.4);
      expect(r).toBeGreaterThan(0.8);
    }
  }, 60000);
});
