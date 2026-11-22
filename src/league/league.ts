/**
 * The league (Stage 3b): 32 teams with full rosters, made from the save's seed. Pure logic.
 *
 * Players live in one list (`players[id]`); teams hold ids. Each team has 31 active players
 * (ROSTER_TARGET) and a 5-man practice squad. Fillers (unnamed stand-ins for a position with no
 * one left) are made on the spot and never stored.
 */
import { createRng, type Rng } from '../sim/rng';
import { generatePlayer } from '../players/generate';
import { randomName } from '../players/names';
import { positionRating, type Player } from '../players/player';
import { PEAK_AGE, POSITIONS, PRACTICE_MAX, ROSTER_TARGET, STARTERS, type Position } from '../players/positions';
import { ATTRIBUTE_KEYS, HIDDEN, type Attributes, type Hidden } from '../players/attributes';
import { TEAM_DEFS, type TeamDef } from './teams';

export interface Team extends TeamDef {
  id: number;
  /** How strong the club was built (-1 weak ... +1 strong). Only used when generating. */
  talent: number;
  /** Active roster (player ids). */
  roster: number[];
  /** Practice squad (player ids). */
  practice: number[];
}

export interface League {
  teams: Team[];
  /** Every player in the league, `players[id]`. */
  players: Player[];
  /** The team the user coaches (null = not picked yet). */
  userTeamId: number | null;
}

/** League generation tuning (not on-field feel, so it lives here rather than in feel.ts). */
export const LEAGUE_GEN = {
  /** Mixed into the save's seed, so making the league never moves the game's own dice. */
  seedSalt: 0x5eed1e,
  /** A starter's quality: base + team talent x spread, +/- noise. */
  starterBase: 12,
  talentSpread: 2.2,
  starterNoise: 1.6,
  /** Chance a starter is a star (+ starBonus). */
  starChance: 0.07,
  starBonus: 3,
  /** Backups: this much below the starter base, half the talent effect. */
  backupDrop: 2.8,
  /** Practice squad: young (21-23) and raw. */
  practiceQuality: [6, 9.5] as [number, number],
  /** Ages: around the position's peak, +/- this many years. */
  ageSpread: 5,
  minAge: 21,
  maxAge: 35,
  /** Kickers and punters can play longer. */
  kickerMaxAge: 38,
};

/** Quality of a stand-in when a position runs out of players: below a normal backup. */
export const FILLER_QUALITY = 7;

const tri = (rng: Rng) => rng.next() + rng.next() - 1;

function rollAge(rng: Rng, pos: Position): number {
  const max = pos === 'K' || pos === 'P' ? LEAGUE_GEN.kickerMaxAge : LEAGUE_GEN.maxAge;
  return Math.min(max, Math.max(LEAGUE_GEN.minAge, Math.round(PEAK_AGE[pos] - 1 + tri(rng) * LEAGUE_GEN.ageSpread)));
}

/** Makes the whole league from a seed. Same seed = same league. */
export function generateLeague(seed: number): League {
  const rng = createRng((seed ^ LEAGUE_GEN.seedSalt) >>> 0);
  const players: Player[] = [];
  let teamNames = new Set<string>();
  const add = (position: Position, quality: number, age: number) => {
    const p = generatePlayer(rng, { id: players.length, position, quality: Math.min(19, Math.max(3, quality)), age });
    // Two players with the same name on one team would be confusing: pick another name.
    for (let tries = 0; teamNames.has(`${p.firstName} ${p.lastName}`) && tries < 20; tries++) Object.assign(p, randomName(rng));
    teamNames.add(`${p.firstName} ${p.lastName}`);
    players.push(p);
    return p.id;
  };
  // Talent levels spread evenly from weakest to strongest, then shuffled between clubs.
  const talents = TEAM_DEFS.map((_, i) => (i / (TEAM_DEFS.length - 1)) * 2 - 1);
  for (let i = talents.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [talents[i], talents[j]] = [talents[j], talents[i]];
  }
  const teams = TEAM_DEFS.map((def, id): Team => {
    const talent = talents[id];
    teamNames = new Set();
    const roster: number[] = [];
    for (const pos of POSITIONS) {
      for (let slot = 0; slot < ROSTER_TARGET[pos]; slot++) {
        const starter = slot < STARTERS[pos];
        let q = starter
          ? LEAGUE_GEN.starterBase + talent * LEAGUE_GEN.talentSpread + tri(rng) * LEAGUE_GEN.starterNoise
          : LEAGUE_GEN.starterBase - LEAGUE_GEN.backupDrop + (talent * LEAGUE_GEN.talentSpread) / 2 + tri(rng) * LEAGUE_GEN.starterNoise;
        if (starter && rng.chance(LEAGUE_GEN.starChance)) q += LEAGUE_GEN.starBonus;
        roster.push(add(pos, q, rollAge(rng, pos)));
      }
    }
    // Practice squad: young skill players and linemen with something to learn.
    const practice: number[] = [];
    const squadPositions: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];
    for (let i = 0; i < PRACTICE_MAX; i++) {
      practice.push(add(rng.pick(squadPositions), rng.range(...LEAGUE_GEN.practiceQuality), rng.int(21, 23)));
    }
    return { ...def, id, talent, roster, practice };
  });
  return { teams, players, userTeamId: null };
}

/** A starter or backup slot: a real player, or a filler made on the spot (never stored). */
export interface Slot {
  player: Player;
  filler: boolean;
  /** His rating at this position (familiarity included). */
  rating: number;
}

