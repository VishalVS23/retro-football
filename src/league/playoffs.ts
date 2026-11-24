/**
 * Playoffs (Stage 4e): 6 teams per conference (4 division winners seeded 1-4 by record, then 2 wild
 * cards), the top 2 seeds rest in the first round. Wild Card (week 19): 3 v 6, 4 v 5; Divisional
 * (20): 1 v the lowest seed left, 2 v the other; Conference Championships (21); the Championship
 * (22, neutral field: Keystone champion v Frontier champion). The higher seed is at home. Each round's
 * games are added to the season once the round before it is over. Pure logic.
 */
import { SEASON_WEEKS, divisionStandings, rankTeams, standingRows, type Season, type SeasonGame, type SeasonTeam } from './season';

export const PLAYOFF_SEEDS = 6;
export const WILD_CARD_WEEK = SEASON_WEEKS + 1;
export const FINAL_WEEK = SEASON_WEEKS + 4;
export const ROUND_NAMES = ['WILD CARD', 'DIVISIONAL', 'CONF CHAMPIONSHIP', 'CHAMPIONSHIP'] as const;

/** The round a week is (1 = Wild Card ... 4 = Championship), or 0 in the regular season. */
export const roundOfWeek = (week: number) => (week >= WILD_CARD_WEEK && week <= FINAL_WEEK ? week - SEASON_WEEKS : 0);
export const inPlayoffs = (s: Season) => roundOfWeek(s.week) > 0;
/** The championship has been played: the season is finished. */
export const seasonDone = (s: Season) => s.week > FINAL_WEEK;

export interface ConferenceSeeds {
  /** Team ids in seed order (index 0 = the 1 seed). */
  seeds: number[];
  /** The next teams in line (best first): "in the hunt". */
  hunt: number[];
}

/** Each conference's seeds from the standings (during the season: "if the season ended today"). */
export function playoffSeeds(s: Season, teams: readonly SeasonTeam[]): ConferenceSeeds[] {
  const rows = standingRows(s, teams);
  return [0, 1].map((c) => {
    const winners = [0, 1, 2, 3].map((d) => divisionStandings(s, teams, c, d, rows)[0].teamId);
    const top = rankTeams(s, rows, winners);
    const rest = rankTeams(
      s,
      rows,
      teams.map((t, id) => ({ t, id })).filter((x) => x.t.conference === c && !winners.includes(x.id)).map((x) => x.id),
    );
    return { seeds: [...top, ...rest.slice(0, PLAYOFF_SEEDS - 4)], hunt: rest.slice(PLAYOFF_SEEDS - 4, PLAYOFF_SEEDS - 4 + 3) };
  });
}

/** The winner of a played game (a playoff game always has one; a tie would go to the home team). */
export function winnerOf(g: SeasonGame): number | null {
  if (!g.score) return null;
  return g.score[1] > g.score[0] ? g.away : g.home;
}

const seedOf = (s: Season, team: number) => {
  for (const conf of s.seeds ?? []) {
    const i = conf.indexOf(team);
    if (i >= 0) return i;
  }
  return 99;
};

function addGames(s: Season, week: number, round: number, pairs: [number, number][], neutral = false): Season {
  const games = [...s.games];
  for (const [a, b] of pairs) {
    // The higher seed (lower index) is at home.
    const [home, away] = seedOf(s, a) <= seedOf(s, b) ? [a, b] : [b, a];
    games.push({ id: games.length, week, home, away, round, ...(neutral && { neutral: true }) });
  }
  return { ...s, games };
}

/** Starts the playoffs once the regular season is over: the seeds and the Wild Card games. */
export function startPlayoffs(s: Season, teams: readonly SeasonTeam[]): Season {
  if (s.week !== WILD_CARD_WEEK || s.games.some((g) => g.round)) return s;
  const confs = playoffSeeds(s, teams);
  const seeded: Season = { ...s, seeds: confs.map((c) => c.seeds) };
  const pairs = confs.flatMap((c): [number, number][] => [
    [c.seeds[2], c.seeds[5]],
    [c.seeds[3], c.seeds[4]],
  ]);
  return addGames(seeded, WILD_CARD_WEEK, 1, pairs);
}

