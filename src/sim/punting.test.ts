import { describe, expect, it } from 'vitest';
import { OPP_GOAL_X, OWN_GOAL_X, TOUCHBACK_X, applyPunt, newGame } from './drive';
import { FIELD_WIDTH } from './field';
import { PUNTER_DEPTH, insideTwenty, puntPath, resolvePunt, type PuntRules } from './punting';

const rules: PuntRules = {
  green: 0.5,
  sweepTime: 0.85,
  centreYards: 50,
  edgeYards: 38,
  spreadYards: 6,
  shankMaxYards: 30,
  shankMinYards: 20,
  shankSliceYards: 22,
  rollYards: 5,
  shankRollYards: 2,
};
const mid = FIELD_WIDTH / 2;
/** Punter's spot for a line of scrimmage `yardsFromOurGoal` from our goal line. */
const punter = (yardsFromOurGoal: number) => ({ x: OWN_GOAL_X + yardsFromOurGoal - PUNTER_DEPTH, y: mid });

describe('punting: the tap', () => {
  it('centre tap = longest, straight; edge of the green = shorter, drifts to that side', () => {
    expect(resolvePunt(0, rules)).toEqual({ shank: false, air: 50, drift: 0, roll: 5 });
    const edge = resolvePunt(0.5, rules);
    expect(edge.shank).toBe(false);
    expect(edge.air).toBeCloseTo(38);
    expect(edge.drift).toBeCloseTo(6); // right = bottom of the screen
    expect(resolvePunt(-0.25, rules).air).toBeCloseTo(44);
    expect(resolvePunt(-0.25, rules).drift).toBeCloseTo(-3);
  });

  it('red = SHANK: 20-30 yd, slicing hard toward that side', () => {
    const justOut = resolvePunt(0.51, rules);
    expect(justOut.shank).toBe(true);
    expect(justOut.air).toBeCloseTo(30, 0);
    expect(justOut.drift).toBeCloseTo(11, 0);
    const worst = resolvePunt(-1, rules);
    expect(worst).toEqual({ shank: true, air: 20, drift: -22, roll: 2 });
  });
});

describe('punting: where it ends up', () => {
  it('from our 30: a centred punt rolls to a stop around their 30', () => {
    const p = puntPath(punter(30), resolvePunt(0, rules));
    expect(p.result).toBe('downed');
    expect(p.land.x).toBeCloseTo(OWN_GOAL_X + 65);
    expect(p.spotX).toBe(OWN_GOAL_X + 70); // their 30
    expect(insideTwenty(p)).toBe(false);
  });

  it('lands in their end zone = touchback at their 20', () => {
    const p = puntPath(punter(70), resolvePunt(0, rules)); // lands at their -5
    expect(p.result).toBe('touchback');
    expect(p.spotX).toBe(TOUCHBACK_X);
    expect(insideTwenty(p)).toBe(false);
  });

  it('rolls into the end zone = touchback, ball stops just over the goal line', () => {
    const p = puntPath(punter(62), resolvePunt(0, rules)); // lands at their 3, rolls 5
    expect(p.result).toBe('touchback');
    expect(p.spotX).toBe(TOUCHBACK_X);
    expect(p.stop.x).toBeGreaterThanOrEqual(OPP_GOAL_X);
    expect(p.stop.x).toBeLessThan(OPP_GOAL_X + 1);
  });

  it('stops inside their 20 = pinned', () => {
    const p = puntPath(punter(50), resolvePunt(0, rules)); // lands at their 15, rolls to their 10
    expect(p.result).toBe('downed');
    expect(p.spotX).toBe(OPP_GOAL_X - 10);
    expect(insideTwenty(p)).toBe(true);
  });

  it('over a sideline: their ball where it went out', () => {
    const from = { x: OWN_GOAL_X + 15, y: 5 }; // punter near the top sideline
    const p = puntPath(from, { shank: true, air: 20, drift: -20, roll: 2 });
    expect(p.result).toBe('outOfBounds');
    expect(p.land.y).toBeCloseTo(0);
    expect(p.land.x).toBeCloseTo(from.x + 5); // crossed a quarter of the way along
    expect(p.spotX).toBe(OWN_GOAL_X + 20);
  });

  it('rolling over a sideline: out where it rolled out', () => {
    const from = { x: OWN_GOAL_X + 20, y: FIELD_WIDTH - 10 };
    const p = puntPath(from, { shank: false, air: 40, drift: 9, roll: 5 }); // lands 1 yd from the sideline
    expect(p.result).toBe('outOfBounds');
    expect(p.stop.y).toBeCloseTo(FIELD_WIDTH);
    expect(p.stop.x).toBeLessThan(p.land.x + 5);
  });

  it('a punt deep in our own end still spots the ball in the field of play', () => {
    const p = puntPath({ x: 1, y: mid }, resolvePunt(-1, rules));
    expect(p.spotX).toBeGreaterThan(OWN_GOAL_X);
  });

  it('drive rules: they take over at the spot, our next drive restarts at our 25', () => {
    const s = { ...newGame(), down: 4 as const, ballX: 40 };
    const { state, event } = applyPunt(s, 85);
    expect(event).toBe('punt');
    expect(state.oppStartX).toBe(85);
    expect(state.down).toBe(1);
    expect(state.ballX).toBe(OWN_GOAL_X + 25);
  });
});