/** An unnamed stand-in: every attribute at FILLER_QUALITY, average hidden attributes. */
export function makeFiller(pos: Position): Player {
  const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, FILLER_QUALITY])) as Attributes;
  const hidden = Object.fromEntries(HIDDEN.map((k) => [k, 10])) as Hidden;
  return {
    id: -1,
    firstName: 'Fill-in',
    lastName: pos,
    age: 26,
    position: pos,
    attributes,
    hidden,
    potential: FILLER_QUALITY,
    familiarity: {},
    traits: [],
  };
}

/**
 * The automatic depth chart: for each position, everyone on the active roster who could play
 * there, best first. Starters are the first STARTERS[pos]. Positions are filled in order of
 * scarcity (QB first, OL last) and a player only appears once; when nobody natural is left, the
 * best out-of-position player fills in, and if he'd be worse than a filler (or nobody is left),
 * a filler does.
 */
export function depthChart(league: League, teamId: number, unavailable: ReadonlySet<number> = new Set()): Record<Position, Slot[]> {
  const team = league.teams[teamId];
  const pool = team.roster.map((id) => league.players[id]).filter((p) => !unavailable.has(p.id));
  const used = new Set<number>();
  const chart = {} as Record<Position, Slot[]>;
  // Natural players first, everywhere.
  for (const pos of POSITIONS) {
    chart[pos] = pool
      .filter((p) => p.position === pos)
      .map((p) => ({ player: p, filler: false, rating: positionRating(p, pos) }))
      .sort((a, b) => b.rating - a.rating);
    chart[pos].forEach((s) => used.add(s.player.id));
  }
  // Then fill any starting spot that's still empty: spare (non-starting) players out of position, or a filler.
  const starting = new Set<number>();
  for (const pos of POSITIONS) chart[pos].slice(0, STARTERS[pos]).forEach((s) => starting.add(s.player.id));
  for (const pos of POSITIONS) {
    while (chart[pos].length < STARTERS[pos]) {
      const spare = pool
        .filter((p) => !starting.has(p.id) && p.position !== pos)
        .map((p) => ({ player: p, filler: false, rating: positionRating(p, pos) }))
        .sort((a, b) => b.rating - a.rating)[0];
      if (spare && spare.rating > FILLER_QUALITY) {
        chart[pos].push(spare);
        starting.add(spare.player.id);
      } else {
        chart[pos].push({ player: makeFiller(pos), filler: true, rating: FILLER_QUALITY });
      }
    }
  }
  return chart;
}

export interface TeamRatings {
  offense: number;
  defense: number;
  special: number;
  overall: number;
}

/** How much each starter counts toward the unit ratings (the QB most). */
const UNIT_WEIGHTS: Partial<Record<Position, number>> = { QB: 3, RB: 1, TE: 1, WR: 1, OL: 0.6, DL: 1, LB: 1, CB: 1, S: 1, K: 1, P: 1 };
const OFFENSE: Position[] = ['QB', 'RB', 'TE', 'WR', 'OL'];
const DEFENSE: Position[] = ['DL', 'LB', 'CB', 'S'];
const SPECIAL: Position[] = ['K', 'P'];

function unitRating(chart: Record<Position, Slot[]>, positions: Position[]): number {
  let sum = 0;
  let total = 0;
  for (const pos of positions) {
    for (const s of chart[pos].slice(0, STARTERS[pos])) {
      const w = UNIT_WEIGHTS[pos] ?? 1;
      sum += s.rating * w;
      total += w;
    }
  }
  return Math.round((sum / total) * 10) / 10;
}

/** Offense, defense and special teams ratings from the starters (1–20). */
export function teamRatings(league: League, teamId: number): TeamRatings {
  const chart = depthChart(league, teamId);
  const offense = unitRating(chart, OFFENSE);
  const defense = unitRating(chart, DEFENSE);
  const special = unitRating(chart, SPECIAL);
  return { offense, defense, special, overall: Math.round((0.45 * offense + 0.45 * defense + 0.1 * special) * 10) / 10 };
}

export function teamName(t: Pick<TeamDef, 'city' | 'nickname'>): string {
  return `${t.city} ${t.nickname}`;
}

/** A random opponent for the next game (anyone but the user's team). */
export function pickOpponent(league: League, rng: Rng): number {
  const others = league.teams.filter((t) => t.id !== league.userTeamId);
  return rng.pick(others).id;
}

/**
 * Light check of a league read from storage or a file. Returns it if it looks sound, else null
 * (the league is then made again from the seed, and the user picks a team again).
 */
export function sanitizeLeague(raw: unknown): League | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const l = raw as Partial<League>;
  if (!Array.isArray(l.teams) || l.teams.length !== TEAM_DEFS.length || !Array.isArray(l.players)) return null;
  const n = l.players.length;
  const okId = (id: unknown) => typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < n;
  for (const t of l.teams) {
    if (typeof t !== 'object' || t === null || !Array.isArray(t.roster) || !Array.isArray(t.practice)) return null;
    if (!t.roster.every(okId) || !t.practice.every(okId)) return null;
  }
  for (let i = 0; i < n; i++) {
    const p = l.players[i];
    if (typeof p !== 'object' || p === null || p.id !== i || typeof p.attributes !== 'object' || typeof p.hidden !== 'object') return null;
  }
  const user = l.userTeamId;
  if (!(user === null || (typeof user === 'number' && Number.isInteger(user) && user >= 0 && user < l.teams.length))) return null;
  return l as League;
}
