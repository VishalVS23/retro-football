/**
 * Stage 5c: big games, season milestones and league records, for the inbox. Pure logic.
 *
 * Bars measured over simmed seasons (2026-11-24): about 1-2 big games a week league-wide, a handful of
 * season milestones a season. Records are kept across seasons (`RecordBook`).
 *
 * Lore (user, 2026-11-24): an old league folded after its last season and came back as this one, with
 * new teams, names and logos; its record book carried over. Those marks (`LEGACY`, fictional legends)
 * sit above anything the sims reach but within reach of a great player's game, so breaking one is news.
 */
import type { BoxScore } from '../league/boxScore';
import { gamesInWeek, type Season } from '../league/season';
import { playerTotals } from '../league/leaders';
import type { PlayerLine } from '../league/playerStats';

export const REC_KEYS = ['py', 'ptd', 'ry', 'rtd', 'rcy', 'rec', 'rctd', 'sck', 'dint', 'tk'] as const;
export type RecKey = (typeof REC_KEYS)[number];

export interface RecordEntry {
  v: number;
  /** Player id and his team at the time (-1 for an old-league record). */
  id: number;
  team: number;
  /** Season (0 = the old league). */
  year: number;
  week: number;
  /** Old-league record: the holder's name and the calendar year he set it. */
  name?: string;
  era?: number;
}

export interface RecordBook {
  game: Partial<Record<RecKey, RecordEntry>>;
  season: Partial<Record<RecKey, RecordEntry>>;
}

const old = (v: number, name: string, era: number): RecordEntry => ({ v, id: -1, team: -1, year: 0, week: 0, name, era });

/** The old league's record book (fictional players). Sims top out around: game 358 / 6 / 214 / 4 / 207 / 14 / 4 / 4 / 3 / 21, season 4,151 / 34 / 1,998 / 16 / 1,825 / 146 / 14 / 17 / 9 / 214. */
export const LEGACY: RecordBook = {
  game: {
    py: old(462, 'Cal Whitcomb', 1952),
    ptd: old(7, 'Cal Whitcomb', 1952),
    ry: old(268, 'Jesse Laramie', 2004),
    rtd: old(5, 'Bo Hennessey', 1940),
    rcy: old(271, 'Tremaine Wakefield', 1989),
    rec: old(17, 'Andre Lisowski', 2013),
    rctd: old(5, 'Tremaine Wakefield', 1989),
    sck: old(6, 'Ike Pruitt', 1985),
    dint: old(4, 'Sammy Dupree', 1958),
    tk: old(25, 'Otis Brannigan', 1977),
  },
  season: {
    py: old(4612, 'Hollis Varga', 1998),
    ptd: old(41, 'Hollis Varga', 1998),
    ry: old(2154, 'Rufus Ainsley', 1979),
    rtd: old(21, 'Rufus Ainsley', 1979),
    rcy: old(1963, 'Marlon Teague', 2009),
    rec: old(156, 'Desmond Okafor', 2016),
    rctd: old(17, 'Marlon Teague', 2009),
    sck: old(21, 'Ike Pruitt', 1986),
    dint: old(11, 'Lonnie Castellano', 1961),
    tk: old(231, 'Otis Brannigan', 1975),
  },
};

/** A fresh book = the old league's records. */
export const emptyRecords = (): RecordBook => ({ game: { ...LEGACY.game }, season: { ...LEGACY.season } });

/** Who held a record, for "old record N by ...". */
const holder = (e: RecordEntry) => (e.name ? `${e.name} (old league, ${e.era})` : `${p(e.id)}, season ${e.year}`);

type BigKey = RecKey | 'fgm';
/** A single game this good is news. */
export const BIG_GAME: Record<BigKey, number> = { py: 325, ptd: 5, ry: 175, rtd: 4, rcy: 175, rec: 13, rctd: 4, sck: 4, dint: 3, tk: 18, fgm: 5 };
/** Season totals worth a headline when a player first gets there... */
export const SEASON_MARKS: [RecKey, number][] = [
  ['py', 4000],
  ['ptd', 30],
  ['ry', 1500],
  ['rtd', 15],
  ['rcy', 1500],
  ['rec', 120],
  ['rctd', 12],
  ['sck', 15],
  ['dint', 7],
];
/** ...and lower bars for the user's own players. */
export const MY_MARKS: [RecKey, number][] = [
  ['py', 3000],
  ['ptd', 20],
  ['ry', 1000],
  ['rcy', 1000],
  ['sck', 10],
];

export const LABEL: Record<RecKey, string> = {
  py: 'passing yards',
  ptd: 'touchdown passes',
  ry: 'rushing yards',
  rtd: 'rushing touchdowns',
  rcy: 'receiving yards',
  rec: 'catches',
  rctd: 'touchdown catches',
  sck: 'sacks',
  dint: 'interceptions',
  tk: 'tackles',
};

/** What a player did, in words ("threw for 352 yards"). */
const DID: Record<BigKey, (n: string) => string> = {
  py: (n) => `threw for ${n} yards`,
  ptd: (n) => `threw ${n} touchdown passes`,
  ry: (n) => `ran for ${n} yards`,
  rtd: (n) => `ran for ${n} touchdowns`,
  rcy: (n) => `had ${n} receiving yards`,
  rec: (n) => `caught ${n} passes`,
  rctd: (n) => `caught ${n} touchdown passes`,
  sck: (n) => `had ${n} sacks`,
  dint: (n) => `intercepted ${n} passes`,
  tk: (n) => `made ${n} tackles`,
  fgm: (n) => `kicked ${n} field goals`,
};

