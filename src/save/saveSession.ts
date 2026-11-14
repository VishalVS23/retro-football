/**
 * The save currently in use while the game is open, plus the seeded RNG tied to it.
 * Game code calls getRng() for randomness and commitSave() to store progress.
 */
import { createRng, type Rng } from '../sim/rng';
import { type SaveData } from './saveFormat';
import { openOrCreateSave, writeSave } from './saveStore';

let current: SaveData | null = null;
let rng: Rng | null = null;
let persisted = false;

export async function startSaveSession(): Promise<SaveData> {
  const opened = await openOrCreateSave();
  current = opened.save;
  persisted = opened.persisted;
  rng = createRng(current.seed);
  rng.setState(current.rngState);
  return current;
}

export function getSave(): SaveData {
  if (!current) throw new Error('Save session not started');
  return current;
}

export function getRng(): Rng {
  if (!rng) throw new Error('Save session not started');
  return rng;
}

export function isPersisted() {
  return persisted;
}

/** Replace the whole save (e.g. after importing a file) and store it. */
export async function replaceSave(save: SaveData): Promise<void> {
  current = save;
  rng = createRng(save.seed);
  rng.setState(save.rngState);
  await commitSave();
}

/** Store the current save, including where the RNG has got to. */
export async function commitSave(): Promise<void> {
  if (!current || !rng) return;
  current.rngState = rng.getState();
  if (persisted) await writeSave(current);
}
