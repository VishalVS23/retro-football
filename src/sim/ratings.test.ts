import { describe, expect, it } from 'vitest';
import { attr, blend, halving, scale } from './ratings';
import { generatePlayer } from '../players/generate';
import { createRng } from './rng';
import { generateLeague } from '../league/league';
import { defenseLineup, offenseLineup } from '../league/lineup';
import { depthChart } from '../league/league';

const on = { enabled: 1 };
const off = { enabled: 0 };

describe('ratings -> on-field numbers', () => {
  const p = generatePlayer(createRng(1), { id: 0, position: 'WR', quality: 15, age: 25 });

  it('a 10 is exactly today; better and worse move it by the per-point amount', () => {
    expect(scale(10, 0.012)).toBe(1);
    expect(scale(20, 0.012)).toBeCloseTo(1.12);
    expect(scale(5, 0.012)).toBeCloseTo(0.94);
    expect(scale(1, 0.5)).toBe(0.1); // never below the floor
  });

  it('switched off (or nobody there), everyone is a 10', () => {
    expect(attr(p, 'speed', on)).toBe(p.attributes.speed);
    expect(attr(p, 'speed', off)).toBe(10);
    expect(attr(null, 'speed', on)).toBe(10);
    expect(blend(p, [['shortAccuracy', 1], ['deepAccuracy', 1]], off)).toBe(10);
    expect(blend(p, [['speed', 3], ['hands', 1]], on)).toBeCloseTo((p.attributes.speed * 3 + p.attributes.hands) / 4);
  });

  it('bad-thing chances halve for every few points better, double for worse, capped', () => {
    expect(halving(0.05, 10, 5)).toBeCloseTo(0.05);
    expect(halving(0.05, 15, 5)).toBeCloseTo(0.025);
    expect(halving(0.05, 5, 5)).toBeCloseTo(0.1);
    expect(halving(0.5, 1, 2)).toBe(0.95);
  });
});

describe('lineups', () => {
  const league = generateLeague(31);
  it('our skill spots are WR1 wide top, WR3 slot, WR2 wide bottom, RB1, TE1; their corners mirror them, LB1 / LB2 on the RB / TE', () => {
    const c = depthChart(league, 2);
    const o = offenseLineup(league, 2);
    expect(o.qb).toBe(c.QB[0].player);
    expect(o.skill).toEqual([c.WR[0].player, c.WR[2].player, c.WR[1].player, c.RB[0].player, c.TE[0].player]);
    const d = defenseLineup(league, 2);
    expect(d.cover).toEqual([c.CB[0].player, c.CB[2].player, c.CB[1].player, c.LB[0].player, c.LB[1].player]);
    expect(d.safety).toBe(c.S[0].player);
  });

  it('the lines (3h-a): five blockers LT LG C RG RT = OL1 OL4 OL3 OL5 OL2; four rushers edge, inside, inside, edge = DL1 DL3 DL4 DL2', () => {
    const c = depthChart(league, 2);
    expect(offenseLineup(league, 2).line).toEqual([c.OL[0], c.OL[3], c.OL[2], c.OL[4], c.OL[1]].map((s) => s.player));
    expect(defenseLineup(league, 2).rush).toEqual([c.DL[0], c.DL[2], c.DL[3], c.DL[1]].map((s) => s.player));
    expect(new Set(offenseLineup(league, 2).line).size).toBe(5);
  });
});
