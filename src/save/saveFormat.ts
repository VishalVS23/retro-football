/**
 * Save file format. Pure logic (no browser storage here) so it can be unit-tested.
 *
 * RULE: whenever SaveData changes shape, bump SAVE_VERSION and add a step to
 * MIGRATIONS that upgrades the previous version. Old saves must always load.
 */
import { randomSeed } from '../sim/rng';
import { sanitizeSavedGame, type SavedGame } from './savedGame';
import { sanitizeLeague, type League } from '../league/league';
import { sanitizeSeason, type Season } from '../league/season';
import { TEAM_DEFS } from '../league/teams';
import { emptyStats, sanitizeStats, type StatsStore } from '../league/boxScore';
import { sanitizeDifficulty, type DifficultyId } from '../sim/difficulty';
import { emptyNews, sanitizeNews, type NewsStore } from '../story/news';

export const SAVE_VERSION = 8;
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
  /** The game in progress (saved between plays), or null = start a new game. Added in version 2. */
  game: SavedGame | null;
  /**
   * The league: teams, rosters, the user's team (version 3). null = not made yet: the game makes
   * it from `seed` and asks the user to pick a team. Stored under its own key (saveStore.ts).
   */
  league: League | null;
  /** The season being played (version 4). null = none yet: the game starts one once a team is picked. */
  season: Season | null;
  /**
   * Player stats (version 5): this season's box scores and past seasons' totals. Stored under its own
   * key (saveStore.ts), written once a week rather than with every autosave.
   */
  stats: StatsStore;
  /** Difficulty of the games you play (version 6): 'normal' / 'hard'. Can change any time. */
  difficulty: DifficultyId;
  /** The inbox (version 7): news items. Stored under its own key (saveStore.ts), written once a week. */
  news: NewsStore;
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
    game: null,
    league: null,
    season: null,
    stats: emptyStats(),
    difficulty: 'normal',
    news: emptyNews(),
  };
}

/**
 * Upgrade steps. MIGRATIONS[n] turns a version-n save into a version-(n+1) save.
 * Example for later: 1: (s) => ({ ...s, version: 2, teams: [] }),
 */
type AnySave = Record<string, unknown> & { version: number };
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  // 1 -> 2: games can be saved mid-way. Older saves have no game in progress.
  1: (s) => ({ ...s, version: 2, game: null }),
  // 2 -> 3: the league (teams and players). Older saves pick a team on their next launch.
  2: (s) => ({ ...s, version: 3, league: null }),
  // 3 -> 4: seasons. Older saves start week 1 of a new season with the team they already coach.
  3: (s) => ({ ...s, version: 4, season: null }),
  // 4 -> 5: player stats. Older saves start with none (the season's games so far have no box scores).
  4: (s) => ({ ...s, version: 5, stats: emptyStats() }),
  // 5 -> 6: difficulty modes. Older saves play on Normal (the game as it was).
  5: (s) => ({ ...s, version: 6, difficulty: 'normal' }),
  // 6 -> 7: the inbox. Older saves start with an empty one.
  6: (s) => ({ ...s, version: 7, news: emptyNews() }),
  // 7 -> 8: contracts and the salary cap (on each player in the league). Older leagues get their
  // contracts the next time the game loads (`ensureContracts`), so nothing to change here.
  7: (s) => ({ ...s, version: 8 }),
};

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
  // A damaged game in progress is dropped (new game), never the whole save.
  // A damaged league is made again from the seed (the user picks a team again).
  // A damaged season is dropped too (a new one starts).
  s = { ...s, game: sanitizeSavedGame(s.game), league: sanitizeLeague(s.league), season: sanitizeSeason(s.season, TEAM_DEFS.length), stats: sanitizeStats(s.stats), difficulty: sanitizeDifficulty(s.difficulty), news: sanitizeNews(s.news) };
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
