/**
 * Contracts and the salary cap (Stage 6a). Pure logic, no Phaser.
 *
 * Money is stored in whole thousands of dollars ($K): 1200 = $1.2M. A contract is a number of
 * seasons from the season it was signed, a flat yearly base salary, a signing bonus spread evenly
 * over its years (the "prorated" part of the cap hit) and some guaranteed base salary.
 *
 * Releasing a player: his base salary that isn't guaranteed is saved; the bonus still to be counted
 * and any guaranteed base still owed land on THIS season's cap at once ("dead money").
 *
 * Market values are a share of the season's cap, so they rise with it.
 */
import { createRng, type Rng } from '../sim/rng';
import { currentAbility, type Player } from '../players/player';
import { generatePlayer } from '../players/generate';
import { ACTIVE_MAX, PEAK_AGE, ROSTER_TARGET, type Position } from '../players/positions';
import type { League, Team } from '../league/league';

export interface Contract {
  /** The first season it counts in. */
  signed: number;
  /** How many seasons it runs (signed .. signed + years - 1). */
  years: number;
  /** Base salary per season ($K). */
  salary: number;
  /** Signing bonus, total ($K), counted evenly over the years. */
  bonus: number;
  /** Guaranteed base salary, total ($K), owed in order from the first season. */
  guaranteed: number;
}

/** Money left on a team's cap by a released player. */
export interface DeadMoney {
  year: number;
  amount: number;
  playerId: number;
}

/** Cap rules. Not on-field feel, so here rather than in feel.ts (like LEAGUE_GEN). */
export const CAP = {
  /** Season 1's cap ($K): ~$200M, real football's scaled to 31-man rosters. */
  base: 200_000,
  /** Rises this much a season. */
  growth: 0.05,
  /** Every team must spend at least this share of the cap. */
  floorShare: 0.8,
  /** The least anyone is paid: active roster / practice squad, as a share of the cap. */
  minShare: 0.0045,
  practiceShare: 0.0025,
  /** Nobody is paid more than this share of the cap in one season. */
  maxShare: 0.24,
};

/** Market value tuning: share of the cap = min + scale x position x curve(rating) x age x noise. */
export const MARKET = {
  scale: 0.0454,
  /** The curve doubles every `doubling` rating points above `pivot`, and is 0 at `zero`. */
  pivot: 12,
  doubling: 3,
  zero: 7,
  position: { QB: 1.95, RB: 0.5, TE: 0.6, WR: 1.05, OL: 0.75, DL: 1.05, LB: 0.6, CB: 0.95, S: 0.6, K: 0.15, P: 0.12 } as Record<Position, number>,
  /** Value drops this much a year past (peak + agePast). */
  ageDrop: 0.85,
  agePast: 2,
  /** Each player's value is rolled within +/- this (his agent, the market). */
  noise: 0.15,
};

/** Mixed into the save's seed, so contracts never move the game's own dice. */
const CONTRACT_SALT = 0xca9c0de;
/** Street free agents (signed when nobody in the pool fits): about a weak backup. */
const STREET_QUALITY: [number, number] = [7.5, 9.5];
/** Generated teams are fitted between these shares of the cap. */
const START_MAX = 0.97;
const START_MIN = 0.83;

export function capFor(year: number): number {
  return Math.round((CAP.base * Math.pow(1 + CAP.growth, Math.max(0, year - 1))) / 100) * 100;
}
export const floorFor = (year: number) => Math.round(capFor(year) * CAP.floorShare);
export const minSalary = (year: number, practice = false) => Math.round(capFor(year) * (practice ? CAP.practiceShare : CAP.minShare));

/** e.g. "$12.4M", "$850K", "-$3.1M". */
export function money(k: number): string {
  const sign = k < 0 ? '-' : '';
  const a = Math.abs(k);
  if (a === 0) return '$0';
  return a >= 1000 ? `${sign}$${(a / 1000).toFixed(1)}M` : `${sign}$${Math.round(a)}K`;
}

export const lastYear = (c: Contract) => c.signed + c.years - 1;
export const yearsLeft = (c: Contract, year: number) => Math.max(0, lastYear(c) - year + 1);
export const isActive = (c: Contract, year: number) => year >= c.signed && year <= lastYear(c);
export const proration = (c: Contract) => Math.round(c.bonus / c.years);

