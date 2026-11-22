/**
 * The save currently in use while the game is open, plus the seeded RNG tied to it.
 * Game code calls getRng() for randomness and commitSave() to store progress.
 */
import { createRng, type Rng } from '../sim/rng';
import { type SaveData } from './saveFormat';
import { snapshotGame, type SavedGame } from './savedGame';
import { openOrCreateSave, writeSave } from './saveStore';

let current: SaveData | null = null;
let rng: Rng | null = null;
let persisted = false;
let imported = false;
let resolveReady: (save: SaveData) => void = () => {};
const ready = new Promise<SaveData>((resolve) => (resolveReady = resolve));

export async function startSaveSession(): Promise<SaveData> {
  const opened = await openOrCreateSave();
  current = opened.save;
  persisted = opened.persisted;
  rng = createRng(current.seed);
  rng.setState(current.rngState);
  resolveReady(current);
  return current;
}

/** Resolves once the save has been opened (the game scene waits for it to offer CONTINUE). */
export function whenSaveReady(): Promise<SaveData> {
  return ready;
}

export function getSave(): SaveData {
  if (!current) throw new Error('Save session not started');
  return current;
}

export function getRng(): Rng {
  if (!rng) throw new Error('Save session not started');
  return rng;
}

/**
 * The save's RNG, or (only in the first instant before the save has loaded) a fixed-seed
 * fallback so gameplay never crashes. Still seeded, so still reproducible.
 */
const fallbackRng = createRng(20261114);
export function getRngOrFallback(): Rng {
  return rng ?? fallbackRng;
}

export function isPersisted() {
  return persisted;
}

/** Replace the whole save (e.g. after importing a file) and store it. */
export async function replaceSave(save: SaveData): Promise<void> {
  imported = true; // the page reloads next; the game on screen must not autosave over this one
  current = save;
  rng = createRng(save.seed);
  rng.setState(save.rngState);
  await commitSave();
}

/** Store the current save, including where the RNG has got to. */
export async function commitSave(backup = true): Promise<void> {
  if (!current || !rng) return;
  current.rngState = rng.getState();
  if (persisted) await writeSave(current, backup);
}

/**
 * Store the game in progress (null = no game to continue), with the RNG, without touching the
 * rolling backups. Never throws: a failed autosave must not interrupt the game.
 */
export async function saveGameInProgress(game: SavedGame | null): Promise<void> {
  if (!current || imported) return;
  current.game = game && snapshotGame(game);
  try {
    await commitSave(false);
  } catch (err) {
    console.warn('Autosave failed:', err);
  }
}
