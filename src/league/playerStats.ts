/**
 * Player stats (Stage 4b): each player's line for a game, and who gets the credit on a simulated
 * snap. Pure logic.
 *
 * The drive sim rolls what happened on each snap (run, catch, sack, ...: `OppDrive.snaps`); this
 * decides who did it, with its OWN dice (so game results never change): the starting QB throws, the
 * target depends on how far the ball went and how good each receiver is, the RB gets most carries,
 * tackles go to whoever was likely near the ball (by position and tackling), sacks to the pass
 * rushers, picks and breakups to the cover men. Fillers (id -1) get nothing: they're never stored.
 */
import type { Player } from '../players/player';
import type { AttributeKey } from '../players/attributes';
import type { Snap } from '../sim/oppDrive';
import type { Rng } from '../sim/rng';
import type { ScoreInfo } from '../story/scoring';
import type { DefenseLineup, KickingUnit, OffenseLineup } from './lineup';

/** Short keys (box scores are stored for every game of the season). */
export const STAT_KEYS = [
  // passing: attempts, completions, yards, TDs, picks thrown, times sacked
  'pa', 'pc', 'py', 'ptd', 'pint', 'sk',
  // rushing: carries, yards, TDs, longest
  'ra', 'ry', 'rtd', 'rl',
  // receiving: targets, catches, yards, TDs, longest
  'tg', 'rec', 'rcy', 'rctd', 'rcl',
  // defense: tackles, sacks, interceptions, passes defended, forced fumbles; fumbles lost (ball carrier)
  'tk', 'sck', 'dint', 'pd', 'ff', 'fl',
  // kicking: field goals tried / made / longest made, extra points tried / made; punting: punts, net yards
  'fga', 'fgm', 'fgl', 'xpa', 'xpm', 'pu', 'puy',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** Only the stats a player has (no zeros stored). */
export type PlayerLine = Partial<Record<StatKey, number>>;
/** Lines by player id. */
export type Lines = Record<number, PlayerLine>;

/** The players a team has on the field for a game (the same starters the sims and the arcade use). */
export interface StatUnit {
  off: OffenseLineup;
  def: DefenseLineup;
  kick: KickingUnit;
}

/** How credit is shared out (tuning; football layout, not on-field feel). */
export const CREDIT = {
  /** Target share by skill spot [WR1 (wide top), WR3 (slot), WR2 (wide bottom), RB, TE] before ratings. */
  targetShare: [0.25, 0.16, 0.2, 0.17, 0.17],
  /** ...times this by throw length: short (< shortYards), medium, deep (>= deepYards). */
  shortYards: 8,
  deepYards: 15,
  shortTarget: [0.8, 1, 0.8, 1.7, 1.3],
  midTarget: [1.15, 1.1, 1.15, 0.5, 1],
  deepTarget: [1.4, 1, 1.3, 0.15, 0.6],
  /** A receiver this many points above 12 (route running, hands, speed) gets twice the looks. */
  targetDoublingPoints: 4,
  /** Share of designed runs the QB keeps (scrambles); the RB gets the rest. */
  qbRunShare: 0.1,
  /** Tackle weights on a run [CB1, CB3, CB2, LB1, LB2], S1, S2, each DL; past `bigRunYards` the secondary makes it. */
  runTackle: { cover: [0.6, 0.6, 0.6, 3, 2.5], safety: 1, dl: 1.2 },
  bigRunYards: 15,
  bigRunTackle: { cover: [2, 2, 2, 1.5, 1.2], safety: 3, dl: 0.3 },
  /** On a catch: the target's own cover man, the safeties (deep catches: x deepSafety), the LBs, the other corners, the DL. */
  catchTackle: { own: 3, safety: 1.5, deepSafety: 2, lb: 1, cb: 0.5, dl: 0.2 },
  /** Tackling this many points above 12 doubles a defender's share. */
  tackleDoublingPoints: 5,
  /** Sacks: the DL by pass rush (doubling per this many points), and each LB at this weight. */
  sackDoublingPoints: 4,
  sackLbWeight: 0.15,
  /** Interceptions: the target's cover man, each safety, the other corners (x ball skills). */
  pick: { own: 2, safety: 1, cb: 0.5 },
  ballSkillsDoublingPoints: 4,
  /** Share of incompletions that count as a pass defended (the cover man 70%, else a safety). */
  defendedShare: 0.35,
};

const valid = (p: Player | null | undefined): p is Player => !!p && p.id >= 0;

function add(lines: Lines, p: Player | null | undefined, k: StatKey, v = 1) {
  if (!valid(p) || v === 0) return;
  const line = (lines[p.id] ??= {});
  line[k] = (line[k] ?? 0) + v;
}

function best(lines: Lines, p: Player | null | undefined, k: StatKey, value: number) {
  if (!valid(p)) return;
  const v = value || 0; // never -0 (a 0-yard loss): it wouldn't survive a save round trip
  const line = (lines[p.id] ??= {});
  if (line[k] === undefined || v > line[k]!) line[k] = v;
}

/** 2^((rating - 12) / points): a rating edge as a share multiplier. */
const lean = (p: Player | null | undefined, keys: AttributeKey[], points: number) => {
  if (!p) return 1;
  const avg = keys.reduce((s, k) => s + p.attributes[k], 0) / keys.length;
  return 2 ** ((avg - 12) / points);
};

function pick<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Which skill spot the ball went to (index 0-4). */
function target(u: StatUnit, yards: number | null, rng: Rng): number {
  const c = CREDIT;
  const prof = yards === null ? null : yards < c.shortYards ? c.shortTarget : yards >= c.deepYards ? c.deepTarget : c.midTarget;
  const w = u.off.skill.map((p, i) => c.targetShare[i] * (prof ? prof[i] : 1) * lean(p, ['routeRunning', 'hands', 'speed'], c.targetDoublingPoints));
  return pick([0, 1, 2, 3, 4], w, rng);
}

/** Who made the tackle (null = a filler / nobody worth crediting). */
function tackler(def: DefenseLineup, w: { cover: number[]; safety: number[]; dl: number }, rng: Rng): Player {
  const people = [...def.cover, def.safety, def.safety2, ...def.rush];
  const base = [...w.cover, ...w.safety, ...def.rush.map(() => w.dl)];
  return pick(people, base.map((b, i) => b * lean(people[i], ['tackling'], CREDIT.tackleDoublingPoints)), rng);
}

function runTackler(def: DefenseLineup, yards: number, rng: Rng): Player {
  const t = yards >= CREDIT.bigRunYards ? CREDIT.bigRunTackle : CREDIT.runTackle;
  return tackler(def, { cover: t.cover, safety: [t.safety, t.safety], dl: t.dl }, rng);
}

function catchTackler(def: DefenseLineup, to: number, yards: number, rng: Rng): Player {
  const c = CREDIT.catchTackle;
  const deep = yards >= CREDIT.deepYards;
  const cover = def.cover.map((_, i) => (i === to ? c.own : i >= 3 ? c.lb : c.cb));
  const s = c.safety * (deep ? c.deepSafety : 1);
  return tackler(def, { cover, safety: [s, s], dl: c.dl }, rng);
}

/**
 * Credits one simulated drive's snaps: `u` = the team with the ball (its lines in `off`), `d` = the
 * defense (its lines in `def`: tackles, sacks, picks go to the defending team's box). Mutates both.
 */
export function creditSnaps(off: Lines, def: Lines, snaps: readonly Snap[], u: StatUnit, d: StatUnit, rng: Rng, onScore?: (info: ScoreInfo) => void) {
  const pid = (p: Player | null | undefined) => (p && p.id >= 0 ? p.id : undefined);
  const qb = u.off.qb;
  const c = CREDIT;
  for (const s of snaps) {
    switch (s.k) {
      case 'run': {
        const carrier = rng.next() < c.qbRunShare ? qb : u.off.skill[3];
        add(off, carrier, 'ra');
        add(off, carrier, 'ry', s.yards);
        best(off, carrier, 'rl', s.yards);
        if (s.td) {
          add(off, carrier, 'rtd');
          onScore?.({ kind: 'runTd', yards: s.yards, by: pid(carrier) });
        } else {
          const tk = runTackler(d.def, s.yards, rng);
          add(def, tk, 'tk');
          if (s.fumble) {
            add(def, tk, 'ff');
            add(off, carrier, 'fl');
          }
        }
        break;
      }
      case 'pass': {
        const to = target(u, s.yards, rng);
        const rec = u.off.skill[to];
        add(off, qb, 'pa');
        add(off, qb, 'pc');
        add(off, qb, 'py', s.yards);
        add(off, rec, 'tg');
        add(off, rec, 'rec');
        add(off, rec, 'rcy', s.yards);
        best(off, rec, 'rcl', s.yards);
        if (s.td) {
          add(off, qb, 'ptd');
          add(off, rec, 'rctd');
          onScore?.({ kind: 'passTd', yards: s.yards, by: pid(rec), qb: pid(qb) });
        } else {
          const tk = catchTackler(d.def, to, s.yards, rng);
          add(def, tk, 'tk');
          if (s.fumble) {
            add(def, tk, 'ff');
            add(off, rec, 'fl');
          }
        }
        break;
      }
      case 'inc': {
        const to = target(u, null, rng);
        add(off, qb, 'pa');
        add(off, u.off.skill[to], 'tg');
        if (rng.next() < c.defendedShare) add(def, rng.next() < 0.7 ? d.def.cover[to] : rng.next() < 0.5 ? d.def.safety : d.def.safety2, 'pd');
        break;
      }
      case 'int': {
        const to = target(u, null, rng);
        add(off, qb, 'pa');
        add(off, qb, 'pint');
        add(off, u.off.skill[to], 'tg');
        const people = [...d.def.cover.slice(0, 3), d.def.cover[to], d.def.safety, d.def.safety2];
        const w = [...d.def.cover.slice(0, 3).map(() => c.pick.cb), c.pick.own, c.pick.safety, c.pick.safety];
        const who = pick(people, w.map((x, i) => x * lean(people[i], ['ballSkills'], c.ballSkillsDoublingPoints)), rng);
        add(def, who, 'dint');
        add(def, who, 'pd');
        break;
      }
      case 'sack': {
        add(off, qb, 'sk');
        const people = [...d.def.rush, d.def.cover[3], d.def.cover[4]];
        const w = [...d.def.rush.map((p) => lean(p, ['passRush'], c.sackDoublingPoints)), c.sackLbWeight, c.sackLbWeight];
        const who = pick(people, w, rng);
        add(def, who, 'sck');
        add(def, who, 'tk');
        break;
      }
      case 'fg':
        add(off, u.kick.k, 'fga');
        if (s.good) {
          add(off, u.kick.k, 'fgm');
          best(off, u.kick.k, 'fgl', s.yards);
          onScore?.({ kind: 'fg', yards: s.yards, by: pid(u.kick.k) });
        }
        break;
      case 'try':
        if (s.kind === 'extraPoint') {
          add(off, u.kick.k, 'xpa');
          if (s.good) add(off, u.kick.k, 'xpm');
        }
        break;
      case 'punt':
        add(off, u.kick.p, 'pu');
        add(off, u.kick.p, 'puy', s.yards);
        break;
      case 'kneel':
        break;
    }
  }
}

/**
 * One snap of a game the user PLAYED (4b-2): the scene knows exactly who did what, so no dice.
 * Players may be missing (no league yet, or a filler): they just get nothing.
 * `fumble`: the tackler knocked it loose ('kept' = we fell on it, 'lost' = they did).
 */
type P = Player | null | undefined;
export type LivePlay =
  | { k: 'catch'; qb: P; to: P; yards: number; td: boolean; tackler?: P; fumble?: 'kept' | 'lost' }
  | { k: 'run'; carrier: P; yards: number; td: boolean; tackler?: P; fumble?: 'kept' | 'lost' }
  | { k: 'inc'; qb: P; to: P; defended?: P }
  | { k: 'int'; qb: P; to: P; by: P }
  | { k: 'sack'; qb: P; by?: P; fumble?: 'kept' | 'lost' }
  | { k: 'fg'; kicker: P; yards: number; good: boolean }
  | { k: 'xp'; kicker: P; good: boolean }
  | { k: 'punt'; punter: P; net: number };

/** Credits one live snap: `off` = the team with the ball's lines, `def` = the defense's. Mutates both. */
export function creditLive(off: Lines, def: Lines, p: LivePlay) {
  const loose = (tackler: P, carrier: P, fumble?: 'kept' | 'lost') => {
    if (!fumble) return;
    add(def, tackler, 'ff');
    if (fumble === 'lost') add(off, carrier, 'fl');
  };
  switch (p.k) {
    case 'catch':
      add(off, p.qb, 'pa');
      add(off, p.qb, 'pc');
      add(off, p.qb, 'py', p.yards);
      add(off, p.to, 'tg');
      add(off, p.to, 'rec');
      add(off, p.to, 'rcy', p.yards);
      best(off, p.to, 'rcl', p.yards);
      if (p.td) {
        add(off, p.qb, 'ptd');
        add(off, p.to, 'rctd');
      }
      add(def, p.tackler, 'tk');
      loose(p.tackler, p.to, p.fumble);
      break;
    case 'run':
      add(off, p.carrier, 'ra');
      add(off, p.carrier, 'ry', p.yards);
      best(off, p.carrier, 'rl', p.yards);
      if (p.td) add(off, p.carrier, 'rtd');
      add(def, p.tackler, 'tk');
      loose(p.tackler, p.carrier, p.fumble);
      break;
    case 'inc':
      add(off, p.qb, 'pa');
      add(off, p.to, 'tg');
      add(def, p.defended, 'pd');
      break;
    case 'int':
      add(off, p.qb, 'pa');
      add(off, p.qb, 'pint');
      add(off, p.to, 'tg');
      add(def, p.by, 'dint');
      add(def, p.by, 'pd');
      break;
    case 'sack':
      add(off, p.qb, 'sk');
      add(def, p.by, 'sck');
      add(def, p.by, 'tk');
      loose(p.by, p.qb, p.fumble);
      break;
    case 'fg':
      add(off, p.kicker, 'fga');
      if (p.good) {
        add(off, p.kicker, 'fgm');
        best(off, p.kicker, 'fgl', p.yards);
      }
      break;
    case 'xp':
      add(off, p.kicker, 'xpa');
      if (p.good) add(off, p.kicker, 'xpm');
      break;
    case 'punt':
      add(off, p.punter, 'pu');
      add(off, p.punter, 'puy', p.net);
      break;
  }
}

/**
 * Re-sorts two teams' lines so every player is in his own team's (4b-1 saved defenders under the
 * team with the ball). `isA(id)` = he plays for the first team.
 */
export function regroupLines(a: Lines, b: Lines, isA: (id: number) => boolean): [Lines, Lines] {
  const outA: Lines = {};
  const outB: Lines = {};
  for (const src of [a, b])
    for (const [key, l] of Object.entries(src)) {
      const id = Number(key);
      const into = isA(id) ? outA : outB;
      into[id] = addLine(into[id] ?? {}, l);
    }
  return [outA, outB];
}

/** Adds one line into another (season totals). */
export function addLine(into: PlayerLine, from: PlayerLine): PlayerLine {
  const out = { ...into };
  for (const k of STAT_KEYS) {
    const v = from[k];
    if (v === undefined) continue;
    if (k === 'rl' || k === 'rcl' || k === 'fgl') out[k] = Math.max(out[k] ?? -Infinity, v);
    else out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export function sanitizeLines(raw: unknown): Lines | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Lines = {};
  for (const [id, line] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(id) || typeof line !== 'object' || line === null) return null;
    const clean: PlayerLine = {};
    for (const k of STAT_KEYS) {
      const v = (line as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      clean[k] = v;
    }
    out[Number(id)] = clean;
  }
  return out;
}