/** This season's cap hit: base + this season's share of the bonus (0 outside the contract). */
export function capHit(c: Contract, year: number): number {
  return isActive(c, year) ? c.salary + proration(c) : 0;
}

/** Guaranteed base salary still owed from `year` on. */
export function guaranteeLeft(c: Contract, year: number): number {
  const paid = c.salary * Math.max(0, year - c.signed);
  return Math.max(0, Math.min(c.guaranteed - paid, c.salary * yearsLeft(c, year)));
}

/** Dead money if he's released in `year`: the bonus not yet counted + guaranteed base still owed. */
export function deadIfCut(c: Contract, year: number): number {
  if (!isActive(c, year)) return 0;
  const left = yearsLeft(c, year);
  const bonusLeft = left === c.years ? c.bonus : proration(c) * left;
  return bonusLeft + guaranteeLeft(c, year);
}

/** One row per remaining season (for the CONTRACT tab). */
export function contractYears(c: Contract, year: number) {
  const rows: { year: number; salary: number; bonus: number; capHit: number; guaranteed: number }[] = [];
  for (let y = Math.max(year, c.signed); y <= lastYear(c); y++) {
    const g = Math.min(c.salary, Math.max(0, c.guaranteed - c.salary * (y - c.signed)));
    rows.push({ year: y, salary: c.salary, bonus: proration(c), capHit: capHit(c, y), guaranteed: g });
  }
  return rows;
}

/** What he'd be paid per season on the open market now ($K), before the dice. */
export function marketValue(p: Player, year: number): number {
  const r = currentAbility(p);
  const curve = Math.max(0, Math.pow(2, (r - MARKET.pivot) / MARKET.doubling) - Math.pow(2, (MARKET.zero - MARKET.pivot) / MARKET.doubling));
  const past = p.age - (PEAK_AGE[p.position] + MARKET.agePast);
  const age = past > 0 ? Math.pow(MARKET.ageDrop, past) : 1;
  const share = Math.min(CAP.maxShare, CAP.minShare + MARKET.scale * MARKET.position[p.position] * curve * age);
  return Math.round(capFor(year) * share);
}

/** How long a new deal runs, by age (older players get shorter ones). */
function rollYears(rng: Rng, p: Player): number {
  const past = p.age - PEAK_AGE[p.position];
  if (past <= -4) return rng.int(3, 4);
  if (past <= 0) return rng.int(2, 5);
  if (past <= 3) return rng.int(1, 3);
  return rng.int(1, 2);
}

/**
 * A new contract starting in `year` worth about `perYear` ($K a season, bonus included): better
 * players get more of it as a bonus and some base guaranteed.
 */
export function makeContract(rng: Rng, p: Player, year: number, perYear: number, years = rollYears(rng, p)): Contract {
  const min = minSalary(year);
  perYear = Math.max(min, Math.round(perYear));
  const r = currentAbility(p);
  const near = perYear < min * 1.6;
  const bonusShare = near ? 0 : r >= 13 ? rng.range(0.25, 0.45) : rng.range(0.05, 0.2);
  const bonus = Math.round(perYear * bonusShare) * years;
  const salary = Math.max(min - Math.round(bonus / years), perYear - Math.round(bonus / years));
  const gYears = near ? 0 : r >= 14 ? rng.int(1, Math.min(2, years)) : rng.int(0, 1);
  return { signed: year, years, salary, bonus, guaranteed: salary * Math.min(gYears, years) };
}

/** A practice-squad deal: the practice minimum, 1-2 seasons. */
function practiceContract(rng: Rng, year: number): Contract {
  return { signed: year, years: rng.int(1, 2), salary: minSalary(year, true), bonus: 0, guaranteed: 0 };
}

export function isContract(c: unknown): c is Contract {
  if (typeof c !== 'object' || c === null) return false;
  const k = c as Record<string, unknown>;
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  return typeof k.signed === 'number' && Number.isInteger(k.signed) && n(k.years) && (k.years as number) >= 1 && n(k.salary) && n(k.bonus) && n(k.guaranteed);
}

