/**
 * What the roster screen lists (Stage 3c): every player of a team in depth-chart order with his
 * slot (QB1, QB2 ...), stars and the three card ratings. Pure logic.
 */
import { CARD_ATTRS, stars } from '../players/display';
import { currentAbility, fullName, type Player } from '../players/player';
import { POSITIONS, STARTERS, type Position } from '../players/positions';
import { depthChart, type League } from './league';

export interface RosterRow {
  player: Player;
  /** "QB1", "WR3" ... or "PS" on the practice squad. */
  slot: string;
  starter: boolean;
  position: Position;
  name: string;
  age: number;
  stars: number;
  card: { key: (typeof CARD_ATTRS)[Position][number]; value: number }[];
}

function row(p: Player, slot: string, starter: boolean): RosterRow {
  return {
    player: p,
    slot,
    starter,
    position: p.position,
    name: fullName(p),
    age: p.age,
    stars: stars(currentAbility(p)),
    card: CARD_ATTRS[p.position].map((key) => ({ key, value: p.attributes[key] })),
  };
}

/** The active roster in depth-chart order: QB1, QB2, RB1 ... P1. Fillers are left out. */
export function rosterRows(league: League, teamId: number): RosterRow[] {
  const chart = depthChart(league, teamId);
  const rows: RosterRow[] = [];
  for (const pos of POSITIONS) {
    chart[pos]
      .filter((s) => !s.filler && s.player.position === pos)
      .forEach((s, i) => rows.push(row(s.player, `${pos}${i + 1}`, i < STARTERS[pos])));
  }
  return rows;
}

/** The practice squad, grouped by position, best first. */
export function practiceRows(league: League, teamId: number): RosterRow[] {
  const order = (p: Player) => POSITIONS.indexOf(p.position);
  return league.teams[teamId].practice
    .map((id) => league.players[id])
    .sort((a, b) => order(a) - order(b) || currentAbility(b) - currentAbility(a))
    .map((p) => row(p, 'PS', false));
}
