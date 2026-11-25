/**
 * Stage 5b: game recaps written from what happened: the scoring plays (who scored, when, the score
 * after), the box score (yards, turnovers) and the game ratings (standout players). The story is
 * picked from the game: overtime, a comeback, a late go-ahead score, a blowout, a shutout, a defensive
 * battle, a shootout. Original templates with several wordings (seeded dice). Pure logic.
 */
import type { Rng } from '../sim/rng';
import type { SeasonGame } from '../league/season';
import type { BoxScore } from '../league/boxScore';
import { roundOfWeek } from '../league/playoffs';

/** Playoff rounds as they read in a sentence ("in the Wild Card round"). */
const ROUND_WORDS = ['Wild Card round', 'Divisional round', 'conference championship', 'Championship'];
import { statSummary } from '../league/leaders';
import { ratingText } from '../league/gameRatings';
import { isTouchdown, type ScoringPlay } from './scoring';
import type { NewsItem, NewsTeam } from './news';

export interface RecapContext {
  game: SeasonGame;
  box: BoxScore;
  teams: readonly NewsTeam[];
  player: (id: number) => { position: string } | undefined;
  userTeamId: number;
}

export type Story = 'overtime' | 'comeback' | 'late' | 'blowout' | 'shutout' | 'defensive' | 'shootout' | 'close' | 'plain' | 'tie';

export interface GameStory {
  story: Story;
  /** Box side (0 = home, 1 = away) that won; null = a tie. */
  winner: 0 | 1 | null;
  /** Biggest deficit the winner came back from. */
  deficit: number;
  leadChanges: number;
  /** The score that put the winner ahead for good (null: led from the first score, or no log). */
  decisive: ScoringPlay | null;
  /** Halftime score [home, away]. */
  half: [number, number];
}

const t = (id: number) => `{t:${id}}`;
const a = (id: number) => `{a:${id}}`;
const p = (id: number) => `{p:${id}}`;

const sum = (xs: number[], n = xs.length) => xs.slice(0, n).reduce((s, x) => s + x, 0);

/** Reads the game: who won, from how far back, when it was decided, and which story it is. */
export function readGame(box: BoxScore, final: [number, number], ot: number): GameStory {
  const half: [number, number] = [sum(box.teams[0].byPeriod, 2), sum(box.teams[1].byPeriod, 2)];
  const winner: 0 | 1 | null = final[0] === final[1] ? null : final[0] > final[1] ? 0 : 1;
  const log = box.scoring ?? [];
  let deficit = 0;
  let leadChanges = 0;
  let leader: 0 | 1 | null = null;
  let decisive: ScoringPlay | null = null;
  for (const x of log) {
    const now: 0 | 1 | null = x.score[0] === x.score[1] ? null : x.score[0] > x.score[1] ? 0 : 1;
    if (winner !== null) {
      deficit = Math.max(deficit, x.score[1 - winner] - x.score[winner]);
      if (now === winner && leader !== winner) decisive = x;
    }
    if (now !== null && leader !== null && now !== leader) leadChanges++;
    if (now !== null) leader = now;
    else if (leader !== null) leader = null; // tied up: the next lead is a fresh one
  }
  // Without a log (games from before 5b) the halftime score is all there is.
  if (!log.length && winner !== null) deficit = Math.max(0, half[1 - winner] - half[winner]);
  const margin = Math.abs(final[0] - final[1]);
  const total = final[0] + final[1];
  const story: Story =
    winner === null
      ? 'tie'
      : ot
        ? 'overtime'
        : deficit >= 10
          ? 'comeback'
          : decisive && decisive.period >= 4 && margin <= 8
            ? 'late'
            : Math.min(final[0], final[1]) === 0
              ? 'shutout'
              : margin >= 24
                ? 'blowout'
                : total <= 20
                  ? 'defensive'
                  : total >= 70
                    ? 'shootout'
                    : margin <= 7
                      ? 'close'
                      : 'plain';
  return { story, winner, deficit, leadChanges, decisive: winner === null ? null : decisive, half };
}

const periodText = (n: number) => (n <= 4 ? `in the ${['1st', '2nd', '3rd', '4th'][n - 1]} quarter` : n === 5 ? 'in overtime' : `in overtime period ${n - 4}`);

