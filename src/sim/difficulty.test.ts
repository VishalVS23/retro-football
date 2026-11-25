import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { adjustSpeedFor, levers, sanitizeDifficulty, withDifficulty } from './difficulty';

describe('difficulty', () => {
  it('Normal is the game as it is (the very same values)', () => {
    expect(withDifficulty(feel, 'normal')).toBe(feel);
    expect(adjustSpeedFor(0.4, 'normal', feel)).toBe(0.4);
    expect(levers('normal', feel).tips).toBe(true);
  });

  it('Hard: quicker defenders, wider misses, smaller catch zones, shorter pocket, stronger CPU drives, fewer reads, no tips', () => {
    const h = withDifficulty(feel, 'hard');
    expect(h.defense.cbBallReactionTime).toBeLessThan(feel.defense.cbBallReactionTime);
    expect(h.zone.deepBallReactionTime).toBeLessThan(feel.zone.deepBallReactionTime);
    expect(h.ratings.scatterPerYard).toBeGreaterThan(feel.ratings.scatterPerYard);
    expect(h.catching.catchRadiusYards).toBeLessThan(feel.catching.catchRadiusYards);
    expect(h.bullet.catchRadiusYards).toBeLessThan(feel.bullet.catchRadiusYards);
    expect(h.pocket.shedTime).toBeLessThan(feel.pocket.shedTime);
    expect(h.oppDrive.strength).toBeGreaterThan(feel.oppDrive.strength);
    expect(h.ratings.qbReadChance).toBeLessThan(feel.ratings.qbReadChance);
    expect(h.defCalls.disguiseChance).toBeGreaterThan(feel.defCalls.disguiseChance);
    expect(adjustSpeedFor(0.4, 'hard', feel)).toBeGreaterThan(0.4);
    expect(adjustSpeedFor(0.9, 'hard', feel)).toBe(1);
    expect(levers('hard', feel).tips).toBe(false);
  });

  it('never changes the original values (the league sims and SIM keep using them)', () => {
    const before = JSON.stringify(feel);
    withDifficulty(feel, 'hard');
    expect(JSON.stringify(feel)).toBe(before);
  });

  it('old or damaged values = Normal', () => {
    expect(sanitizeDifficulty(undefined)).toBe('normal');
    expect(sanitizeDifficulty('HARD')).toBe('normal');
    expect(sanitizeDifficulty('rookie')).toBe('normal');
    expect(sanitizeDifficulty('hard')).toBe('hard');
  });
});
