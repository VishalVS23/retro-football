/**
 * Which colour each team wears on the field (Stage 3b). Pure logic.
 * Each team wears its main colour unless it would blend into the grass, or (for the opponent)
 * look like the other team; then its second colour, and as a last resort white or black.
 */
import type { TeamDef } from './teams';

/** Grass colour on the field (FieldScene's turf). */
export const TURF = '#2f6b4f';
/** Two colours closer than this (RGB distance, 0-441) are too alike on the field. */
export const MIN_COLOR_DISTANCE = 110;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

const okOn = (c: string, avoid: string[]) => avoid.every((x) => colorDistance(c, x) >= MIN_COLOR_DISTANCE);

function pick(team: Pick<TeamDef, 'colors'>, avoid: string[]): string {
  for (const c of [...team.colors, '#ffffff', '#111111']) if (okOn(c, avoid)) return c;
  return '#ffffff';
}

/** Field colours (#rrggbb) for the user's team and the opponent. */
export function kitColors(ours: Pick<TeamDef, 'colors'>, theirs: Pick<TeamDef, 'colors'>): { ours: string; theirs: string } {
  const us = pick(ours, [TURF]);
  return { ours: us, theirs: pick(theirs, [TURF, us]) };
}