/** A team's cap this season. */
export interface CapSheet {
  year: number;
  cap: number;
  floor: number;
  /** Active + practice squad cap hits. */
  players: number;
  dead: number;
  /** players + dead. */
  payroll: number;
  space: number;
  /** Next season: what's already committed, and that season's cap. */
  nextCommitted: number;
  nextCap: number;
}

const teamIds = (t: Team) => [...t.roster, ...t.practice];

export function capSheet(league: League, teamId: number, year: number): CapSheet {
  const t = league.teams[teamId];
  let players = 0;
  let next = 0;
  for (const id of teamIds(t)) {
    const c = league.players[id].contract;
    if (!c) continue;
    players += capHit(c, year);
    next += capHit(c, year + 1);
  }
  const dead = (t.dead ?? []).filter((d) => d.year === year).reduce((a, d) => a + d.amount, 0);
  const cap = capFor(year);
  return { year, cap, floor: floorFor(year), players, dead, payroll: players + dead, space: cap - players - dead, nextCommitted: next, nextCap: capFor(year + 1) };
}

/** The least number of players on a team's active roster. */
export const ACTIVE_MIN = 26;

export type ReleaseCheck = { ok: true } | { ok: false; reason: string };

export function canRelease(league: League, teamId: number, playerId: number): ReleaseCheck {
  const t = league.teams[teamId];
  if (t.practice.includes(playerId)) return { ok: true };
  if (!t.roster.includes(playerId)) return { ok: false, reason: 'NOT ON THIS TEAM' };
  if (t.roster.length <= ACTIVE_MIN) return { ok: false, reason: `THE ROSTER IS AT ITS MINIMUM (${ACTIVE_MIN})` };
  return { ok: true };
}

/**
 * Releases a player in `year`: off the team, into the free-agent pool, contract gone, his dead
 * money on this season's cap. Changes the league in place; returns the dead money ($K).
 */
export function releasePlayer(league: League, teamId: number, playerId: number, year: number): number {
  const t = league.teams[teamId];
  const p = league.players[playerId];
  const dead = p.contract ? deadIfCut(p.contract, year) : 0;
  t.roster = t.roster.filter((id) => id !== playerId);
  t.practice = t.practice.filter((id) => id !== playerId);
  if (dead > 0) t.dead = [...(t.dead ?? []), { year, amount: dead, playerId }];
  delete p.contract;
  league.freeAgents = [...(league.freeAgents ?? []).filter((id) => id !== playerId), playerId];
  return dead;
}

/** Scales the part above the minimum of these contracts so their cap hits in `year` total `target`. */
function fitTo(contracts: Contract[], year: number, target: number) {
  const min = minSalary(year);
  const hit = (c: Contract) => capHit(c, year);
  const extra = contracts.reduce((a, c) => a + Math.max(0, hit(c) - min), 0);
  const fixed = contracts.reduce((a, c) => a + Math.min(hit(c), min), 0);
  if (extra <= 0) return;
  const k = Math.max(0, (target - fixed) / extra);
  for (const c of contracts) {
    if (hit(c) <= min) continue;
    c.salary = Math.max(0, Math.round(min + (c.salary - min) * k));
    c.bonus = Math.round(c.bonus * k);
    c.guaranteed = Math.min(c.guaranteed === 0 ? 0 : Math.round(c.guaranteed * k), c.salary * c.years);
  }
}

/** A contract for a player already on a team when the league starts: part way through its years. */
function startingContract(rng: Rng, p: Player, year: number): Contract {
  const perYear = marketValue(p, year) * rng.range(1 - MARKET.noise, 1 + MARKET.noise);
  const c = makeContract(rng, p, year, perYear);
  c.signed = year - rng.int(0, c.years - 1);
  return c;
}

/**
 * Gives every player on a team a contract if he has none (a new league, or a save from before
 * contracts). A team that had none at all is fitted under the cap and above the floor.
 * Changes the league in place; returns true if anything changed.
 */
