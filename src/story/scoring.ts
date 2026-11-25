/**
 * Stage 5b: a game's scoring plays, in order (who scored, how, the period, the score after), kept
 * with the box score so recaps can tell the story of the game. Pure logic.
 *
 * `side` 0 / 1 = the two teams in whatever order the log is kept (a box score: home, away; the
 * game you're playing: us, them). A try is folded into its touchdown.
 */
import type { SimGameResult } from '../sim/simGame';

export type ScoreKind = 'passTd' | 'runTd' | 'td' | 'fg' | 'pickSix' | 'fumbleTd' | 'returnTd' | 'safety' | 'twoPt';

/** What's known about how the points came (scorer / passer = player ids). */
export interface ScoreInfo {
  kind: ScoreKind;
  yards?: number;
  by?: number;
  qb?: number;
}

export interface ScoringPlay extends ScoreInfo {
  side: 0 | 1;
  /** 1-4 = quarters, 5+ = overtime periods. */
  period: number;
  /** Points, the try included. */
  points: number;
  /** The try after a touchdown: 'xp' (1) or 'two' (2); missing = none / missed. */
  try?: 'xp' | 'two';
  /** Score after the play (and its try): [side 0, side 1]. */
  score: [number, number];
}

const TDS: ScoreKind[] = ['passTd', 'runTd', 'td', 'pickSix', 'fumbleTd', 'returnTd'];
export const isTouchdown = (k: ScoreKind) => TDS.includes(k);

/**
 * Adds points to the log. One or two points right after the same side's touchdown in the same period
 * (with no try yet) are its try; other 2-pointers without `info` are a 2-point play (an overtime
 * shootout try); 3 = a field goal, 6+ = a touchdown when nothing more is known.
 */
export function addScore(log: readonly ScoringPlay[], side: 0 | 1, period: number, points: number, score: [number, number], info?: ScoreInfo): ScoringPlay[] {
  if (points <= 0) return [...log];
  const last = log[log.length - 1];
  if (!info && points <= 2 && last && last.side === side && last.period === period && isTouchdown(last.kind) && !last.try)
    return [...log.slice(0, -1), { ...last, points: last.points + points, try: points === 1 ? 'xp' : 'two', score }];
  const kind: ScoreKind = info?.kind ?? (points === 3 ? 'fg' : points <= 2 ? 'twoPt' : 'td');
  const entry: ScoringPlay = { ...info, kind, side, period, points, score };
  // A touchdown logged with its try already in (simmed drives): 7 = extra point, 8 = two.
  if (isTouchdown(kind) && points >= 7) entry.try = points === 7 ? 'xp' : 'two';
  return [...log, entry];
}

/**
 * The scoring plays of a sim log (whole games, or the simmed part of a game you play): `infos[i]` =
 * how entry i's points came (from the player credit), `start` = the score when the sim began.
 */
export function logScoring(log: SimGameResult['log'], infos: readonly (ScoreInfo | undefined)[], start: [number, number] = [0, 0], into: readonly ScoringPlay[] = []): ScoringPlay[] {
  let out = [...into];
  const score: [number, number] = [...start];
  log.forEach((e, i) => {
    if (e.points <= 0) return;
    score[e.side] += e.points;
    const info = e.try ? (e.try.kind === 'twoPoint' ? { kind: 'twoPt' as const } : undefined) : (infos[i] ?? undefined);
    out = addScore(out, e.side, e.period, e.points, [score[0], score[1]], info);
  });
  return out;
}

/** The log with its sides swapped (the game you play keeps us first; its box score is home first). */
export function flipScoring(log: readonly ScoringPlay[]): ScoringPlay[] {
  return log.map((x) => ({ ...x, side: (1 - x.side) as 0 | 1, score: [x.score[1], x.score[0]] }));
}

const KINDS: ScoreKind[] = ['passTd', 'runTd', 'td', 'fg', 'pickSix', 'fumbleTd', 'returnTd', 'safety', 'twoPt'];
const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

/** Bad entries are dropped; missing = undefined (games before 5b). */
export function sanitizeScoring(v: unknown): ScoringPlay[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(
    (x): x is ScoringPlay =>
      !!x &&
      typeof x === 'object' &&
      (x.side === 0 || x.side === 1) &&
      int(x.period) &&
      int(x.points) &&
      KINDS.includes(x.kind) &&
      Array.isArray(x.score) &&
      x.score.length === 2 &&
      x.score.every(int),
  );
}
