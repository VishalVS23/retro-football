/**
 * Save file format. Pure logic (no browser storage here) so it can be unit-tested.
 *
 * RULE: whenever SaveData changes shape, bump SAVE_VERSION and add a step to
 * MIGRATIONS that upgrades the previous version. Old saves must always load.
 */
import { randomSeed } from '../sim/rng';

export const SAVE_VERSION = 1;
export const MAX_BACKUPS = 3;

export interface SaveData {
  version: number;
  /** Fixed for the life of this save; the league is generated from it. */
  seed: number;
  /** Where the seeded RNG is right now, so randomness resumes exactly. */
  rngState: number;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  /** How many times this save has been opened. Placeholder content until stage 2+. */
  sessions: number;
}

export function createNewSave(seed = randomSeed(), now = new Date()): SaveData {
  const iso = now.toISOString();
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    createdAt: iso,
    updatedAt: iso,
    sessions: 0,
  };
}

/**
 * Upgrade steps. MIGRATIONS[n] turns a version-n save into a version-(n+1) save.
 * Example for later: 1: (s) => ({ ...s, version: 2, teams: [] }),
 */
type AnySave = Record<string, unknown> & { version: number };
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {};

export class SaveError extends Error {}

/** Takes anything (e.g. parsed JSON from a file) and returns a valid, current SaveData or throws. */
export function migrate(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SaveError("That file isn't a retro-football save.");
  }
  let s = raw as AnySave;
  if (typeof s.version !== 'number' || !Number.isInteger(s.version) || s.version < 1) {
    throw new SaveError("That file isn't a retro-football save (no version).");
  }
  if (s.version > SAVE_VERSION) {
    throw new SaveError('That save is from a newer version of the game. Refresh to update first.');
  }
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) throw new SaveError(`No upgrade path from save version ${s.version}.`);
    s = step(s);
  }
  validate(s);
  return s as unknown as SaveData;
}

function validate(s: AnySave) {
  const isUint = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  const isDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  if (!isUint(s.seed) || !isUint(s.rngState) || !isUint(s.sessions)) {
    throw new SaveError('That save file is damaged (bad numbers).');
  }
  if (!isDate(s.createdAt) || !isDate(s.updatedAt)) {
    throw new SaveError('That save file is damaged (bad dates).');
  }
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save, null, 2);
}

export function parseSave(text: string): SaveData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("That file isn't valid JSON.");
  }
  return migrate(raw);
}

/** Newest first: puts `previous` at the front and keeps at most MAX_BACKUPS. */
export function rotateBackups(backups: SaveData[], previous: SaveData): SaveData[] {
  return [previous, ...backups].slice(0, MAX_BACKUPS);
}

/** e.g. "retro-football-save-2026-11-14.json" */
export function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `retro-football-save-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
