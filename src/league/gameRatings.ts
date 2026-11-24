/**
 * Per-game player ratings (Stage 4d): every starter on the field gets a 3.0-10.0 rating for each
 * game, from his stat line, his unit's results and the score. Pure logic, no dice.
 *
 * Everyone starts at `RATE.base`; big moments (TDs, picks, sacks, forced fumbles; picks thrown,
 * fumbles lost, missed kicks) move it, then position efficiency (QB completion % and yards per
 * attempt, yards per touch, catches per target, tackles...). Linemen have no counting stats of
 * their own, so they're rated on their unit: the offensive line on sacks allowed and yards per
 * carry, the defensive line on its sacks and the yards per carry it gave up. A small nudge for the
 * result. Stored x10 as whole numbers (keeps box scores small): 7.4 is stored as 74.
 */
import type { BoxScore, TeamBox } from './boxScore';
import type { PlayerLine, StatUnit } from './playerStats';

/** Tuning (football judgement, not on-field feel). */
export const RATE = {
  base: 6,
  min: 3,
  max: 10,
  /** Win / loss nudge for everyone on the team. */
  result: 0.3,
  qb: { comp: 0.56, compPer: 2, ypa: 6.3, ypaPer: 0.2, volumePer: 0.003, td: 0.4, int: -0.45, sack: -0.08, rushPer: 0.01, rushTd: 0.4 },
  /** Running backs: yards over `ypc` a carry, plus volume, TDs, catches. */
  rb: { ypc: 4.2, overPer: 0.025, volumePer: 0.004, td: 0.35, rec: 0.08, recYardsPer: 0.01 },
  /** Receivers: yards, catches, TDs, minus targets not caught. */
  rec: { yardsPer: 0.015, catch: 0.06, td: 0.45, miss: -0.1 },
  fumbleLost: -0.8,
  def: { tackle: 0.1, sack: 0.75, int: 0.9, pd: 0.25, ff: 0.5 },
  /** Corners and safeties: their side's pass yards allowed vs `passYards` (per yard). */
  db: { passYards: 200, per: -0.004 },
  /** Linebackers: the opponent's yards per carry vs `ypc`. */
  lb: { ypc: 4.2, per: -0.3 },
  /** Defensive line: the opponent's yards per carry and the team's sacks. */
  dl: { ypc: 4.2, per: -0.35, teamSack: 0.12 },
  /** Offensive line: sacks allowed vs `sacks`, the team's yards per carry and total yards. */
  ol: { sacks: 3, sackPer: -0.2, ypc: 4.2, ypcPer: 0.3, yards: 250, yardsPer: 0.0025 },
  k: { make: 0.35, long: 0.25, longYards: 50, miss: -0.6, xp: 0.08, xpMiss: -0.4 },
  p: { net: 36, per: 0.08 },
};

export type RatingRole = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

/** Each starter's job on this team in this game (fillers, id -1, left out). First job wins. */
export function roles(u: StatUnit): Map<number, RatingRole> {
  const out = new Map<number, RatingRole>();
  const put = (id: number, r: RatingRole) => {
    if (id >= 0 && !out.has(id)) out.set(id, r);
  };
  put(u.off.qb.id, 'QB');
  u.off.skill.forEach((p, i) => put(p.id, i === 3 ? 'RB' : i === 4 ? 'TE' : 'WR'));
  u.off.line.forEach((p) => put(p.id, 'OL'));
  u.def.rush.forEach((p) => put(p.id, 'DL'));
  u.def.cover.forEach((p, i) => put(p.id, i >= 3 ? 'LB' : 'CB'));
  put(u.def.safety.id, 'S');
  put(u.def.safety2.id, 'S');
  put(u.kick.k.id, 'K');
  put(u.kick.p.id, 'P');
  return out;
}

const v = (l: PlayerLine, k: keyof PlayerLine) => l[k] ?? 0;
const pts = (t: TeamBox) => t.byPeriod.reduce((a, b) => a + b, 0);

/** Team carries in a game (from its players' lines). */
const carries = (t: TeamBox) => Object.values(t.lines).reduce((a, l) => a + v(l, 'ra'), 0);
const ypc = (t: TeamBox) => {
  const c = carries(t);
  return c ? t.stats.rushYards / c : RATE.rb.ypc;
};

