import { describe, expect, it } from 'vitest';
import { NEW_DRIVE_X, OPP_GOAL_X, OWN_GOAL_X, TOUCHBACK_X, TRY_X, applyKick, applyPlay, downText, newGame, spotText, type GameState } from './drive';

const at = (ballX: number, down: GameState['down'], firstDownX: number, us = 0, them = 0, oppStartX: number | null = null): GameState => ({
  ballX,
  down,
  firstDownX,
  us,
  them,
  oppStartX,
  tryPending: false,
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

  it('a touchdown scores 6, then the try from their 2', () => {
    const { state, event } = applyPlay(at(90, 2, 100, 7, 3), { kind: 'touchdown' });
    expect(event).toBe('touchdown');
    expect(state).toEqual({ ...at(TRY_X, 1, OPP_GOAL_X, 13, 3), tryPending: true });
    expect(downText(state)).toBe('TRY');
    expect(spotText(state.ballX)).toBe('OPP 2');
  });

  const tryAt = (us = 6, them = 0): GameState => ({ ...at(TRY_X, 1, OPP_GOAL_X, us, them), tryPending: true });
  const nextDrive = (us: number, them: number) => at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10, us, them);

  it('2-point try: into the end zone = 2 points, then a new drive', () => {
    expect(applyPlay(tryAt(), { kind: 'touchdown' })).toEqual({ state: nextDrive(8, 0), event: 'twoPointGood' });
    expect(applyPlay(tryAt(), { kind: 'spot', x: OPP_GOAL_X }).event).toBe('twoPointGood');
  });

  it('2-point try: stopped short, incomplete or picked = no points, and only one play', () => {
    expect(applyPlay(tryAt(), { kind: 'spot', x: OPP_GOAL_X - 0.5 })).toEqual({ state: nextDrive(6, 0), event: 'twoPointFailed' });
    expect(applyPlay(tryAt(), { kind: 'incomplete' })).toEqual({ state: nextDrive(6, 0), event: 'twoPointFailed' });
    expect(applyPlay(tryAt(), { kind: 'interception', returnedTo: 80 }).state).toEqual(nextDrive(6, 0));
  });

  it('2-point try: a pick returned all the way gives the defense 2', () => {
    expect(applyPlay(tryAt(), { kind: 'pickSix' }).state).toEqual(nextDrive(6, 2));
    expect(applyPlay(tryAt(), { kind: 'interception', returnedTo: OWN_GOAL_X }).state).toEqual(nextDrive(6, 2));
  });

  it('extra point: good = 1, missed = 0, then a new drive', () => {
    expect(applyKick(tryAt(), 'extraPoint', true)).toEqual({ state: nextDrive(7, 0), event: 'extraPoint' });
    expect(applyKick(tryAt(), 'extraPoint', false)).toEqual({ state: nextDrive(6, 0), event: 'missedExtraPoint' });
  });

  it('field goal: good = 3 and the drive is over', () => {
    expect(applyKick(at(80, 4, 85, 7, 7), 'fieldGoal', true)).toEqual({ state: nextDrive(10, 7), event: 'fieldGoal' });
  });

  it('missed field goal: they take over at the kick spot, or their 20 if that is closer to their goal', () => {
    const far = applyKick(at(70, 4, 75), 'fieldGoal', false);
    expect(far.event).toBe('missedFieldGoal');
    expect(far.state).toEqual(at(NEW_DRIVE_X, 1, NEW_DRIVE_X + 10, 0, 0, 63));
    expect(applyKick(at(100, 4, 110), 'fieldGoal', false).state.oppStartX).toBe(TOUCHBACK_X);
  });

  it('being down at or past their goal line counts as a touchdown', () => {
    expect(applyPlay(at(100, 1, 110), { kind: 'spot', x: 110 }).event).toBe('touchdown');
  });

  it('brought down behind the line (sack or scramble) loses yards: next down, longer to go', () => {
    const { state, event } = applyPlay(at(40, 1, 50), { kind: 'spot', x: 34.6 });
    expect(event).toBe(null);
    expect(state.down).toBe(2);
    expect(state.ballX).toBe(35);
    expect(state.firstDownX).toBe(50); // now 2nd & 15
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
