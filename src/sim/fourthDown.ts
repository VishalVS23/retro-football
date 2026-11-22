/**
 * The coach's 4th-down tip on the play calling screen: go for it, punt or kick a field goal.
 * Simple rules of thumb from yards to go, field position, score and time left. Advice only:
 * the player always chooses. Pure rules, no Phaser.
 */
import { downText, OPP_GOAL_X, OWN_GOAL_X, spotText, type GameState } from './drive';

export type FourthChoice = 'go' | 'punt' | 'fieldGoal';

export interface FourthDownSituation {
  match: GameState;
  quarter: number;
  /** Game seconds left in the quarter. */
  timeLeft: number;
  /** A field goal is in range from here. */
  fgRange: boolean;
  /** College overtime: no punting; kick when 3 points tie or win, unless it's short yardage. */
  overtime?: boolean;
}

/** Last snap(s) of the half: this many seconds or fewer left in Q2. */
const END_OF_HALF_SECONDS = 15;
/** "Late": this many seconds or fewer left in Q4 (quarters are only 2 minutes). */
const LATE_SECONDS = 60;
/** Trailing by this much or less, a field goal ties or wins it. */
const FIELD_GOAL_MARGIN = 3;

const PHRASE: Record<FourthChoice, string> = { go: 'go for it', punt: 'punt it away', fieldGoal: 'kick the field goal' };

function clock(t: number): string {
  const s = Math.ceil(t - 1e-9);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The tip on 4th down (null on other downs and on a try), e.g. "4th & 1 at OPP 38: go for it". */
export function coachTip(sit: FourthDownSituation): { choice: FourthChoice; text: string } | null {
  const { match: m, quarter, timeLeft, fgRange } = sit;
  if (m.down !== 4 || m.tryPending) return null;
  const toGo = m.firstDownX - m.ballX;
  const toGoal = OPP_GOAL_X - m.ballX;
  const where = `${downText(m)} at ${spotText(m.ballX)}`;
  const tip = (choice: FourthChoice, lead = where) => ({ choice, text: `${lead}: ${PHRASE[choice]}` });

  if (sit.overtime) {
    const margin = m.us - m.them;
    const lead = `OT, ${margin < 0 ? `down ${-margin}` : margin > 0 ? `up ${margin}` : 'tied'}`;
    // Behind: a field goal only if it ties. Tied (going first): kick unless it's 4th & short.
    const kick = fgRange && margin >= -FIELD_GOAL_MARGIN && (margin < 0 || toGo > 2);
    return tip(kick ? 'fieldGoal' : 'go', lead);
  }

  if (quarter === 2 && timeLeft <= END_OF_HALF_SECONDS) {
    return tip(fgRange ? 'fieldGoal' : 'go', `${clock(timeLeft)} left in the half`);
  }
  if (quarter === 4 && timeLeft <= LATE_SECONDS) {
    const margin = m.us - m.them;
    const lead = `${margin < 0 ? `Down ${-margin}` : margin > 0 ? `Up ${margin}` : 'Tied'} with ${clock(timeLeft)} left`;
    if (margin < 0) return tip(-margin <= FIELD_GOAL_MARGIN && fgRange ? 'fieldGoal' : 'go', lead);
    return tip(fgRange ? 'fieldGoal' : 'punt', lead);
  }
  if (toGo <= 2 && toGoal <= 40) return tip('go'); // short yardage in their territory
  if (toGo <= 1 && m.ballX >= OWN_GOAL_X + 35) return tip('go'); // 4th & inches from our 35 on
  if (fgRange) return tip('fieldGoal');
  if (toGoal <= 45 && toGo <= 4) return tip('go'); // too far to kick, too close to punt
  return tip('punt');
}
