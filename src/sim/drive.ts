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
export const FIELD_GOAL_POINTS = 3;
export const EXTRA_POINT_POINTS = 1;
export const TWO_POINT_POINTS = 2;
/** After a touchdown the try (extra point or 2-point play) is snapped from their 2. */
export const TRY_X = OPP_GOAL_X - 2;
/** The holder kneels this far behind the line of scrimmage on a kick. */
export const HOLD_YARDS = 7;
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
  /** We just scored a touchdown: the next snap is the try (kick the extra point or go for 2). */
  tryPending: boolean;
}

/** How a play ended, as far as the rules care. */
export type PlayOutcome =
  | { kind: 'spot'; x: number } // ball carrier down / out of bounds / sacked at this x
  | { kind: 'incomplete' }
  | { kind: 'touchdown' }
  | { kind: 'interception'; returnedTo: number } // picked off and returned to this x
  | { kind: 'pickSix' }; // picked off and returned for a touchdown

/** Something worth a banner. null = just the next down. */
export type DriveEvent =
  | 'firstDown'
  | 'turnoverOnDowns'
  | 'touchdown'
  | 'safety'
  | 'interception'
  | 'pickSix'
  | 'twoPointGood'
  | 'twoPointFailed'
  | 'fieldGoal'
  | 'missedFieldGoal'
  | 'extraPoint'
  | 'missedExtraPoint'
  | null;

export function newGame(): GameState {
  return { ...firstDownAt(NEW_DRIVE_X), us: 0, them: 0, oppStartX: null, tryPending: false };
}

function firstDownAt(ballX: number): Pick<GameState, 'ballX' | 'down' | 'firstDownX'> {
  return { ballX, down: 1, firstDownX: Math.min(ballX + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X) };
}

/** Applies one play's result and says what happened. */
export function applyPlay(s: GameState, o: PlayOutcome): { state: GameState; event: DriveEvent } {
  const next = (state: GameState, event: DriveEvent) => ({ state, event });
  if (s.tryPending) return applyTryPlay(s, o);
  if (o.kind === 'touchdown') {
    // 6 points, then the try from their 2.
    const tryState: GameState = { ...s, ballX: TRY_X, down: 1, firstDownX: OPP_GOAL_X, us: s.us + TD_POINTS, oppStartX: null, tryPending: true };
    return next(tryState, 'touchdown');
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

/** A 2-point try run as a play: into the end zone = 2 points; anything else and it's over. */
function applyTryPlay(s: GameState, o: PlayOutcome): { state: GameState; event: DriveEvent } {
  const after: GameState = { ...s, ...firstDownAt(NEW_DRIVE_X), oppStartX: null, tryPending: false };
  const scored = o.kind === 'touchdown' || (o.kind === 'spot' && o.x >= OPP_GOAL_X);
  if (scored) return { state: { ...after, us: s.us + TWO_POINT_POINTS }, event: 'twoPointGood' };
  // Picked off and returned all the way: the defense scores 2.
  const defenseScores = o.kind === 'pickSix' || (o.kind === 'interception' && o.returnedTo <= OWN_GOAL_X);
  return { state: { ...after, them: s.them + (defenseScores ? TWO_POINT_POINTS : 0) }, event: 'twoPointFailed' };
}

/**
 * A field goal or extra point. Made: points, and the drive is over. A missed field goal gives
 * them the ball at the spot of the kick (or their 20 if that's further from their goal).
 * Until kickoffs and opponent drives exist, our next drive starts at our 25 either way.
 */
export function applyKick(s: GameState, kind: 'fieldGoal' | 'extraPoint', good: boolean): { state: GameState; event: DriveEvent } {
  const after: GameState = { ...s, ...firstDownAt(NEW_DRIVE_X), oppStartX: null, tryPending: false };
  if (kind === 'extraPoint') {
    return good
      ? { state: { ...after, us: s.us + EXTRA_POINT_POINTS }, event: 'extraPoint' }
      : { state: after, event: 'missedExtraPoint' };
  }
  if (good) return { state: { ...after, us: s.us + FIELD_GOAL_POINTS }, event: 'fieldGoal' };
  return { state: { ...after, oppStartX: Math.min(s.ballX - HOLD_YARDS, TOUCHBACK_X) }, event: 'missedFieldGoal' };
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

/** "3rd & 7", "1st & Goal". */
export function downText(s: GameState): string {
  if (s.tryPending) return 'TRY';
  const toGo = s.firstDownX >= OPP_GOAL_X ? 'Goal' : String(s.firstDownX - s.ballX);
  return `${ORDINAL[s.down]} & ${toGo}`;
}

/** "OWN 25", "50", "OPP 12". */
export function spotText(x: number): string {
  const fromOurGoal = Math.round(x - OWN_GOAL_X);
  if (fromOurGoal === 50) return '50';
  return fromOurGoal < 50 ? `OWN ${fromOurGoal}` : `OPP ${FIELD_LENGTH - fromOurGoal}`;
}

/** A fresh drive from our 25, score kept (second-half start until kickoffs exist). */
export function startDrive(s: GameState): GameState {
  return { ...s, ...firstDownAt(NEW_DRIVE_X), oppStartX: null, tryPending: false };
}