/** One scoring play in words (null when nothing useful is known). */
export function describeScore(x: ScoringPlay, teamId: number): string | null {
  const when = periodText(x.period);
  const yd = (n?: number) => (n !== undefined && n > 0 ? `${n}-yard ` : '');
  switch (x.kind) {
    case 'passTd':
      return x.by !== undefined
        ? `${p(x.by)} caught a ${yd(x.yards)}touchdown pass${x.qb !== undefined ? ` from ${p(x.qb)}` : ''} ${when}`
        : `${t(teamId)} threw a ${yd(x.yards)}touchdown pass ${when}`;
    case 'runTd':
      return x.by !== undefined ? `${p(x.by)} ran ${x.yards && x.yards > 1 ? `${x.yards} yards` : 'it in'} for a touchdown ${when}` : `${t(teamId)} ran in a touchdown ${when}`;
    case 'fg':
      return x.by !== undefined ? `${p(x.by)} kicked a ${yd(x.yards)}field goal ${when}` : `${t(teamId)} kicked a field goal ${when}`;
    case 'pickSix':
      return `${t(teamId)} returned an interception for a touchdown ${when}`;
    case 'fumbleTd':
      return `${t(teamId)} scored on a fumble ${when}`;
    case 'returnTd':
      return `${t(teamId)} took a punt back for a touchdown ${when}`;
    case 'safety':
      return `${t(teamId)} got a safety ${when}`;
    case 'twoPt':
      return `${t(teamId)} converted a 2-point try ${when}`;
    case 'td':
      return `${t(teamId)} scored a touchdown ${when}`;
  }
}

/** The best-rated players of the game: two from the winner, one from the loser (or the top 3). */
function standouts(ctx: RecapContext, winner: 0 | 1 | null, n: number): string[] {
  const all: { id: number; side: 0 | 1; r: number }[] = [];
  ([0, 1] as const).forEach((side) => Object.entries(ctx.box.teams[side].ratings ?? {}).forEach(([k, r]) => all.push({ id: Number(k), side, r })));
  all.sort((x, y) => y.r - x.r || x.id - y.id);
  const picks = winner === null ? all.slice(0, n) : [...all.filter((x) => x.side === winner).slice(0, Math.max(1, n - 1)), ...all.filter((x) => x.side !== winner).slice(0, n > 1 ? 1 : 0)];
  return picks.map((x) => {
    const tb = ctx.box.teams[x.side];
    const pos = ctx.player(x.id)?.position ?? '';
    return `${p(x.id)} (${a(tb.teamId)}, ${pos}): ${statSummary(tb.lines[x.id] ?? {})}. Rated ${ratingText(x.r)}.`;
  });
}

/**
 * A recap of one game. `full` = the user's game (or the Championship): turning point, the numbers,
 * three standouts; otherwise a short one (headline, opening line, the decisive score, one standout).
 */