export function ensureContracts(league: League, seed: number, year: number): boolean {
  const rng = createRng((seed ^ CONTRACT_SALT ^ Math.imul(year, 0x9e3779b1)) >>> 0);
  let changed = false;
  for (const t of league.teams) {
    const fresh: Contract[] = [];
    for (const id of t.roster) {
      const p = league.players[id];
      if (isContract(p.contract)) continue;
      p.contract = startingContract(rng, p, year);
      fresh.push(p.contract);
    }
    for (const id of t.practice) {
      const p = league.players[id];
      if (isContract(p.contract)) continue;
      p.contract = practiceContract(rng, year);
      p.contract.signed = year - rng.int(0, p.contract.years - 1);
    }
    if (fresh.length) changed = true;
    // A whole team made at once: start legal.
    if (fresh.length === t.roster.length) {
      const sheet = capSheet(league, t.id, year);
      if (sheet.payroll > sheet.cap * START_MAX) fitTo(fresh, year, sheet.cap * START_MAX - (sheet.payroll - sheet.players) - practiceHits(league, t, year));
      else if (sheet.payroll < sheet.cap * START_MIN) fitTo(fresh, year, sheet.cap * START_MIN - (sheet.payroll - sheet.players) - practiceHits(league, t, year));
    }
  }
  return changed;
}

function practiceHits(league: League, t: Team, year: number): number {
  return t.practice.reduce((a, id) => a + capHit(league.players[id].contract ?? { signed: 0, years: 1, salary: 0, bonus: 0, guaranteed: 0 }, year), 0);
}

/**
 * A new season's contracts (START NEXT SEASON): last season's dead money is gone, and every player
 * whose contract ran out re-signs with his team (best players first) at about his market value, or
 * whatever the team can still fit (never below the minimum); a player the team can't pay at least
 * `WALK_SHARE` of his value leaves for the free-agent pool. 6b / 6c replace this with negotiation
 * and free agency. Returns, per team, who re-signed and who left.
 */
export const WALK_SHARE = 0.6;

export function startContractYear(league: League, seed: number, year: number): { resigned: number[]; left: number[] }[] {
  const rng = createRng((seed ^ CONTRACT_SALT ^ 0x51 ^ Math.imul(year, 0x85ebca6b)) >>> 0);
  return league.teams.map((t) => {
    t.dead = (t.dead ?? []).filter((d) => d.year >= year);
    const expired = (ids: number[]) => ids.map((id) => league.players[id]).filter((p) => !p.contract || lastYear(p.contract) < year);
    for (const p of expired(t.practice)) p.contract = practiceContract(rng, year);
    const due = expired(t.roster).sort((a, b) => currentAbility(b) - currentAbility(a));
    for (const p of due) delete p.contract;
    const min = minSalary(year);
    let space = capSheet(league, t.id, year).space;
    const resigned: number[] = [];
    const left: number[] = [];
    // Keep room to fill the roster to ACTIVE_MAX at the minimum.
    const open = ACTIVE_MAX - (t.roster.length - due.length);
    due.forEach((p, i) => {
      const reserve = min * Math.max(0, open - i - 1);
      const want = marketValue(p, year) * rng.range(1 - MARKET.noise, 1 + MARKET.noise);
      const perYear = Math.max(min, Math.min(want, space - reserve));
      if (perYear < want * WALK_SHARE) {
        t.roster = t.roster.filter((id) => id !== p.id);
        league.freeAgents = [...(league.freeAgents ?? []).filter((id) => id !== p.id), p.id];
        left.push(p.id);
        return;
      }
      p.contract = makeContract(rng, p, year, perYear);
      space -= capHit(p.contract, year);
      resigned.push(p.id);
    });
    return { resigned, left };
  });
}

/**
 * Teams with open roster spots sign free agents (a stand-in for 6c's free agency): in rounds, each
 * team short of a position (ROSTER_TARGET) takes the best free agent there it can pay at least
 * WALK_SHARE of his value, at his value or what fits. Teams with the most cap space pick first each
 * round. Then teams with room swap their worst man at a position for a clearly better free agent;
 * `skipTeam` (the user's team) never makes those swaps. Changes the league in place; returns the signings.
 */