/** Who's still alive in a conference after `round` games (seed order). */
function alive(s: Season, conf: number, round: number): number[] {
  const seeds = s.seeds?.[conf] ?? [];
  const out = new Set(seeds);
  for (const g of s.games) if (g.round && g.round <= round && g.score) out.delete(g.home === winnerOf(g) ? g.away : g.home);
  return seeds.filter((t) => out.has(t));
}

/**
 * The season after a week is finished: on to the next week, and in the playoffs the next round's
 * games (the regular season's end starts them). Use this instead of `advanceWeek`.
 */
export function afterWeek(s: Season, teams: readonly SeasonTeam[]): Season {
  const next = { ...s, week: s.week + 1 };
  return withPlayoffGames(next, teams);
}

/** Makes sure the current playoff week has its games (also for a save from before 4e at week 19). */
export function withPlayoffGames(s: Season, teams: readonly SeasonTeam[]): Season {
  const round = roundOfWeek(s.week);
  if (!round || s.games.some((g) => g.round === round)) return s;
  if (round === 1) return startPlayoffs(s, teams);
  // Every game of the round before must be played.
  if (s.games.some((g) => g.round === round - 1 && !g.score)) return s;
  if (round === 2) {
    const pairs = [0, 1].flatMap((c): [number, number][] => {
      const left = alive(s, c, 1); // the 1 and 2 seeds plus the two Wild Card winners, seed order
      return [
        [left[0], left[3]],
        [left[1], left[2]],
      ];
    });
    return addGames(s, s.week, 2, pairs);
  }
  if (round === 3) return addGames(s, s.week, 3, [0, 1].map((c) => alive(s, c, 2).slice(0, 2) as [number, number]));
  const champs = [0, 1].map((c) => alive(s, c, 3)[0]);
  return addGames(s, s.week, 4, [[champs[0], champs[1]]], true);
}

/** The champion and runner-up once the Championship is played. */
export function championOf(s: Season): { champion: number; runnerUp: number; game: SeasonGame } | null {
  const g = s.games.find((x) => x.round === 4 && x.score);
  if (!g) return null;
  const champion = winnerOf(g)!;
  return { champion, runnerUp: champion === g.home ? g.away : g.home, game: g };
}

/** How far a team got: 'champion', 'runnerUp', the round it lost in (1-3), or 'missed'. */
export type PlayoffResult = 'champion' | 'runnerUp' | 1 | 2 | 3 | 'missed' | 'alive';
export function playoffResult(s: Season, team: number): PlayoffResult {
  if (!s.seeds?.some((c) => c.includes(team))) return 'missed';
  for (const g of s.games) {
    if (!g.round || !g.score || (g.home !== team && g.away !== team)) continue;
    if (winnerOf(g) !== team) return g.round === 4 ? 'runnerUp' : (g.round as 1 | 2 | 3);
    if (g.round === 4) return 'champion';
  }
  return 'alive';
}

/** Words for how a team's season ended. */
export function resultWords(r: PlayoffResult): string {
  if (r === 'champion') return 'WON THE CHAMPIONSHIP';
  if (r === 'runnerUp') return 'LOST IN THE CHAMPIONSHIP';
  if (r === 'missed') return 'MISSED THE PLAYOFFS';
  if (r === 'alive') return 'STILL ALIVE';
  return `LOST IN THE ${ROUND_NAMES[r - 1]} ROUND`.replace('CONF CHAMPIONSHIP ROUND', 'CONF CHAMPIONSHIP');
}

/** Is a team still playing (in the playoffs and not knocked out)? */
export const stillAlive = (s: Season, team: number) => inPlayoffs(s) && playoffResult(s, team) === 'alive';

/** A short record of a finished season, kept for the history list. */
export interface SeasonSummary {
  year: number;
  champion: number;
  runnerUp: number;
  /** Final score [champion, runner-up] and overtimes. */
  score: [number, number];
  ot: number;
  userTeam: number;
  userRecord: string;
  userResult: PlayoffResult;
}

export function summarize(s: Season, userTeam: number, userRecord: string): SeasonSummary | null {
  const c = championOf(s);
  if (!c) return null;
  const sc = c.game.score!;
  const score: [number, number] = c.champion === c.game.home ? [sc[0], sc[1]] : [sc[1], sc[0]];
  return { year: s.year, champion: c.champion, runnerUp: c.runnerUp, score, ot: c.game.ot ?? 0, userTeam, userRecord, userResult: playoffResult(s, userTeam) };
}
