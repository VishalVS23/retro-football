import { describe, expect, it } from 'vitest';
import { generateLeague, teamRatings } from '../league/league';
import { createRng } from '../sim/rng';
import { ACTIVE_MAX } from '../players/positions';
import { generatePlayer } from '../players/generate';
import {
  ACTIVE_MIN,
  canRelease,
  capFor,
  capHit,
  capSheet,
  contractYears,
  deadIfCut,
  ensureContracts,
  fillRosters,
  floorFor,
  guaranteeLeft,
  makeContract,
  marketValue,
  minSalary,
  money,
  releasePlayer,
  startContractYear,
  type Contract,
} from './contracts';

const deal: Contract = { signed: 1, years: 4, salary: 10_000, bonus: 8_000, guaranteed: 15_000 };

describe('contract money', () => {
  it('counts the bonus evenly and only inside the contract', () => {
    expect(capHit(deal, 1)).toBe(12_000);
    expect(capHit(deal, 4)).toBe(12_000);
    expect(capHit(deal, 5)).toBe(0);
    expect(capHit(deal, 0)).toBe(0);
  });
  it('pays the guarantee down from the first season', () => {
    expect(guaranteeLeft(deal, 1)).toBe(15_000);
    expect(guaranteeLeft(deal, 2)).toBe(5_000);
    expect(guaranteeLeft(deal, 3)).toBe(0);
    expect(contractYears(deal, 2).map((r) => r.guaranteed)).toEqual([5_000, 0, 0]);
  });
  it('dead money = bonus not yet counted + guaranteed base still owed', () => {
    expect(deadIfCut(deal, 1)).toBe(8_000 + 15_000);
    expect(deadIfCut(deal, 2)).toBe(6_000 + 5_000);
    expect(deadIfCut(deal, 4)).toBe(2_000);
    expect(deadIfCut(deal, 5)).toBe(0);
  });
  it('the cap rises 5% a season, the floor follows it', () => {
    expect(capFor(1)).toBe(200_000);
    expect(capFor(2)).toBe(210_000);
    expect(floorFor(1)).toBe(160_000);
    expect(money(12_400)).toBe('$12.4M');
    expect(money(850)).toBe('$850K');
  });
  it('new deals are worth about what was asked, never below the minimum', () => {
    const p = generateLeague(5).players[0];
    const rng = createRng(1);
    for (const want of [100, 5_000, 30_000]) {
      const c = makeContract(rng, p, 1, want);
      expect(capHit(c, 1)).toBeGreaterThanOrEqual(minSalary(1));
      if (want > minSalary(1)) expect(Math.abs(capHit(c, 1) - want)).toBeLessThan(want * 0.05 + 10);
      expect(c.guaranteed).toBeLessThanOrEqual(c.salary * c.years);
    }
  });
});

describe('league contracts', () => {
  it('every player gets one and every team starts under the cap, above the floor', () => {
    for (const seed of [1, 2, 3]) {
      const l = generateLeague(seed);
      expect(ensureContracts(l, seed, 1)).toBe(true);
      expect(ensureContracts(l, seed, 1)).toBe(false);
      for (const t of l.teams) {
        for (const id of [...t.roster, ...t.practice]) expect(l.players[id].contract).toBeDefined();
        const s = capSheet(l, t.id, 1);
        expect(s.payroll).toBeLessThanOrEqual(s.cap);
        expect(s.payroll).toBeGreaterThanOrEqual(s.floor);
      }
    }
  });
  it('better players are paid more; quarterbacks most', () => {
    const make = (position: 'QB' | 'RB' | 'WR', quality: number) => generatePlayer(createRng(3), { id: 0, position, quality, age: 25 });
    expect(marketValue(make('WR', 15), 1)).toBeGreaterThan(marketValue(make('WR', 12), 1));
    expect(marketValue(make('QB', 13), 1)).toBeGreaterThan(marketValue(make('RB', 13), 1) * 2);
    expect(marketValue(make('QB', 13), 2)).toBeGreaterThan(marketValue(make('QB', 13), 1));
  });
  it('releasing: off the team, into the pool, dead money on the cap; never below the roster minimum', () => {
    const l = generateLeague(6);
    ensureContracts(l, 6, 1);
    const t = l.teams[0];
    const id = t.roster[0];
    const dead = deadIfCut(l.players[id].contract!, 1);
    const hit = capHit(l.players[id].contract!, 1);
    const before = capSheet(l, 0, 1);
    expect(releasePlayer(l, 0, id, 1)).toBe(dead);
    expect(t.roster).not.toContain(id);
    expect(l.freeAgents).toContain(id);
    expect(l.players[id].contract).toBeUndefined();
    const after = capSheet(l, 0, 1);
    expect(after.dead).toBe(dead);
    expect(after.payroll).toBe(before.payroll - hit + dead);
    while (t.roster.length > ACTIVE_MIN) releasePlayer(l, 0, t.roster[0], 1);
    expect(canRelease(l, 0, t.roster[0]).ok).toBe(false);
    expect(canRelease(l, 0, t.practice[0]).ok).toBe(true);
  });
  it('ten seasons: rosters stay full enough, nobody over the cap for long, no talent hoarding', () => {
    const seed = 9;
    const l = generateLeague(seed);
    ensureContracts(l, seed, 1);
    const gap = (r: number[]) => Math.max(...r) - Math.min(...r);
    const start = gap(l.teams.map((t) => teamRatings(l, t.id).overall));
    for (let y = 2; y <= 10; y++) {
      startContractYear(l, seed, y);
      fillRosters(l, seed, y);
      for (const t of l.teams) {
        expect(t.roster.length).toBeGreaterThanOrEqual(ACTIVE_MIN);
        expect(t.roster.length).toBeLessThanOrEqual(ACTIVE_MAX);
        expect(t.dead?.every((d) => d.year >= y)).toBe(true);
        for (const id of t.roster) expect(capHit(l.players[id].contract!, y)).toBeGreaterThan(0);
        expect(capSheet(l, t.id, y).payroll).toBeLessThanOrEqual(capFor(y) * 1.02);
      }
    }
    expect(gap(l.teams.map((t) => teamRatings(l, t.id).overall))).toBeLessThanOrEqual(start);
  }, 30_000);
});
