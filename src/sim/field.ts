/**
 * Field geometry, in yards. These are rules of football, not feel values.
 * x runs along the field: 0 = back of our end zone, 120 = back of theirs.
 * y runs across the field: 0 = top sideline, FIELD_WIDTH = bottom sideline.
 */
export const END_ZONE_DEPTH = 10;
export const FIELD_LENGTH = 100; // goal line to goal line
export const TOTAL_LENGTH = FIELD_LENGTH + END_ZONE_DEPTH * 2; // 120
export const FIELD_WIDTH = 160 / 3; // 53.33 yards

/**
 * The number painted on the field at a given x (yards from the back of our end zone).
 * Returns null where no number is painted (only every 10 yards, never on goal lines).
 * e.g. x=20 -> 10, x=60 -> 50, x=100 -> 10.
 */
export function yardLineNumber(x: number): number | null {
  const fromGoal = x - END_ZONE_DEPTH;
  if (fromGoal <= 0 || fromGoal >= FIELD_LENGTH) return null;
  if (fromGoal % 10 !== 0) return null;
  return fromGoal <= 50 ? fromGoal : FIELD_LENGTH - fromGoal;
}

/**
 * Is this spot inside the field (sidelines and end lines included as in-bounds)?
 * Players are judged by their centre point = their feet.
 */
export function isInBounds(p: { x: number; y: number }): boolean {
  return p.x >= 0 && p.x <= TOTAL_LENGTH && p.y >= 0 && p.y <= FIELD_WIDTH;
}
