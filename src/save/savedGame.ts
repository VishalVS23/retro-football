/**
 * A game in progress, as stored in the save (Stage 2 step 8). Pure logic, no browser storage.
 *
 * Only saved BETWEEN plays (when the play calling screen opens), so it never holds a live play:
 * the score / down / ball spot, the clock (incl. overtime), the box score and the last play called.
 * A damaged game section is thrown away (null), never an error: a bad game must not cost the
 * whole save or stop the game from starting.
 */
import type { ClockState } from '../sim/clock';
import type { GameState } from '../sim/drive';
import type { GameStats, QbLine, SideStats } from '../sim/gameStats';
import { sanitizeScouting, type Scouting } from '../sim/scouting';
import { FORMATION_IDS, type FormationId } from '../sim/formation';
import { sanitizeLines, type Lines } from '../league/playerStats';
import { sanitizeScoring, type ScoringPlay } from '../story/scoring';

export interface SavedGame {
  match: GameState;
  clock: ClockState;
  stats: GameStats;
  /** The play last called (index into PLAYS). */
  playIndex: number;
  /** The team we're playing (league team id). Missing in games saved before Stage 3b. */
  opponentId?: number;
  /** Their coach's scouting memory of this game (A-a). Missing in older saves = he starts fresh. */
  scouting?: Scouting;
  /** F-a: the formation lined up. Missing in older saves = NORMAL. */
  formation?: FormationId;
  /** 4a: the season game this is (its id in the season's schedule). Missing = an exhibition game. */
  seasonGameId?: number;
  /** 4b-2: each player's line so far (ours, theirs). Missing in older saves = start from nothing. */
  lines?: { us: Lines; them: Lines };
  /** 5b: the scoring plays so far (side 0 = us). Missing in older saves = none. */
  scoring?: ScoringPlay[];
}

/** Nothing has happened yet (no snaps, no points, full first quarter): not worth a CONTINUE. */
export function isFreshGame(g: SavedGame, quarterLength: number): boolean {
  return (
    g.match.us === 0 &&
    g.match.them === 0 &&
    g.clock.quarter === 1 &&
    !g.clock.ot &&
    g.clock.timeLeft >= quarterLength &&
    g.stats.us.plays === 0 &&
    g.stats.them.plays === 0
  );
}

/** A deep copy, so later changes in the game don't change what was saved. */
export function snapshotGame(g: SavedGame): SavedGame {
  return JSON.parse(JSON.stringify(g)) as SavedGame;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number, max = Infinity): v is number => isNum(v) && Number.isInteger(v) && v >= min && v <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNumList = (v: unknown) => Array.isArray(v) && v.length >= 4 && v.every(isNum);

/** Field length in our coordinates (both end zones included). */
const FIELD_END = 120;

function okMatch(m: unknown): m is GameState {
  if (!isObj(m)) return false;
  return (
    isNum(m.ballX) &&
    m.ballX > 0 &&
    m.ballX < FIELD_END &&
    isInt(m.down, 1, 4) &&
    isNum(m.firstDownX) &&
    isInt(m.us, 0) &&
    isInt(m.them, 0) &&
    (m.oppStartX === null || isNum(m.oppStartX)) &&
    isBool(m.tryPending)
  );
}

function okClock(c: unknown): c is ClockState {
  if (!isObj(c)) return false;
  return (
    isInt(c.quarter, 1, 4) &&
    isNum(c.timeLeft) &&
    c.timeLeft >= 0 &&
    isBool(c.running) &&
    isInt(c.timeouts, 0) &&
    isBool(c.warned) &&
    (c.ot === undefined || isInt(c.ot, 0)) &&
    (c.oppTimeouts === undefined || isInt(c.oppTimeouts, 0))
  );
}

const SIDE_KEYS: (keyof SideStats)[] = ['plays', 'passYards', 'rushYards', 'firstDowns', 'turnovers', 'sacked'];
const QB_KEYS: (keyof QbLine)[] = ['completions', 'attempts', 'yards', 'touchdowns', 'interceptions'];

function okStats(s: unknown): s is GameStats {
  if (!isObj(s) || !isObj(s.us) || !isObj(s.them) || !isObj(s.qb) || !isObj(s.byQuarter)) return false;
  const us = s.us;
  const them = s.them;
  const qb = s.qb;
  return (
    SIDE_KEYS.every((k) => isNum(us[k]) && isNum(them[k])) &&
    QB_KEYS.every((k) => isNum(qb[k])) &&
    isNum(s.longest) &&
    isNumList(s.byQuarter.us) &&
    isNumList(s.byQuarter.them)
  );
}

/**
 * Checks a saved game read from storage or a file. Returns it if it's sound, else null
 * (start a new game instead). `playCount` = how many plays the playbook has now.
 */
export function sanitizeSavedGame(raw: unknown, playCount = Infinity): SavedGame | null {
  if (!isObj(raw)) return null;
  if (!okMatch(raw.match) || !okClock(raw.clock) || !okStats(raw.stats)) return null;
  // Saved between plays with us on offence; a CPU drive still to come isn't a resumable spot.
  if (raw.match.oppStartX !== null) return null;
  const playIndex = isInt(raw.playIndex, 0, Math.max(0, playCount - 1)) ? raw.playIndex : 0;
  const game: SavedGame = { match: raw.match, clock: raw.clock, stats: raw.stats, playIndex };
  if (isInt(raw.opponentId, 0)) game.opponentId = raw.opponentId;
  if (isInt(raw.seasonGameId, 0)) game.seasonGameId = raw.seasonGameId;
  if (raw.scouting !== undefined) game.scouting = sanitizeScouting(raw.scouting);
  if (isObj(raw.lines)) {
    const us = sanitizeLines(raw.lines.us);
    const them = sanitizeLines(raw.lines.them);
    if (us && them) game.lines = { us, them };
  }
  const scoring = sanitizeScoring(raw.scoring);
  if (scoring) game.scoring = scoring;
  if (typeof raw.formation === 'string' && (FORMATION_IDS as readonly string[]).includes(raw.formation)) game.formation = raw.formation as FormationId;
  return snapshotGame(game);
}