export function writeRecap(ctx: RecapContext, rng: Rng, full: boolean): Omit<NewsItem, 'id'> {
  const { game: g, box } = ctx;
  const final: [number, number] = [g.score![0], g.score![1]];
  const st = readGame(box, final, g.ot ?? 0);
  const side = (s: 0 | 1) => box.teams[s].teamId;
  const W = st.winner ?? 0;
  const L = (1 - W) as 0 | 1;
  const w = side(W);
  const l = side(L);
  const sc = `${Math.max(...final)}-${Math.min(...final)}`;
  const round = roundOfWeek(g.week);
  const where = round ? ` in the ${ROUND_WORDS[round - 1]}` : g.neutral ? '' : W === 0 ? ' at home' : ' on the road';
  const otWords = g.ot ? (g.ot > 1 ? ` in ${g.ot} overtimes` : ' in overtime') : '';

  let title: string;
  let lede: string;
  switch (st.story) {
    case 'tie':
      title = `${a(w)} AND ${a(l)} PLAY TO A ${sc} TIE`;
      lede = `${t(w)} and ${t(l)} couldn't be separated: ${sc} after ${g.ot ? 'overtime' : 'four quarters'}.`;
      break;
    case 'overtime':
      title = rng.pick([`${a(w)} WIN IT IN OVERTIME, ${sc}`, `${a(w)} OUTLAST ${a(l)} IN OT`]);
      lede = rng.pick([`${t(w)} beat ${t(l)} ${sc}${otWords}${where}.`, `It took overtime, but ${t(w)} got past ${t(l)} ${sc}${where}.`]);
      break;
    case 'comeback':
      title = rng.pick([`${a(w)} RALLY FROM ${st.deficit} DOWN TO BEAT ${a(l)}`, `COMEBACK: ${a(w)} ERASE A ${st.deficit}-POINT HOLE`]);
      lede = rng.pick([`${t(w)} came back from ${st.deficit} points down to beat ${t(l)} ${sc}${where}.`, `Down ${st.deficit}, ${t(w)} never quit and beat ${t(l)} ${sc}${where}.`]);
      break;
    case 'late':
      title = rng.pick([`${a(w)} SCORE LATE TO BEAT ${a(l)}, ${sc}`, `${a(w)} PULL AWAY LATE AGAINST ${a(l)}`]);
      lede = rng.pick([`${t(w)} beat ${t(l)} ${sc}${where}, taking the lead for good in the 4th quarter.`, `A 4th-quarter score lifted ${t(w)} past ${t(l)} ${sc}${where}.`]);
      break;
    case 'shutout':
      title = rng.pick([`${a(w)} SHUT OUT ${a(l)}, ${sc}`, `${a(l)} HELD SCORELESS BY ${a(w)}`]);
      lede = rng.pick([`${t(w)} shut out ${t(l)} ${sc}${where}.`, `${t(l)} never scored: ${t(w)} won ${sc}${where}.`]);
      break;
    case 'blowout':
      title = rng.pick([`${a(w)} ROUT ${a(l)} ${sc}`, `${a(w)} RUN AWAY FROM ${a(l)}`]);
      lede = rng.pick([`${t(w)} routed ${t(l)} ${sc}${where}.`, `It was over early: ${t(w)} beat ${t(l)} ${sc}${where}.`]);
      break;
    case 'defensive':
      title = rng.pick([`${a(w)} WIN A DEFENSIVE BATTLE, ${sc}`, `${a(w)} GRIND OUT A ${sc} WIN`]);
      lede = rng.pick([`Points were hard to come by: ${t(w)} beat ${t(l)} ${sc}${where}.`, `Both defenses ruled the day, and ${t(w)} edged ${t(l)} ${sc}${where}.`]);
      break;
    case 'shootout':
      title = rng.pick([`${a(w)} WIN A ${sc} SHOOTOUT`, `${a(w)} OUTSCORE ${a(l)} IN A SHOOTOUT`]);
      lede = rng.pick([`Nobody could stop anybody: ${t(w)} beat ${t(l)} ${sc}${where}.`, `${t(w)} won a ${sc} shootout against ${t(l)}${where}.`]);
      break;
    case 'close':
      title = rng.pick([`${a(w)} HOLD OFF ${a(l)}, ${sc}`, `${a(w)} EDGE ${a(l)} ${sc}`]);
      lede = rng.pick([`${t(w)} held off ${t(l)} ${sc}${where}.`, `${t(w)} edged ${t(l)} ${sc}${where} in a game that was close throughout.`]);
      break;
    default:
      title = rng.pick([`${a(w)} BEAT ${a(l)} ${sc}`, `${a(w)} TOO MUCH FOR ${a(l)}`]);
      lede = rng.pick([`${t(w)} beat ${t(l)} ${sc}${where}.`, `${t(w)} took care of ${t(l)}, ${sc}${where}.`]);
  }

  const body = [lede];
  // The halftime score when the game turned.
  const [h0, h1] = st.half;
  if (st.winner !== null && (st.story === 'comeback' || st.leadChanges >= 2) && h0 !== h1) {
    const led = h0 > h1 ? side(0) : side(1);
    body.push(`${t(led)} led ${Math.max(h0, h1)}-${Math.min(h0, h1)} at halftime.`);
  }
  // The decisive score.
  if (st.decisive) {
    const d = describeScore(st.decisive, side(st.decisive.side));
    const log = box.scoring ?? [];
    const wire = st.decisive === log[0] && st.leadChanges === 0 && st.story !== 'overtime';
    if (d) body.push(st.story === 'overtime' ? `The winner: ${d}.` : wire ? `${t(w)} never trailed. It started when ${d}.` : `The go-ahead score: ${d}.`);
  }
  if (full) {
    // The biggest touchdown, if it isn't the decisive one.
    const big = (box.scoring ?? []).filter((x) => isTouchdown(x.kind) && (x.yards ?? 0) >= 30 && x !== st.decisive).sort((x, y) => (y.yards ?? 0) - (x.yards ?? 0))[0];
    if (big) {
      const d = describeScore(big, side(big.side));
      if (d) body.push(`Biggest play: ${d}.`);
    }
    // The numbers.
    const yds = (s: 0 | 1) => box.teams[s].stats.passYards + box.teams[s].stats.rushYards;
    const to = (s: 0 | 1) => box.teams[s].stats.turnovers;
    const yw = yds(W);
    const yl = yds(L);
    const nums = [`${a(w)} out-gained ${a(l)} ${yw}-${yl}`];
    if (yw < yl) nums[0] = `${a(w)} won despite being out-gained ${yl}-${yw}`;
    const turnovers = (n: number) => `${n} turnover${n === 1 ? '' : 's'}`;
    if (to(W) !== to(L)) nums.push(`had ${turnovers(to(W))} to ${a(l)}'s ${to(L)}`);
    if (st.winner !== null) body.push(`${nums.join(' and ')}.`);
    body.push(...standouts(ctx, st.winner, 3));
  } else {
    body.push(...standouts(ctx, st.winner, 1));
  }
  const me = ctx.userTeamId;
  const mine = w === me || l === me;
  return { year: 0, week: g.week, kind: 'recap', title, body, gameId: g.id, ...(mine && { mine }) };
}