export const num = (n: number) => n.toLocaleString('en-US');
const p = (id: number) => `{p:${id}}`;
const a = (id: number) => `{a:${id}}`;
const and = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface MilestoneResult {
  /** Paragraphs for the week's message (empty = nothing to say). */
  body: string[];
  /** A league record was broken this week. */
  record: boolean;
  /** Something about the user's players. */
  mine: boolean;
  /** Flags to add (season milestones and season records said once). */
  flags: string[];
  records: RecordBook;
}

/**
 * The week's big games, season milestones and records. `boxes` = this season's box scores (this week
 * included), `flags` = what's been said already, `position(id)` = his position.
 */
export function weekMilestones(
  season: Season,
  week: number,
  boxes: Readonly<Record<number, BoxScore>>,
  book: RecordBook,
  flags: readonly string[],
  userTeamId: number,
  position: (id: number) => string | undefined,
): MilestoneResult {
  const year = season.year;
  const records: RecordBook = { game: { ...book.game }, season: { ...book.season } };
  const body: string[] = [];
  const newFlags: string[] = [];
  let record = false;
  let mine = false;
  const pos = (id: number) => position(id) ?? '';

  // Big games and single-game records.
  for (const g of gamesInWeek(season, week)) {
    const box = boxes[g.id];
    if (!box) continue;
    ([0, 1] as const).forEach((side) => {
      const tb = box.teams[side];
      const opp = box.teams[1 - side].teamId;
      for (const [key, line] of Object.entries(tb.lines)) {
        const id = Number(key);
        const l = line as PlayerLine;
        const big = (Object.keys(BIG_GAME) as BigKey[]).filter((k) => (l[k] ?? 0) >= BIG_GAME[k]);
        if (!big.length) continue;
        body.push(`${p(id)} (${pos(id)}, ${a(tb.teamId)}) ${and(big.map((k) => DID[k](num(l[k] ?? 0))))} against ${a(opp)}.`);
        if (tb.teamId === userTeamId) mine = true;
        for (const k of big) {
          if (k === 'fgm') continue;
          const old = records.game[k];
          const v = l[k] ?? 0;
          if (old && v <= old.v) continue;
          records.game[k] = { v, id, team: tb.teamId, year, week };
          record = true;
          body.push(
            old
              ? `LEAGUE RECORD: ${num(v)} ${LABEL[k]} is the most ever in a game (old record ${num(old.v)} by ${holder(old)}).`
              : `LEAGUE RECORD: ${num(v)} ${LABEL[k]} is the most ever in a game.`,
          );
        }
      }
    });
  }

  // Season totals: milestones, and season records.
  const totals = playerTotals(boxes);
  const teamOf = new Map<number, number>();
  for (const b of Object.values(boxes)) for (const tb of b.teams) for (const k of Object.keys(tb.lines)) teamOf.set(Number(k), tb.teamId);
  const said = new Set(flags);
  const ids = Object.keys(totals).map(Number).sort((x, y) => x - y);
  for (const id of ids) {
    const l = totals[id];
    const team = teamOf.get(id) ?? -1;
    const marks = team === userTeamId ? [...SEASON_MARKS, ...MY_MARKS] : SEASON_MARKS;
    for (const [k, bar] of marks) {
      const v = l[k] ?? 0;
      const key = `ms:${year}:${id}:${k}:${bar}`;
      if (v < bar || said.has(key)) continue;
      // Only the highest bar crossed this week (a 1,500-yard season doesn't also announce 1,000).
      if (marks.some(([k2, b2]) => k2 === k && b2 > bar && v >= b2 && !said.has(`ms:${year}:${id}:${k}:${b2}`))) {
        newFlags.push(key);
        said.add(key);
        continue;
      }
      newFlags.push(key);
      said.add(key);
      body.push(`MILESTONE: ${p(id)} (${pos(id)}, ${a(team)}) has reached ${num(bar)} ${LABEL[k]} this season${v > bar ? ` (${num(v)} so far)` : ''}.`);
      if (team === userTeamId) mine = true;
    }
    for (const k of REC_KEYS) {
      const v = l[k] ?? 0;
      const old = records.season[k];
      if (!v || (old && v <= old.v)) continue;
      records.season[k] = { v, id, team, year, week };
      // Announced once a season, and only when it beats an earlier season's record (or the old league's).
      const fk = `srec:${year}:${k}`;
      if (old && old.year < year && !said.has(fk)) {
        newFlags.push(fk);
        said.add(fk);
        record = true;
        if (team === userTeamId) mine = true;
        body.push(`LEAGUE RECORD: ${p(id)} (${a(team)}) has ${num(v)} ${LABEL[k]} this season, the most ever (old record ${num(old.v)} by ${holder(old)}).`);
      }
    }
  }
  return { body, record, mine, flags: newFlags, records };
}

/** A damaged or missing book = an empty one; bad entries are dropped. */
export function sanitizeRecords(v: unknown): RecordBook {
  // Starts from the old league's book; a saved mark only counts if it beats it.
  const out = emptyRecords();
  if (!v || typeof v !== 'object') return out;
  const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
  for (const part of ['game', 'season'] as const) {
    const src = (v as Record<string, unknown>)[part];
    if (!src || typeof src !== 'object') continue;
    for (const k of REC_KEYS) {
      const e = (src as Record<string, unknown>)[k] as RecordEntry | undefined;
      if (e && int(e.v) && int(e.id) && int(e.team) && int(e.year) && int(e.week) && e.year >= 1 && e.v > (out[part][k]?.v ?? 0)) out[part][k] = { v: e.v, id: e.id, team: e.team, year: e.year, week: e.week };
    }
  }
  return out;
}
