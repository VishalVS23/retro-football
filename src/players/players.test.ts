import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { ATTRIBUTE_KEYS, HIDDEN } from './attributes';
import { generatePlayer, type PlayerSpec } from './generate';
import { currentAbility, familiarityAt, playerPersonality, positionRating, type Player } from './player';
import { POSITIONS, PEAK_AGE, ROSTER_TARGET, STARTERS, ACTIVE_MAX, type Position } from './positions';
import { TRAITS, TRAIT_CONFLICTS } from './traits';

function many(pos: Position, quality: number, age: number, n = 300, seed = 1): Player[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => generatePlayer(rng, { id: i, position: pos, quality, age }));
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('roster rules', () => {
  it('24 starters (11 + 11 + K + P) and a 31-man active roster', () => {
    const sum = (r: Record<Position, number>) => POSITIONS.reduce((s, p) => s + r[p], 0);
    expect(sum(STARTERS)).toBe(24);
    expect(sum(ROSTER_TARGET)).toBe(ACTIVE_MAX);
    for (const p of POSITIONS) expect(ROSTER_TARGET[p]).toBeGreaterThanOrEqual(STARTERS[p]);
  });
});

describe('player generation', () => {
  it('is the same for the same seed', () => {
    const spec: PlayerSpec = { id: 7, position: 'WR', quality: 13, age: 24 };
    expect(generatePlayer(createRng(42), spec)).toEqual(generatePlayer(createRng(42), spec));
    expect(generatePlayer(createRng(43), spec)).not.toEqual(generatePlayer(createRng(42), spec));
  });

  it('keeps every attribute on the 1-20 scale', () => {
    for (const pos of POSITIONS) {
      for (const p of many(pos, 19, 33, 50)) {
        for (const k of ATTRIBUTE_KEYS) expect(p.attributes[k]).toBeGreaterThanOrEqual(1), expect(p.attributes[k]).toBeLessThanOrEqual(20);
        for (const k of HIDDEN) expect(p.hidden[k]).toBeGreaterThanOrEqual(1), expect(p.hidden[k]).toBeLessThanOrEqual(20);
      }
    }
  });

  it('comes out at the quality asked for, at every position and age', () => {
    for (const pos of POSITIONS) {
      for (const q of [6, 10, 15]) {
        for (const age of [22, 27, 33]) {
          const avg = mean(many(pos, q, age, 100).map(currentAbility));
          // Veterans can fall a bit short: lost speed can't always be made up when the rest is near 20
          // (a 33-year-old star running back is rare, as it should be).
          expect(Math.abs(avg - q), `${pos} q${q} age ${age}: ${avg.toFixed(2)}`).toBeLessThan(age > 30 ? 0.8 : 0.5);
        }
      }
    }
  });

  it('players at the same quality still differ', () => {
    const ratings = many('WR', 12, 25).map((p) => p.attributes.speed);
    expect(Math.max(...ratings) - Math.min(...ratings)).toBeGreaterThanOrEqual(5);
  });

  it('looks like his position', () => {
    const qb = many('QB', 12, 27);
    const ol = many('OL', 12, 27);
    const k = many('K', 12, 27);
    expect(mean(qb.map((p) => p.attributes.throwPower))).toBeGreaterThan(mean(ol.map((p) => p.attributes.throwPower)) + 6);
    expect(mean(ol.map((p) => p.attributes.speed))).toBeLessThan(8);
    expect(mean(ol.map((p) => p.attributes.strength))).toBeGreaterThan(10);
    expect(mean(k.map((p) => p.attributes.tackling))).toBeLessThan(4);
  });

  it('veterans have lost speed, and lead more', () => {
    const young = many('RB', 13, 24);
    const old = many('RB', 13, 32);
    expect(mean(old.map((p) => p.attributes.speed))).toBeLessThan(mean(young.map((p) => p.attributes.speed)) - 2);
    expect(mean(old.map((p) => p.attributes.leadership))).toBeGreaterThan(mean(young.map((p) => p.attributes.leadership)) + 1.5);
  });

  it('potential is never below current ability, and young players have more room to grow', () => {
    const young = many('QB', 10, 22);
    const peak = many('QB', 10, PEAK_AGE.QB + 2);
    for (const p of [...young, ...peak]) expect(p.potential).toBeGreaterThanOrEqual(currentAbility(p));
    const room = (ps: Player[]) => mean(ps.map((p) => p.potential - currentAbility(p)));
    expect(room(young)).toBeGreaterThan(2);
    // At or past his peak: no room to grow at all (hidden gems are young players only).
    for (const p of peak) expect(p.potential).toBe(currentAbility(p));
  });

  it('plays worse away from his natural position', () => {
    for (const p of many('CB', 14, 25, 100)) {
      expect(familiarityAt(p, 'CB')).toBe('natural');
      expect(familiarityAt(p, 'QB')).toBe('awkward');
      expect(positionRating(p, 'QB')).toBeLessThan(positionRating(p));
    }
    // Corners can often cover as safeties; never as a natural.
    const cbs = many('CB', 14, 25);
    const asSafety = cbs.filter((p) => p.familiarity.S);
    expect(asSafety.length).toBeGreaterThan(50);
    for (const p of asSafety) expect(['accomplished', 'competent']).toContain(p.familiarity.S);
  });

  it('gives traits only to positions they fit, at most two, never two that clash', () => {
    let withTraits = 0;
    for (const pos of POSITIONS) {
      for (const p of many(pos, 13, 26, 200)) {
        expect(p.traits.length).toBeLessThanOrEqual(2);
        if (p.traits.length) withTraits++;
        for (const t of p.traits) {
          const allowed = TRAITS[t].positions;
          if (allowed !== 'all') expect(allowed).toContain(pos);
        }
        for (const [a, b] of TRAIT_CONFLICTS) expect(p.traits.includes(a) && p.traits.includes(b)).toBe(false);
      }
    }
    expect(withTraits).toBeGreaterThan(200); // some players have traits, most of the 2200 don't
    expect(withTraits).toBeLessThan(1500);
  });

  it('gives a spread of personalities, with model professionals rare', () => {
    const ps = POSITIONS.flatMap((pos, i) => many(pos, 12, 26, 200, i + 10));
    const counts = new Map<string, number>();
    for (const p of ps) counts.set(playerPersonality(p), (counts.get(playerPersonality(p)) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(10);
    expect((counts.get('Model Professional') ?? 0) / ps.length).toBeLessThan(0.08);
    expect((counts.get('Balanced') ?? 0) / ps.length).toBeLessThan(0.6);
  });
});
