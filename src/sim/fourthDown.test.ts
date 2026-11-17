import { describe, expect, it } from 'vitest';
import { OPP_GOAL_X, OWN_GOAL_X, newGame, type GameState } from './drive';
import { coachTip } from './fourthDown';

/** 4th & `toGo` with the ball `fromOurGoal` yards from our goal line. */
function fourth(fromOurGoal: number, toGo: number, extra: Partial<GameState> = {}): GameState {
  const ballX = OWN_GOAL_X + fromOurGoal;
  return { ...newGame(), ballX, down: 4, firstDownX: Math.min(ballX + toGo, OPP_GOAL_X), ...extra };
}
const tip = (match: GameState, fgRange: boolean, quarter = 1, timeLeft = 90) => coachTip({ match, quarter, timeLeft, fgRange });

describe('coach tip on 4th down', () => {
  it('only on 4th down, never on a try', () => {
    expect(tip({ ...fourth(50, 5), down: 3 }, false)).toBeNull();
    expect(tip({ ...fourth(98, 2), tryPending: true }, true)).toBeNull();
  });

  it('short yardage in their territory: go for it', () => {
    expect(tip(fourth(62, 1), true)).toEqual({ choice: 'go', text: '4th & 1 at OPP 38: go for it' });
    expect(tip(fourth(98, 2), true)?.choice).toBe('go'); // 4th & goal at the 2
  });

  it('in field goal range and not short: kick it', () => {
    expect(tip(fourth(75, 6), true)).toEqual({ choice: 'fieldGoal', text: '4th & 6 at OPP 25: kick the field goal' });
  });

  it('deep in our own end: punt, even on 4th & 1 inside our 35', () => {
    expect(tip(fourth(20, 8), false)).toEqual({ choice: 'punt', text: '4th & 8 at OWN 20: punt it away' });
    expect(tip(fourth(25, 1), false)?.choice).toBe('punt');
    expect(tip(fourth(40, 1), false)?.choice).toBe('go'); // 4th & inches from our 40
  });

  it('no man’s land (too far to kick, too close to punt): go on short-ish yardage', () => {
    expect(tip(fourth(58, 4), false)?.choice).toBe('go');
    expect(tip(fourth(58, 9), false)?.choice).toBe('punt');
  });

  it('late in Q4 and behind: go for it unless a field goal ties or wins', () => {
    expect(tip(fourth(30, 9, { us: 7, them: 13 }), false, 4, 40)).toEqual({ choice: 'go', text: 'Down 6 with 0:40 left: go for it' });
    expect(tip(fourth(70, 9, { us: 10, them: 13 }), true, 4, 40)?.choice).toBe('fieldGoal');
    expect(tip(fourth(70, 9, { us: 7, them: 13 }), true, 4, 40)?.choice).toBe('go');
  });

  it('late in Q4 and ahead: kick if in range, otherwise punt', () => {
    expect(tip(fourth(30, 2, { us: 14, them: 10 }), false, 4, 50)).toEqual({ choice: 'punt', text: 'Up 4 with 0:50 left: punt it away' });
    expect(tip(fourth(75, 2, { us: 14, them: 10 }), true, 4, 50)?.choice).toBe('fieldGoal');
  });

  it('end of the half: kick if in range, otherwise go for it', () => {
    expect(tip(fourth(70, 8), true, 2, 6)).toEqual({ choice: 'fieldGoal', text: '0:06 left in the half: kick the field goal' });
    expect(tip(fourth(30, 8), false, 2, 6)?.choice).toBe('go');
  });
});
