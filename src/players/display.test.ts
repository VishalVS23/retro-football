import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { ATTRIBUTE_KEYS, POSITION_WEIGHTS } from './attributes';
import { ATTR_SHORT, CARD_ATTRS, band, keyAttributes, otherPositions, potentialGuess, stars, unitOf } from './display';
import { generatePlayer } from './generate';
import { currentAbility } from './player';
import { POSITIONS } from './positions';
import { generateLeague } from '../league/league';
import { practiceRows, rosterRows } from '../league/rosterView';
import { ACTIVE_MAX, PRACTICE_MAX, STARTERS } from './positions';

describe('display rules', () => {
  it('stars: 1-5, a typical starter (12) is 3, higher ratings never fewer stars', () => {
    expect(stars(12)).toBe(3);
    expect(stars(1)).toBe(1);
    expect(stars(20)).toBe(5);
    for (let r = 1; r < 20; r += 0.1) expect(stars(r + 0.1)).toBeGreaterThanOrEqual(stars(r));
  });

  it('colour bands run from poor to great', () => {
    expect([3, 8, 12, 15, 18].map(band)).toEqual(['poor', 'weak', 'ok', 'good', 'great']);
  });

  it('every attribute has a unique three-letter label', () => {
    const labels = ATTRIBUTE_KEYS.map((k) => ATTR_SHORT[k]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l).toMatch(/^[A-Z]{3}$/);
  });

  it('card ratings and key ratings are ones that matter at the position', () => {
    for (const pos of POSITIONS) {
      for (const k of CARD_ATTRS[pos]) expect(POSITION_WEIGHTS[pos][k], `${pos} ${k}`).toBeGreaterThan(0);
      const keys = keyAttributes(pos);
      expect(keys.length).toBe(Object.keys(POSITION_WEIGHTS[pos]).length);
      for (let i = 1; i < keys.length; i++) expect(POSITION_WEIGHTS[pos][keys[i - 1]]!).toBeGreaterThanOrEqual(POSITION_WEIGHTS[pos][keys[i]]!);
    }
  });

  it('the potential guess always contains the truth, never dips below today, and never changes', () => {
    const rng = createRng(5);
    for (let i = 0; i < 2000; i++) {
      const p = generatePlayer(rng, { id: i, position: rng.pick(POSITIONS), quality: rng.range(5, 18), age: rng.int(21, 34) });
      const [lo, hi] = potentialGuess(p);
      expect(lo).toBeLessThanOrEqual(stars(p.potential));
      expect(hi).toBeGreaterThanOrEqual(stars(p.potential));
      expect(lo).toBeGreaterThanOrEqual(stars(currentAbility(p)));
      expect(hi - lo).toBeLessThanOrEqual(2);
      expect(potentialGuess(p)).toEqual([lo, hi]);
    }
  });

  it('other positions: best familiarity first, never his own', () => {
    const rng = createRng(9);
    for (let i = 0; i < 300; i++) {
      const p = generatePlayer(rng, { id: i, position: 'CB', quality: 12, age: 25 });
      const others = otherPositions(p);
      expect(others.map((o) => o.pos)).not.toContain('CB');
      if (p.familiarity.S && p.familiarity.WR) expect(others[0].pos).toBe('S');
    }
  });

  it('units', () => {
    expect(unitOf('QB')).toBe('offense');
    expect(unitOf('S')).toBe('defense');
    expect(unitOf('P')).toBe('special');
  });
});

describe('roster view', () => {
  const league = generateLeague(77);

  it('lists the whole active roster in depth order, starters first at each position', () => {
    const rows = rosterRows(league, 4);
    expect(rows).toHaveLength(ACTIVE_MAX);
    expect(rows[0].slot).toBe('QB1');
    expect(rows[0].starter).toBe(true);
    expect(rows[1].slot).toBe('QB2');
    expect(rows[1].starter).toBe(false);
    expect(rows.filter((r) => r.starter)).toHaveLength(Object.values(STARTERS).reduce((a, b) => a + b, 0));
    expect(rows.filter((r) => r.position === 'WR').map((r) => r.slot)).toEqual(['WR1', 'WR2', 'WR3', 'WR4']);
  });

  it('lists the practice squad grouped by position', () => {
    const rows = practiceRows(league, 4);
    expect(rows).toHaveLength(PRACTICE_MAX);
    const order = rows.map((r) => POSITIONS.indexOf(r.position));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
