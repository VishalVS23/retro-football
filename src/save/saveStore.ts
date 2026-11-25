/**
 * Browser storage for saves (IndexedDB via `idb`).
 * Keeps the current save plus a rolling backup of the last MAX_BACKUPS versions.
 * Every write puts the old save into the backups first.
 *
 * The league (about 1,150 players) is kept under its own key and only rewritten when it changed,
 * so the autosave after every play stays small. Backups hold whole saves, league included.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { createNewSave, migrate, rotateBackups, type SaveData } from './saveFormat';

const DB_NAME = 'retro-football';
const DB_VERSION = 1;
const STORE = 'saves';
const CURRENT = 'current';
const BACKUPS = 'backups';
const LEAGUE = 'league';
const STATS = 'stats';
const NEWS = 'news';

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
  const d = await db();
  const raw = await d.get(STORE, CURRENT);
  if (!raw) return null;
  const league = await d.get(STORE, LEAGUE);
  const stats = await d.get(STORE, STATS);
  const news = await d.get(STORE, NEWS);
  return migrate({ ...raw, ...(league !== undefined && { league }), ...(stats !== undefined && { stats }), ...(news !== undefined && { news }) });
}

export interface WriteOptions {
  /** Move the previous save into the rolling backups first (default true). Mid-game autosaves don't. */
  backup?: boolean;
  /** Also write the league (default true). Autosaves skip it unless it changed. */
  league?: boolean;
  /** Also write the stats (default true). Autosaves skip them unless they changed. */
  stats?: boolean;
  /** Also write the news (default true). Autosaves skip it unless it changed. */
  news?: boolean;
}

/** Writes a save, moving the previous one into the rolling backups. */
export async function writeSave(save: SaveData, opts: WriteOptions = {}): Promise<void> {
  const { backup = true, league = true, stats = true, news = true } = opts;
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  if (backup) {
    const prev = (await tx.store.get(CURRENT)) as SaveData | undefined;
    if (prev) {
      const prevLeague = await tx.store.get(LEAGUE);
      const prevStats = await tx.store.get(STATS);
      const prevNews = await tx.store.get(NEWS);
      const previous = { ...prev, ...(prevLeague !== undefined && { league: prevLeague }), ...(prevStats !== undefined && { stats: prevStats }), ...(prevNews !== undefined && { news: prevNews }) };
      const backups = ((await tx.store.get(BACKUPS)) as SaveData[] | undefined) ?? [];
      await tx.store.put(rotateBackups(backups, previous), BACKUPS);
    }
  }
  // The save without its league; the league goes under its own key.
  await tx.store.put({ ...save, league: null, stats: null, news: null, updatedAt: new Date().toISOString() }, CURRENT);
  if (league) await tx.store.put(save.league, LEAGUE);
  if (stats) await tx.store.put(save.stats, STATS);
  if (news) await tx.store.put(save.news, NEWS);
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
