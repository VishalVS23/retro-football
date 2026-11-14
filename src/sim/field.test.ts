import { describe, expect, it } from 'vitest';
import { FIELD_WIDTH, TOTAL_LENGTH, yardLineNumber } from './field';

describe('field', () => {
  it('has standard dimensions', () => {
    expect(TOTAL_LENGTH).toBe(120);
    expect(FIELD_WIDTH).toBeCloseTo(53.33, 2);
  });

  it('numbers the yard lines 10..50..10', () => {
    expect(yardLineNumber(20)).toBe(10);
    expect(yardLineNumber(60)).toBe(50);
    expect(yardLineNumber(70)).toBe(40);
    expect(yardLineNumber(100)).toBe(10);
  });

  it('paints no number on goal lines, end zones or in-between lines', () => {
    expect(yardLineNumber(10)).toBeNull();
    expect(yardLineNumber(110)).toBeNull();
    expect(yardLineNumber(5)).toBeNull();
    expect(yardLineNumber(25)).toBeNull();
  });
});
