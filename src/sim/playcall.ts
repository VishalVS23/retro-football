/**
 * Play-calling helpers. Pure (no Phaser, no DOM).
 */
import { OPP_GOAL_X, OWN_GOAL_X } from './drive';

export type FieldZone = 'OWN TERRITORY' | 'MID-FIELD' | 'RED ZONE' | 'GOAL LINE';

/**
 * Broadcast-style name for where the ball is (x = line of scrimmage):
 * inside our 40 = own territory, between the 40s = mid-field, inside their 20 = red zone,
 * inside their 5 = goal line.
 */
export function fieldZone(ballX: number): FieldZone {
  const fromOurGoal = ballX - OWN_GOAL_X;
  const toTheirGoal = OPP_GOAL_X - ballX;
  if (toTheirGoal <= 5) return 'GOAL LINE';
  if (toTheirGoal <= 20) return 'RED ZONE';
  if (fromOurGoal < 40) return 'OWN TERRITORY';
  return 'MID-FIELD';
}
