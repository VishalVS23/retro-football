import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('seeded rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gives different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(3);
  });

  it('stays inside its ranges', () => {
    const r = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('hits every value of int() roughly evenly', () => {
    const r = createRng(99);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[r.int(0, 5)]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });

  it('can save and resume exactly where it left off', () => {
    const r = createRng(123);
    r.next();
    r.next();
    const saved = r.getState();
    const expected = [r.next(), r.next(), r.next()];
    const resumed = createRng(0);
    resumed.setState(saved);
    expect([resumed.next(), resumed.next(), resumed.next()]).toEqual(expected);
  });

  it('pick() refuses an empty list', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});
