/**
 * What the CAP view and the CONTRACT tab show (Stage 6a). Pure logic.
 */
import { fullName } from '../players/player';
import type { Position } from '../players/positions';
import type { League } from '../league/league';
import { canRelease, capHit, capSheet, contractYears, deadIfCut, lastYear, marketValue, yearsLeft, type CapSheet, type ReleaseCheck } from './contracts';

export interface CapRow {
  id: number;
  name: string;
  pos: Position;
  age: number;
  practice: boolean;
  capHit: number;
  yearsLeft: number;
  dead: number;
}

export interface CapView {
  sheet: CapSheet;
  /** Everyone on the team, biggest cap hit first. */
  rows: CapRow[];
  /** This season's dead money, biggest first. */
  dead: { name: string; amount: number }[];
}

export function capView(league: League, teamId: number, year: number): CapView {
  const t = league.teams[teamId];
  const rows: CapRow[] = [];
  for (const [ids, practice] of [
    [t.roster, false],
    [t.practice, true],
  ] as const) {
    for (const id of ids) {
      const p = league.players[id];
      const c = p.contract;
      rows.push({ id, name: fullName(p), pos: p.position, age: p.age, practice, capHit: c ? capHit(c, year) : 0, yearsLeft: c ? yearsLeft(c, year) : 0, dead: c ? deadIfCut(c, year) : 0 });
    }
  }
  rows.sort((a, b) => b.capHit - a.capHit || a.name.localeCompare(b.name));
  const dead = (t.dead ?? [])
    .filter((d) => d.year === year)
    .map((d) => ({ name: league.players[d.playerId] ? fullName(league.players[d.playerId]) : 'A released player', amount: d.amount }))
    .sort((a, b) => b.amount - a.amount);
  return { sheet: capSheet(league, teamId, year), rows, dead };
}

export interface ContractView {
  year: number;
  /** The season his contract runs through, and seasons left (this one included). */
  through: number;
  yearsLeft: number;
  signed: number;
  years: number;
  rows: ReturnType<typeof contractYears>;
  /** Everything still to be paid / counted (base + bonus). */
  remaining: number;
  guaranteedLeft: number;
  /** If released now: dead money this season and the cap saved this season (can be negative). */
  dead: number;
  saved: number;
  /** About what he'd get on the open market now, per season. */
  market: number;
  /** Null = not the user's team (or not allowed here: during a game). */
  release: ReleaseCheck | null;
}

export function contractView(league: League, teamId: number, playerId: number, year: number, releaseAllowed: boolean): ContractView | null {
  const p = league.players[playerId];
  const c = p?.contract;
  if (!c) return null;
  const rows = contractYears(c, year);
  const dead = deadIfCut(c, year);
  return {
    year,
    through: lastYear(c),
    yearsLeft: yearsLeft(c, year),
    signed: c.signed,
    years: c.years,
    rows,
    remaining: rows.reduce((a, r) => a + r.capHit, 0),
    guaranteedLeft: rows.reduce((a, r) => a + r.guaranteed, 0),
    dead,
    saved: capHit(c, year) - dead,
    market: marketValue(p, year),
    release: releaseAllowed ? canRelease(league, teamId, playerId) : null,
  };
}
