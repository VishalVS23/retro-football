/**
 * Turns player ratings (1-20) into on-field numbers (Stage 3d+). Pure logic, no Phaser.
 *
 * THE RULE: a rating of 10 plays exactly like the plain `feel.ts` value. Each point above or below
 * moves it by a per-point amount that also lives in feel.ts (group `ratings`), so the ⚙ panel can
 * tune it. With `ratings.enabled` 0, everyone plays as a 10 (to compare with and without).
 */
import type { AttributeKey } from '../players/attributes';
import type { Player } from '../players/player';

export const AVERAGE_RATING = 10;

export interface RatingSwitch {
  /** 1 = ratings count; 0 = everyone plays as a 10. */
  enabled: number;
}

/** A player's attribute as the game should use it (10 when ratings are switched off or nobody's there). */
export function attr(p: Player | null | undefined, key: AttributeKey, r: RatingSwitch): number {
  if (!p || !r.enabled) return AVERAGE_RATING;
  return p.attributes[key];
}

/** Average of several attributes, with weights (e.g. accuracy by throw length). */
export function blend(p: Player | null | undefined, parts: [AttributeKey, number][], r: RatingSwitch): number {
  let sum = 0;
  let total = 0;
  for (const [k, w] of parts) {
    sum += attr(p, k, r) * w;
    total += w;
  }
  return total > 0 ? sum / total : AVERAGE_RATING;
}

/** 1 at a rating of 10, plus `perPoint` for every point above (minus below). Never below `floor`. */
export function scale(rating: number, perPoint: number, floor = 0.1): number {
  return Math.max(floor, 1 + (rating - AVERAGE_RATING) * perPoint);
}

/**
 * For chances of something going WRONG (drops, misses): every `halvingPoints` better than 10
 * halves it, every `halvingPoints` worse doubles it. Capped at `max`.
 */
export function halving(chance: number, rating: number, halvingPoints: number, max = 0.95): number {
  return Math.min(max, chance * Math.pow(2, -(rating - AVERAGE_RATING) / halvingPoints));
}
