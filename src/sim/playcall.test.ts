import { describe, expect, it } from 'vitest';
import { fieldZone } from './playcall';
import { formation } from './formation';
import { PLAYS } from './routes';
import { OWN_GOAL_X } from './drive';

const at = (yardsFromOurGoal: number) => OWN_GOAL_X + yardsFromOurGoal;

describe('play calling', () => {
  it('names the field zone like a broadcast', () => {
    expect(fieldZone(at(25))).toBe('OWN TERRITORY');
    expect(fieldZone(at(39))).toBe('OWN TERRITORY');
    expect(fieldZone(at(40))).toBe('MID-FIELD'); // our 40
    expect(fieldZone(at(50))).toBe('MID-FIELD');
    expect(fieldZone(at(79))).toBe('MID-FIELD'); // their 21
    expect(fieldZone(at(80))).toBe('RED ZONE'); // their 20
    expect(fieldZone(at(94))).toBe('RED ZONE');
    expect(fieldZone(at(95))).toBe('GOAL LINE'); // their 5
  });

  it('every play gives each receiver in the formation a route', () => {
    const wrs = formation(at(25)).skill.length; // 3 receivers + the running back
    expect(PLAYS.length).toBeGreaterThanOrEqual(4);
    for (const p of PLAYS) {
      expect(p.routes).toHaveLength(wrs);
      expect(p.name.length).toBeGreaterThan(0);
    }
    expect(new Set(PLAYS.map((p) => p.name)).size).toBe(PLAYS.length); // names are unique
  });
});
