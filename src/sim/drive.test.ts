import { describe, expect, it } from 'vitest';
import { NEW_DRIVE_X, OPP_GOAL_X, OWN_GOAL_X, TOUCHBACK_X, applyPlay, downText, newGame, spotText, type GameState } from './drive';

const at = (ballX: number, down: GameState['down'], firstDownX: number, us = 0, them = 0, oppStartX: number | null = null): GameState => ({
  ballX,
  down,
  firstDownX,
  us,
  them,
  oppStartX,
});

describe('drive rules', () => {
  it('starts 1st & 10 at our 25, 0-0', () => {
    const g = newGame();
    expect(g).toEqual(at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10));
    expect(downText(g)).toBe('1st & 10');
    expect(spotText(g.ballX)).toBe('OWN 25');
  });

  it('a short gain is the next down with less to go', () => {
    const { state, event } = applyPlay(newGame(), { kind: 'spot', x: NEW_DRIVE_X + 3.4 });
    expect(event).toBeNull();
    expect(state.ballX).toBe(NEW_DRIVE_X + 3);
    expect(downText(state)).toBe('2nd & 7');
  });

  it('an incompletion keeps the spot and uses a down', () => {
    const { state } = applyPlay(at(50, 2, 55), { kind: 'incomplete' });
    expect(state).toEqual(at(50, 3, 55));
  });

  it('reaching the line is a first down with a fresh 10', () => {
    const { state, event } = applyPlay(at(50, 3, 55), { kind: 'spot', x: 57 });
    expect(event).toBe('firstDown');
    expect(state).toEqual(at(57, 1, 67));
  });

  it('a sack loses yards', () => {
    const { state } = applyPlay(at(50, 1, 60), { kind: 'spot', x: 44 });
    expect(downText(state)).toBe('2nd & 16');
  });

  it('failing on 4th down is a turnover on downs (new drive for now)', () => {
    const { state, event } = applyPlay(at(50, 4, 52), { kind: 'incomplete' });
    expect(event).toBe('turnoverOnDowns');
    expect(state).toEqual(at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10, 0, 0, 50)); // they'd take over at the spot
  });

  it('converting on 4th down keeps the drive going', () => {
    expect(applyPlay(at(50, 4, 52), { kind: 'spot', x: 53 }).event).toBe('firstDown');
  });

  it('inside their 10 it is "& Goal"', () => {
    const { state } = applyPlay(at(90, 1, 100), { kind: 'spot', x: 102 });
    expect(state.firstDownX).toBe(OPP_GOAL_X);
    expect(downText(state)).toBe('1st & Goal');
    expect(spotText(state.ballX)).toBe('OPP 8');
  });

  it('a touchdown scores 6 and starts a new drive', () => {
    const { state, event } = applyPlay(at(90, 2, 100, 7, 3), { kind: 'touchdown' });
    expect(event).toBe('touchdown');
    expect(state).toEqual(at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10, 13, 3));
  });

  it('being down at or past their goal line counts as a touchdown', () => {
    expect(applyPlay(at(100, 1, 110), { kind: 'spot', x: 110 }).event).toBe('touchdown');
  });

  it('down in our own end zone is a safety: 2 points to them', () => {
    const { state, event } = applyPlay(at(12, 2, 22), { kind: 'spot', x: 8 });
    expect(event).toBe('safety');
    expect(state.them).toBe(2);
    expect(state.ballX).toBe(NEW_DRIVE_X);
  });

  it('never spots the ball on a goal line', () => {
    expect(applyPlay(at(12, 1, 22), { kind: 'spot', x: 10.2 }).state.ballX).toBe(OWN_GOAL_X + 1);
    expect(applyPlay(at(100, 1, 110), { kind: 'spot', x: 109.8 }).state.ballX).toBe(OPP_GOAL_X - 1);
  });

  it('an interception ends the drive; they take over where the return ended', () => {
    const { state, event } = applyPlay(at(70, 3, 75, 6, 0), { kind: 'interception', returnedTo: 61.6 });
    expect(event).toBe('interception');
    expect(state).toEqual(at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10, 6, 0, 62));
  });

  it('a pick downed in their own end zone is a touchback at their 20', () => {
    expect(applyPlay(at(90, 1, 100), { kind: 'interception', returnedTo: 113 }).state.oppStartX).toBe(TOUCHBACK_X);
    expect(spotText(TOUCHBACK_X)).toBe('OPP 20');
  });

  it('a pick returned all the way is a pick six: 6 points to them', () => {
    const { state, event } = applyPlay(at(50, 2, 60, 7, 3), { kind: 'interception', returnedTo: OWN_GOAL_X });
    expect(event).toBe('pickSix');
    expect(state).toEqual(at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10, 7, 9));
  });

  it('names field spots like a broadcast', () => {
    expect(spotText(OWN_GOAL_X + 1)).toBe('OWN 1');
    expect(spotText(60)).toBe('50');
    expect(spotText(OPP_GOAL_X - 1)).toBe('OPP 1');
  });
});
