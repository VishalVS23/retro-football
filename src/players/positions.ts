/**
 * Positions and roster rules (Stage 3). Pure data, no Phaser.
 * Full 11-on-11 is the target (step 3h); until then the arcade field uses a subset.
 */
export type Position = 'QB' | 'RB' | 'TE' | 'WR' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export const POSITIONS: readonly Position[] = ['QB', 'RB', 'TE', 'WR', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

export const POSITION_NAMES: Record<Position, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  TE: 'Tight end',
  WR: 'Wide receiver',
  OL: 'Offensive lineman',
  DL: 'Defensive lineman',
  LB: 'Linebacker',
  CB: 'Cornerback',
  S: 'Safety',
  K: 'Kicker',
  P: 'Punter',
};

/** Starters per position: 11 on offense, 11 on defense, plus the kicker and punter (24). */
export const STARTERS: Record<Position, number> = { QB: 1, RB: 1, TE: 1, WR: 3, OL: 5, DL: 4, LB: 2, CB: 3, S: 2, K: 1, P: 1 };

/**
 * Default active roster: the 24 starters plus 7 backups (QB, RB, WR, OL, DL, LB and one defensive
 * back) = 31. No backup tight end: a receiver or lineman plays out of position, or a filler.
 */
export const ROSTER_TARGET: Record<Position, number> = { QB: 2, RB: 2, TE: 1, WR: 4, OL: 6, DL: 5, LB: 3, CB: 4, S: 2, K: 1, P: 1 };

export const ACTIVE_MAX = 31;
export const PRACTICE_MAX = 5;

/** How well a player can play a position (Football Manager style). Missing = awkward. */
export type Familiarity = 'natural' | 'accomplished' | 'competent' | 'unconvincing' | 'awkward';

export const FAMILIARITY_ORDER: readonly Familiarity[] = ['natural', 'accomplished', 'competent', 'unconvincing', 'awkward'];

/** Share of his true rating a player keeps when he plays a position at this familiarity. */
export const FAMILIARITY_RATIO: Record<Familiarity, number> = {
  natural: 1,
  accomplished: 0.95,
  competent: 0.88,
  unconvincing: 0.78,
  awkward: 0.6,
};

/**
 * Positions a player might also be able to play, with the best and worst familiarity he can
 * start with there (rolled at generation, nudged by his versatility).
 */
export const NEIGHBOURS: Record<Position, { pos: Position; best: Familiarity; worst: Familiarity }[]> = {
  QB: [],
  RB: [{ pos: 'WR', best: 'competent', worst: 'unconvincing' }],
  TE: [
    { pos: 'OL', best: 'competent', worst: 'unconvincing' },
    { pos: 'WR', best: 'competent', worst: 'unconvincing' },
  ],
  WR: [
    { pos: 'TE', best: 'competent', worst: 'unconvincing' },
    { pos: 'RB', best: 'unconvincing', worst: 'unconvincing' },
    { pos: 'CB', best: 'unconvincing', worst: 'unconvincing' },
  ],
  OL: [
    { pos: 'TE', best: 'unconvincing', worst: 'unconvincing' },
    { pos: 'DL', best: 'unconvincing', worst: 'unconvincing' },
  ],
  DL: [
    { pos: 'LB', best: 'competent', worst: 'unconvincing' },
    { pos: 'OL', best: 'unconvincing', worst: 'unconvincing' },
  ],
  LB: [
    { pos: 'DL', best: 'competent', worst: 'unconvincing' },
    { pos: 'S', best: 'competent', worst: 'unconvincing' },
  ],
  CB: [
    { pos: 'S', best: 'accomplished', worst: 'competent' },
    { pos: 'WR', best: 'unconvincing', worst: 'unconvincing' },
  ],
  S: [
    { pos: 'CB', best: 'accomplished', worst: 'competent' },
    { pos: 'LB', best: 'competent', worst: 'unconvincing' },
  ],
  K: [{ pos: 'P', best: 'competent', worst: 'unconvincing' }],
  P: [{ pos: 'K', best: 'competent', worst: 'unconvincing' }],
};

/** Age a player at this position is usually at his best (RBs early, QBs and kickers late). Used for generation now, development in Stage 8. */
export const PEAK_AGE: Record<Position, number> = { QB: 29, RB: 25, TE: 27, WR: 26, OL: 28, DL: 27, LB: 26, CB: 26, S: 27, K: 31, P: 31 };