/** One player's rating (unrounded, unclamped) from his line, his job and both teams' results. */
export function rawRating(l: PlayerLine, role: RatingRole, me: TeamBox, them: TeamBox): number {
  const R = RATE;
  let r = R.base;
  const won = pts(me) > pts(them) ? 1 : pts(me) < pts(them) ? -1 : 0;
  r += won * R.result;
  r += v(l, 'fl') * R.fumbleLost;
  // Anyone can catch, run or make a defensive play (a WR's carry, a QB's scramble...): count it all.
  const rushOver = v(l, 'ry') - R.rb.ypc * v(l, 'ra');
  switch (role) {
    case 'QB': {
      const a = v(l, 'pa');
      if (a) {
        r += (v(l, 'pc') / a - R.qb.comp) * R.qb.compPer * Math.min(1, a / 20);
        r += (v(l, 'py') / a - R.qb.ypa) * R.qb.ypaPer * Math.min(1, a / 20);
        r += v(l, 'py') * R.qb.volumePer - 180 * R.qb.volumePer;
      }
      r += v(l, 'ptd') * R.qb.td + v(l, 'pint') * R.qb.int + v(l, 'sk') * R.qb.sack;
      r += v(l, 'ry') * R.qb.rushPer + v(l, 'rtd') * R.qb.rushTd;
      break;
    }
    case 'RB':
      r += rushOver * R.rb.overPer + v(l, 'ry') * R.rb.volumePer + v(l, 'rtd') * R.rb.td;
      r += v(l, 'rec') * R.rb.rec + v(l, 'rcy') * R.rb.recYardsPer + v(l, 'rctd') * R.rec.td;
      break;
    case 'WR':
    case 'TE':
      r += v(l, 'rcy') * R.rec.yardsPer + v(l, 'rec') * R.rec.catch + v(l, 'rctd') * R.rec.td + (v(l, 'tg') - v(l, 'rec')) * R.rec.miss;
      r += v(l, 'ry') * R.rb.volumePer + v(l, 'rtd') * R.rb.td;
      break;
    case 'OL':
      r += (me.stats.sacked - R.ol.sacks) * R.ol.sackPer + (ypc(me) - R.ol.ypc) * R.ol.ypcPer + (me.stats.passYards + me.stats.rushYards - R.ol.yards) * R.ol.yardsPer;
      break;
    case 'K': {
      const made = v(l, 'fgm');
      r += made * R.k.make + (v(l, 'fga') - made) * R.k.miss + v(l, 'xpm') * R.k.xp + (v(l, 'xpa') - v(l, 'xpm')) * R.k.xpMiss;
      if (v(l, 'fgl') >= R.k.longYards) r += R.k.long;
      break;
    }
    case 'P': {
      const n = v(l, 'pu');
      if (n) r += (v(l, 'puy') / n - R.p.net) * R.p.per * Math.min(1, n / 3);
      break;
    }
    default:
      break;
  }
  // Defensive plays (anyone's, but defenders are the ones who make them).
  r += v(l, 'tk') * R.def.tackle + v(l, 'sck') * R.def.sack + v(l, 'dint') * R.def.int + v(l, 'pd') * R.def.pd + v(l, 'ff') * R.def.ff;
  if (role === 'CB' || role === 'S') r += (them.stats.passYards - R.db.passYards) * R.db.per;
  if (role === 'LB') r += (ypc(them) - R.lb.ypc) * R.lb.per;
  if (role === 'DL') r += (ypc(them) - R.dl.ypc) * R.dl.per + them.stats.sacked * R.dl.teamSack;
  return r;
}

/** Clamped and rounded to one decimal, stored x10. */
export const toStored = (raw: number) => Math.round(Math.min(RATE.max, Math.max(RATE.min, raw)) * 10);
export const ratingText = (stored: number) => (stored / 10).toFixed(1);

/** Ratings for both teams of a finished game (`units` in the box's team order: [home, away]). */
export function rateGame(box: BoxScore, units: [StatUnit, StatUnit]): [Record<number, number>, Record<number, number>] {
  return [0, 1].map((side) => {
    const me = box.teams[side];
    const them = box.teams[1 - side];
    const out: Record<number, number> = {};
    for (const [id, role] of roles(units[side])) out[id] = toStored(rawRating(me.lines[id] ?? {}, role, me, them));
    return out;
  }) as [Record<number, number>, Record<number, number>];
}

/** The best rating in a game (both teams): the player of the game. Ties: the winning team, then the lower id. */
export function playerOfTheGame(box: BoxScore): { side: 0 | 1; id: number; rating: number } | null {
  let best: { side: 0 | 1; id: number; rating: number } | null = null;
  const won = (s: number) => pts(box.teams[s]) > pts(box.teams[1 - s]);
  for (const side of [0, 1] as const)
    for (const [key, rating] of Object.entries(box.teams[side].ratings ?? {})) {
      const id = Number(key);
      if (!best || rating > best.rating || (rating === best.rating && (won(side) && !won(best.side) || (won(side) === won(best.side) && id < best.id))))
        best = { side, id, rating };
    }
  return best;
}

/** A team's average rating on offense and on defense (stored x10; null = nobody rated). */
export function unitAverages(t: TeamBox, u: StatUnit): { off: number | null; def: number | null } {
  const r = t.ratings ?? {};
  const map = roles(u);
  const avg = (want: (role: RatingRole) => boolean) => {
    const list = [...map].filter(([id, role]) => want(role) && r[id] !== undefined).map(([id]) => r[id]);
    return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  };
  return { off: avg((x) => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(x)), def: avg((x) => ['DL', 'LB', 'CB', 'S'].includes(x)) };
}

/** Colour band of a rating (one decimal, e.g. 7.4): dark green 8+, light green 7s, yellow 6s, orange 5s, dark red under 5. */
export function ratingBand(r: number): 'r-great' | 'r-good' | 'r-ok' | 'r-poor' | 'r-bad' {
  return r >= 8 ? 'r-great' : r >= 7 ? 'r-good' : r >= 6 ? 'r-ok' : r >= 5 ? 'r-poor' : 'r-bad';
}
