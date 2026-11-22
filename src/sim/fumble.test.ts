import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { createRng } from './rng';
import { fumbleChance, keepChance, rollFumble, rollRecovery } from './fumble';
import { applyFumble, applyTakeaway, KICKOFF_X, NEW_DRIVE_X, OPP_GOAL_X, OWN_GOAL_X, SAFETY_KICK_X, type GameState } from './drive';

const p = feel.fumble;

const at = (ballX: number, down: GameState['down'], firstDownX: number, tryPending = false): GameState => ({
  ballX,
  down,
  firstDownX,
  us: 7,
  them: 3,
  oppStartX: null,
  tryPending,
});

describe('fumble chance', () => {
  it('a normal tackle is the lowest, a big hit higher, a strip sack highest', () => {
    const normal = fumbleChance({ tacklerSpeed: 5.5 }, p);
    const big = fumbleChance({ tacklerSpeed: 7.9 }, p);
    const sack = fumbleChance({ sack: true, tacklerSpeed: 5.5 }, p);
    expect(normal).toBe(p.chance);
    expect(big).toBe(p.bigHitChance);
    expect(sack).toBe(p.stripSackChance);
    expect(normal).toBeLessThan(big);
    expect(big).toBeLessThan(sack);
  });

  it('an unknown tackler counts as a normal hit', () => {
    expect(fumbleChance({}, p)).toBe(p.chance);
  });

  it('rolls come out near the set chance over many tackles', () => {
    const rng = createRng(11);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (rollFumble({ tacklerSpeed: 5 }, p, () => rng.next())) n++;
    expect(n / 20000).toBeGreaterThan(p.chance * 0.8);
    expect(n / 20000).toBeLessThan(p.chance * 1.2);
  });

  it('a zero chance never fumbles', () => {
    expect(rollFumble({ sack: true }, { ...p, stripSackChance: 0 }, () => 0)).toBe(false);
  });
});

describe('recovery', () => {
  const ball = { x: 50, y: 20 };
  it('an even pile (or nobody near) is 50/50', () => {
    expect(keepChance(ball, [], [], p)).toBe(0.5);
    expect(keepChance(ball, [{ x: 51, y: 20 }], [{ x: 49, y: 20 }], p)).toBe(0.5);
  });

  it('more of your players near the ball = better odds; far-away players do not count', () => {
    const near = [{ x: 51, y: 20 }, { x: 50, y: 22 }, { x: 48, y: 19 }];
    const far = [{ x: 80, y: 20 }, { x: 80, y: 30 }, { x: 10, y: 5 }];
    expect(keepChance(ball, near, [{ x: 50, y: 21 }], p)).toBeGreaterThan(0.6);
    expect(keepChance(ball, [{ x: 50, y: 21 }], near, p)).toBeLessThan(0.4);
    expect(keepChance(ball, far, [], p)).toBe(0.5);
  });

  it('the roll follows the odds', () => {
    const rng = createRng(3);
    const near = [{ x: 51, y: 20 }, { x: 50, y: 22 }, { x: 48, y: 19 }];
    let kept = 0;
    for (let i = 0; i < 5000; i++) if (rollRecovery(ball, near, [{ x: 50, y: 21 }], p, () => rng.next())) kept++;
    const want = keepChance(ball, near, [{ x: 50, y: 21 }], p);
    expect(Math.abs(kept / 5000 - want)).toBeLessThan(0.03);
  });
});

describe('fumble rules (drive.ts)', () => {
  it('we fall on it: counts like a tackle at the spot', () => {
    const r = applyFumble(at(40, 2, 50), 44, true);
    expect(r.event).toBeNull();
    expect(r.state).toMatchObject({ ballX: 44, down: 3, firstDownX: 50, oppStartX: null });
  });

  it('we fall on it past the sticks: first down; on 4th short of them: turnover on downs', () => {
    expect(applyFumble(at(40, 2, 50), 52, true).event).toBe('firstDown');
    const r = applyFumble(at(40, 4, 50), 45, true);
    expect(r.event).toBe('turnoverOnDowns');
    expect(r.state.oppStartX).toBe(45);
  });

  it('we fall on it in our own end zone: safety', () => {
    const r = applyFumble(at(12, 1, 22), 8, true);
    expect(r.event).toBe('safety');
    expect(r.state.them).toBe(5);
    expect(r.state.oppStartX).toBe(SAFETY_KICK_X);
  });

  it('they fall on it: their ball at the spot', () => {
    const r = applyFumble(at(40, 1, 50), 46.4, false);
    expect(r.event).toBe('fumbleLost');
    expect(r.state.oppStartX).toBe(46);
    expect(r.state).toMatchObject({ us: 7, them: 3, ballX: NEW_DRIVE_X });
  });

  it('they fall on it in our end zone: touchdown for them, our ball next', () => {
    const r = applyFumble(at(12, 1, 22), OWN_GOAL_X - 1, false);
    expect(r.event).toBe('fumbleTD');
    expect(r.state.them).toBe(9);
    expect(r.state.oppStartX).toBeNull();
  });

  it('a fumble on the 2-point try is no good either way', () => {
    for (const ours of [true, false]) {
      const r = applyFumble(at(OPP_GOAL_X - 2, 1, OPP_GOAL_X, true), OPP_GOAL_X - 3, ours);
      expect(r.event).toBe('twoPointFailed');
      expect(r.state).toMatchObject({ us: 7, them: 3, tryPending: false, oppStartX: KICKOFF_X });
    }
  });

  it('their returner fumbles and we recover: our ball, 1st & 10 there', () => {
    const r = applyTakeaway({ ...at(30, 3, 35), oppStartX: 60 }, 60.6);
    expect(r.event).toBe('takeaway');
    expect(r.state).toMatchObject({ ballX: 61, down: 1, firstDownX: 71, oppStartX: null });
  });

  it('their returner fumbles in his own end zone and we recover: touchdown', () => {
    const r = applyTakeaway(at(30, 3, 35), OPP_GOAL_X + 3);
    expect(r.event).toBe('touchdown');
    expect(r.state.us).toBe(13);
    expect(r.state.tryPending).toBe(true);
  });
});
