/**
 * Helpers for the feel tuning panel. Pure functions (no browser or Phaser),
 * so they can be unit-tested.
 */

/** A feel object: groups of named numbers, e.g. { camera: { leadYards: 4 } }. */
export type FeelShape = Record<string, Record<string, number>>;

/** Every setting as "group.name" with its value. */
export interface FeelEntry {
  group: string;
  key: string;
  value: number;
}

export function listEntries(f: FeelShape): FeelEntry[] {
  return Object.entries(f).flatMap(([group, values]) =>
    Object.entries(values).map(([key, value]) => ({ group, key, value })),
  );
}

/** Slider range for a setting, guessed from its name and default value. */
export function sliderRange(key: string, defaultValue: number): { min: number; max: number; step: number } {
  if (/Mode$/.test(key)) return { min: 0, max: 1, step: 1 };
  if (/(Lerp|Ratio|Chance)$/.test(key)) return { min: 0, max: 1, step: 0.01 };
  if (/Response$/.test(key)) return { min: 0, max: Math.max(30, defaultValue * 3), step: 0.5 }; // 0 = instant
  if (/Intensity$/.test(key)) return { min: 0, max: Math.max(0.05, defaultValue * 4), step: 0.001 };
  const max = Math.max(1, defaultValue * 3);
  const step = max <= 2 ? 0.01 : max <= 20 ? 0.05 : 0.5;
  return { min: 0, max, step };
}

/** Copy only known numeric settings from `overrides` onto `target` (ignores junk). */
export function applyOverrides(target: FeelShape, overrides: unknown): void {
  if (!overrides || typeof overrides !== 'object') return;
  for (const [group, values] of Object.entries(overrides as Record<string, unknown>)) {
    if (!(group in target) || !values || typeof values !== 'object') continue;
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (key in target[group] && typeof value === 'number' && Number.isFinite(value)) {
        target[group][key] = value;
      }
    }
  }
}

/** Only the settings that differ from the defaults. */
export function diffFromDefaults(current: FeelShape, defaults: FeelShape): FeelShape {
  const out: FeelShape = {};
  for (const { group, key, value } of listEntries(current)) {
    if (defaults[group]?.[key] !== value) (out[group] ??= {})[key] = value;
  }
  return out;
}

/** Round away floating-point noise like 0.30000000000000004. */
function tidy(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** The settings as text ready to paste into feel.ts. */
export function formatFeel(f: FeelShape): string {
  const lines = ['export const feel = {'];
  for (const [group, values] of Object.entries(f)) {
    lines.push(`  ${group}: {`);
    for (const [key, value] of Object.entries(values)) lines.push(`    ${key}: ${tidy(value)},`);
    lines.push('  },');
  }
  lines.push('};');
  return lines.join('\n');
}