export function fillRosters(league: League, seed: number, year: number, skipTeam: number | null = null): { teamId: number; playerId: number }[] {
  const rng = createRng((seed ^ CONTRACT_SALT ^ 0xf1 ^ Math.imul(year, 0xc2b2ae35)) >>> 0);
  const signed: { teamId: number; playerId: number }[] = [];
  const min = minSalary(year);
  for (let round = 0; round < ACTIVE_MAX; round++) {
    let any = false;
    const order = league.teams.filter((t) => t.roster.length < ACTIVE_MAX).sort((a, b) => capSheet(league, b.id, year).space - capSheet(league, a.id, year).space);
    for (const t of order) {
      const have = (pos: Position) => t.roster.filter((id) => league.players[id].position === pos).length;
      const need = (Object.keys(ROSTER_TARGET) as Position[]).filter((pos) => have(pos) < ROSTER_TARGET[pos]);
      if (!need.length) continue;
      const space = capSheet(league, t.id, year).space;
      const openAfter = need.reduce((a, pos) => a + ROSTER_TARGET[pos] - have(pos), 0) - 1;
      const pool = (league.freeAgents ?? [])
        .map((id) => league.players[id])
        .filter((p) => need.includes(p.position))
        .sort((a, b) => currentAbility(b) - currentAbility(a));
      for (const p of pool) {
        const want = marketValue(p, year) * rng.range(1 - MARKET.noise, 1 + MARKET.noise);
        const perYear = Math.max(min, Math.min(want, space - min * openAfter));
        if (perYear < want * WALK_SHARE || perYear > space) continue;
        p.contract = makeContract(rng, p, year, perYear);
        t.roster = [...t.roster, p.id];
        league.freeAgents = league.freeAgents!.filter((id) => id !== p.id);
        signed.push({ teamId: t.id, playerId: p.id });
        any = true;
        break;
      }
      // Nobody fits: a young street free agent at the minimum (Stage 7's draft takes this over).
      if (!any || signed[signed.length - 1].teamId !== t.id) {
        if (space < min && t.roster.length >= ACTIVE_MIN) continue;
        const pos = need[rng.int(0, need.length - 1)];
        const p = generatePlayer(rng, { id: league.players.length, position: pos, quality: rng.range(...STREET_QUALITY), age: rng.int(22, 26) });
        p.contract = { signed: year, years: rng.int(1, 2), salary: min, bonus: 0, guaranteed: 0 };
        league.players.push(p);
        t.roster = [...t.roster, p.id];
        signed.push({ teamId: t.id, playerId: p.id });
        any = true;
      }
    }
    if (!any) break;
  }
  // Upgrades: a team with room signs a clearly better free agent and releases its worst man there.
  for (const t of [...league.teams].filter((x) => x.id !== skipTeam).sort((a, b) => capSheet(league, b.id, year).space - capSheet(league, a.id, year).space)) {
    for (let n = 0; n < UPGRADES; n++) {
      const space = capSheet(league, t.id, year).space;
      let done = false;
      for (const p of (league.freeAgents ?? []).map((id) => league.players[id]).sort((a, b) => currentAbility(b) - currentAbility(a))) {
        const worst = t.roster.map((id) => league.players[id]).filter((q) => q.position === p.position).sort((a, b) => currentAbility(a) - currentAbility(b))[0];
        if (!worst?.contract || currentAbility(p) < currentAbility(worst) + UPGRADE_GAIN) continue;
        const room = space + capHit(worst.contract, year) - deadIfCut(worst.contract, year);
        const want = marketValue(p, year) * rng.range(1 - MARKET.noise, 1 + MARKET.noise);
        const perYear = Math.min(want, room);
        if (perYear < want * WALK_SHARE || perYear < min) continue;
        releasePlayer(league, t.id, worst.id, year);
        p.contract = makeContract(rng, p, year, perYear);
        t.roster = [...t.roster, p.id];
        league.freeAgents = league.freeAgents!.filter((id) => id !== p.id);
        signed.push({ teamId: t.id, playerId: p.id });
        done = true;
        break;
      }
      if (!done) break;
    }
  }
  return signed;
}

/** Most upgrades a team makes in one go, and how much better the newcomer must be (rating points). */
const UPGRADES = 3;
const UPGRADE_GAIN = 1.5;
