/**
 * College-style overtime (Stage 2 step 7b). Pure rules, no Phaser.
 * - Tied after Q4: each OT period we get the ball at their 25 (untimed), then the CPU gets a
 *   simulated drive from our 25. Still tied: next period.
 * - From the 3rd overtime on it's a 2-point shootout: one 2-point try each.
 * - No punts in overtime. We always go first (simplification; real college OT alternates).
 */
import { OPP_GOAL_X, TRY_X, YARDS_FOR_FIRST_DOWN, type DriveEvent, type GameState } from './drive';

/** Our overtime possessions start at their 25. */
export const OT_START_X = OPP_GOAL_X - 25;
/** From this period on: 2-point shootout. */
export const SHOOTOUT_PERIOD = 3;

/** Line up our possession for overtime period `period` (1 = OT). */
export function overtimeStart(s: GameState, period: number): GameState {
  if (period >= SHOOTOUT_PERIOD) return { ...s, ballX: TRY_X, down: 1, firstDownX: OPP_GOAL_X, oppStartX: null, tryPending: true };
  return { ...s, ballX: OT_START_X, down: 1, firstDownX: OT_START_X + YARDS_FOR_FIRST_DOWN, oppStartX: null, tryPending: false };
}

/**
 * Is our overtime possession over after this play or kick? It goes on after a plain down, a first
 * down, their returner fumbling it back to us, or a touchdown (the try is still to come).
 */
export function possessionOver(event: DriveEvent, after: GameState): boolean {
  if (after.tryPending) return false;
  return !(event === null || event === 'firstDown' || event === 'takeaway');
}

/** "OVERTIME", "2ND OVERTIME", "3RD OT: 2-PT SHOOTOUT". */
export function overtimeBanner(period: number): string {
  if (period === 1) return 'OVERTIME';
  const nth = period === 2 ? '2ND' : period === 3 ? '3RD' : `${period}TH`;
  return period >= SHOOTOUT_PERIOD ? `${nth} OT: 2-PT SHOOTOUT` : `${nth} OVERTIME`;
}

/** After both possessions: game over (someone leads) or the next period. */
export function afterBothPossessions(s: GameState): 'over' | 'next' {
  return s.us === s.them ? 'next' : 'over';
}
