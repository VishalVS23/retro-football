/**
 * Downs, distance, field position and score. Pure rules, no Phaser.
 * Positions use the same x as field.ts: 0 = back of our end zone, 10 = our goal line,
 * 110 = their goal line. Our offense always drives toward +x.
 */
import { END_ZONE_DEPTH, FIELD_LENGTH } from './field';

export const OWN_GOAL_X = END_ZONE_DEPTH; // 10
export const OPP_GOAL_X = END_ZONE_DEPTH + FIELD_LENGTH; // 110
export const YARDS_FOR_FIRST_DOWN = 10;
/** Where a new drive starts until kickoffs and opponent drives exist (our 25). */
export const NEW_DRIVE_X = OWN_GOAL_X + 25;
export const TD_POINTS = 6;
export const SAFETY_POINTS = 2;
/** Interception downed in their own end zone = touchback: their ball at their 20. */
export const TOUCHBACK_X = OPP_GOAL_X - 20;

export interface GameState {
  /** Line of scrimmage, whole yards. */
  ballX: number;
  down: 1 | 2 | 3 | 4;
  /** The line to reach for a first down (their goal line when it's "& Goal"). */
  firstDownX: number;
  us: number; // our score
  them: number; // their score
  /**
   * Where the opponent takes over after our last turnover (x, our coordinates), or null.
   * Opponent drives (Stage 2 step 6) start here; until then our next drive starts at our 25.
   */
  oppStartX: number | null;
}

/** How a play ended, as far as the rules care. */
export type PlayOutcome =
  | { kind: 'spot'; x: number } // ball carrier down / out of bounds / sacked at this x
  | { kind: 'incomplete' }
  | { kind: 'touchdown' }
  | { kind: 'interception'; returnedTo: number } // picked off and returned to this x
  | { kind: 'pickSix' }; // picked off and returned for a touchdown

/** Something worth a banner. null = just the next down. */
export type DriveEvent = 'firstDown' | 'turnoverOnDowns' | 'touchdown' | 'safety' | 'interception' | 'pickSix' | null;

export function newGame(): GameState {
  return { ...firstDownAt(NEW_DRIVE_X), us: 0, them: 0, oppStartX: null };
}

function firstDownAt(ballX: number): Pick<GameState, 'ballX' | 'down' | 'firstDownX'> {
  return { ballX, down: 1, firstDownX: Math.min(ballX + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X) };
}

/** Applies one play's result and says what happened. */
export function applyPlay(s: GameState, o: PlayOutcome): { state: GameState; event: DriveEvent } {
  const next = (state: GameState, event: DriveEvent) => ({ state, event });
  if (o.kind === 'touchdown') {
    return next({ ...s, ...firstDownAt(NEW_DRIVE_X), us: s.us + TD_POINTS, oppStartX: null }, 'touchdown');
  }
  if (o.kind === 'pickSix') {
    return next({ ...s, ...firstDownAt(NEW_DRIVE_X), them: s.them + TD_POINTS, oppStartX: null }, 'pickSix');
  }
  if (o.kind === 'interception') {
    if (o.returnedTo <= OWN_GOAL_X) return applyPlay(s, { kind: 'pickSix' });
    const oppStartX = o.returnedTo >= OPP_GOAL_X ? TOUCHBACK_X : Math.round(o.returnedTo);
    return next({ ...s, ...firstDownAt(NEW_DRIVE_X), oppStartX }, 'interception');
  }

  let spot = s.ballX;
  if (o.kind === 'spot') {
    // Down in our own end zone (behind the goal line) = safety.
    if (o.x < OWN_GOAL_X) {
      return next({ ...s, ...firstDownAt(NEW_DRIVE_X), them: s.them + SAFETY_POINTS, oppStartX: null }, 'safety');
    }
    if (o.x >= OPP_GOAL_X) {
      return applyPlay(s, { kind: 'touchdown' });
    }
    // Spot to the nearest yard, but never on a goal line (between the 1s).
    spot = Math.min(OPP_GOAL_X - 1, Math.max(OWN_GOAL_X + 1, Math.round(o.x)));
  }

  if (spot >= s.firstDownX) return { state: { ...s, ...firstDownAt(spot) }, event: 'firstDown' };
  if (s.down === 4) return next({ ...s, ...firstDownAt(NEW_DRIVE_X), oppStartX: spot }, 'turnoverOnDowns');
  return { state: { ...s, ballX: spot, down: (s.down + 1) as GameState['down'] }, event: null };
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

/** "3rd & 7", "1st & Goal". */
export function downText(s: GameState): string {
  const toGo = s.firstDownX >= OPP_GOAL_X ? 'Goal' : String(s.firstDownX - s.ballX);
  return `${ORDINAL[s.down]} & ${toGo}`;
}

/** "OWN 25", "50", "OPP 12". */
export function spotText(x: number): string {
  const fromOurGoal = Math.round(x - OWN_GOAL_X);
  if (fromOurGoal === 50) return '50';
  return fromOurGoal < 50 ? `OWN ${fromOurGoal}` : `OPP ${FIELD_LENGTH - fromOurGoal}`;
}
