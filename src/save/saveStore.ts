/**
 * Browser storage for saves (IndexedDB via `idb`).
 * Keeps the current save plus a rolling backup of the last MAX_BACKUPS versions.
 * Every write puts the old save into the backups first.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { createNewSave, migrate, rotateBackups, type SaveData } from './saveFormat';

const DB_NAME = 'retro-football';
const DB_VERSION = 1;
const STORE = 'saves';
const CURRENT = 'current';
const BACKUPS = 'backups';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

/** Loads the current save (upgrading it if old), or null if there isn't one. */
export async function loadSave(): Promise<SaveData | null> {
  const raw = await (await db()).get(STORE, CURRENT);
  return raw ? migrate(raw) : null;
}

/** Writes a save, moving the previous one into the rolling backups. */
export async function writeSave(save: SaveData): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  const previous = (await tx.store.get(CURRENT)) as SaveData | undefined;
  if (previous) {
    const backups = ((await tx.store.get(BACKUPS)) as SaveData[] | undefined) ?? [];
    await tx.store.put(rotateBackups(backups, previous), BACKUPS);
  }
  await tx.store.put({ ...save, updatedAt: new Date().toISOString() }, CURRENT);
  await tx.done;
}

export async function loadBackups(): Promise<SaveData[]> {
  return ((await (await db()).get(STORE, BACKUPS)) as SaveData[] | undefined) ?? [];
}

/**
 * Called once at startup: loads the save (or makes a new one), counts this session,
 * and writes it back. Falls back to an in-memory save if storage is blocked
 * (e.g. some private-browsing modes) so the game still runs.
 */
export async function openOrCreateSave(): Promise<{ save: SaveData; persisted: boolean }> {
  try {
    const save = (await loadSave()) ?? createNewSave();
    save.sessions += 1;
    await writeSave(save);
    return { save, persisted: true };
  } catch (err) {
    console.warn('Save storage unavailable, using a temporary save:', err);
    return { save: createNewSave(), persisted: false };
  }
}
