import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { createRng } from './rng';
import { applyKick, applyPlay, OPP_GOAL_X, TRY_X, type GameState } from './drive';
import { afterBothPossessions, OT_START_X, overtimeBanner, overtimeStart, possessionOver } from './overtime';
import { beforeSnap, callTimeout, canCallTimeout, clockText, endPlay, newClock, runOff, tickPlay } from './clock';
import { coachTip } from './fourthDown';
import { simulateOppDrive } from './oppDrive';

const tied: GameState = { ballX: 50, down: 2, firstDownX: 55, us: 17, them: 17, oppStartX: null, tryPending: false };

describe('overtime possessions', () => {
  it('periods 1-2 start 1st & 10 at their 25; from the 3rd it is a 2-point try', () => {
    expect(overtimeStart(tied, 1)).toMatchObject({ ballX: OT_START_X, down: 1, firstDownX: OT_START_X + 10, tryPending: false, us: 17, them: 17 });
    expect(overtimeStart(tied, 2).ballX).toBe(OPP_GOAL_X - 25);
    expect(overtimeStart(tied, 3)).toMatchObject({ ballX: TRY_X, tryPending: true });
  });

  it('our possession goes on through downs and first downs, and ends on a score, a kick or a turnover', () => {
    const s = overtimeStart(tied, 1);
    const gain = applyPlay(s, { kind: 'spot', x: s.ballX + 4 });
    expect(possessionOver(gain.event, gain.state)).toBe(false);
    const first = applyPlay(s, { kind: 'spot', x: s.ballX + 12 });
    expect(possessionOver(first.event, first.state)).toBe(false);
    const td = applyPlay(s, { kind: 'touchdown' });
    expect(possessionOver(td.event, td.state)).toBe(false); // the try is still to come
    const xp = applyKick(td.state, 'extraPoint', true);
    expect(possessionOver(xp.event, xp.state)).toBe(true);
    const fg = applyKick(s, 'fieldGoal', false);
    expect(possessionOver(fg.event, fg.state)).toBe(true);
    const pick = applyPlay(s, { kind: 'interception', returnedTo: 70 });
    expect(possessionOver(pick.event, pick.state)).toBe(true);
    const downs = applyPlay({ ...s, down: 4 }, { kind: 'incomplete' });
    expect(possessionOver(downs.event, downs.state)).toBe(true);
  });

  it('a shootout try ends the possession either way', () => {
    const s = overtimeStart(tied, 3);
    const good = applyPlay(s, { kind: 'touchdown' });
    expect(good.event).toBe('twoPointGood');
    expect(possessionOver(good.event, good.state)).toBe(true);
  });

  it('banners and who wins', () => {
    expect(overtimeBanner(1)).toBe('OVERTIME');
    expect(overtimeBanner(2)).toBe('2ND OVERTIME');
    expect(overtimeBanner(3)).toBe('3RD OT: 2-PT SHOOTOUT');
    expect(overtimeBanner(5)).toBe('5TH OT: 2-PT SHOOTOUT');
    expect(afterBothPossessions(tied)).toBe('next');
    expect(afterBothPossessions({ ...tied, us: 20 })).toBe('over');
  });
});

describe('overtime clock (untimed)', () => {
  const r = feel.clock;
  const ot = { ...newClock(r), quarter: 4 as const, timeLeft: 0, ot: 1 };
  it('nothing moves the clock, no timeouts, no quarter breaks', () => {
    expect(tickPlay(ot, 5).timeLeft).toBe(0);
    expect(endPlay({ ...ot, running: true }, false, r)).toEqual({ clock: { ...ot, running: false }, event: null });
    expect(beforeSnap({ ...ot, running: true }, r)).toMatchObject({ snap: true, event: null });
    expect(runOff(ot, 60, r).event).toBeNull();
    expect(canCallTimeout({ ...ot, running: true })).toBe(false);
    expect(callTimeout({ ...ot, running: true }).timeouts).toBe(ot.timeouts);
  });
  it('shows OT / 2OT', () => {
    expect(clockText(ot)).toBe('OT');
    expect(clockText({ ...ot, ot: 2 })).toBe('2OT');
  });
});

describe('overtime 4th downs (coach tip)', () => {
  const at = (toGo: number, us: number, them: number, fgRange = true) =>
    coachTip({ match: { ...tied, down: 4, ballX: 90, firstDownX: 90 + toGo, us, them }, quarter: 4, timeLeft: 0, fgRange, overtime: true })!.choice;
  it('never punts: kick when 3 ties or wins, otherwise go', () => {
    expect(at(6, 17, 17)).toBe('fieldGoal'); // going first, tied, 4th & long: take the points
    expect(at(1, 17, 17)).toBe('go'); // 4th & 1 going first: go for it
    expect(at(1, 17, 20)).toBe('fieldGoal'); // down 3: kick to tie
    expect(at(6, 17, 24)).toBe('go'); // down 7: must go
    expect(at(6, 17, 17, false)).toBe('go'); // out of range
  });
});

describe('CPU overtime drives', () => {
  const sit = (us: number, them: number) => ({ quarter: 5, timeLeft: 1e6, quarterLength: 120, us, them, overtime: true });
  const run = (us: number, them: number, n = 1500) => {
    const rng = createRng(9);
    return Array.from({ length: n }, () => simulateOppDrive(35, sit(us, them), feel.oppDrive, rng));
  };
  it('never punt and never run out of time', () => {
    for (const d of run(17, 17)) {
      expect(d.result).not.toBe('punt');
      expect(d.result).not.toBe('endOfHalf');
    }
  });
  it('after our touchdown + XP they kick the XP to tie; after our 8 they go for 2; tied they need no try', () => {
    const vs7 = run(24, 17).filter((d) => d.result === 'touchdown');
    expect(vs7.length).toBeGreaterThan(0);
    for (const d of vs7) {
      expect(d.tryKind).toBe('extraPoint');
      expect(d.points).toBe(d.extraPointGood ? 7 : 6);
    }
    const vs8 = run(25, 17).filter((d) => d.result === 'touchdown');
    for (const d of vs8) {
      expect(d.tryKind).toBe('twoPoint');
      expect(d.points).toBe(d.extraPointGood ? 8 : 6);
    }
    for (const d of run(17, 17).filter((x) => x.result === 'touchdown')) {
      expect(d.points).toBe(6);
      expect(d.extraPointGood).toBeNull();
    }
  });
  it('down 7 they never settle for a field goal', () => {
    expect(run(24, 17).filter((d) => d.result === 'fieldGoal' || d.result === 'missedFieldGoal')).toHaveLength(0);
  });
});
