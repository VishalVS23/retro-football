import { describe, expect, it } from 'vitest';
import { feel as base, type Feel } from '../config/feel';
import { OPP_GOAL_X, OWN_GOAL_X, applyMuffedPunt, applyPuntReturnTD, newGame } from './drive';
import { decide, simulatePunt, startPuntPlay, stepPuntPlay, type PuntEnd } from './puntReturn';

const LOS = OWN_GOAL_X + 30; // punting from our 30

/** Many punts with taps spread across the green. */
function punts(feel: Feel, n = 400, los = LOS): PuntEnd[] {
  return Array.from({ length: n }, (_, i) => {
    const m = ((i % 50) / 49) * feel.punting.green * (i % 2 ? 1 : -1);
    return simulatePunt(feel, 500 + i, los, m);
  });
}

const returns = (ends: PuntEnd[]) => ends.flatMap((e) => (e.kind === 'return' ? [e.yards] : []));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('punt returns: balance', () => {
  const ends = punts(base);
  const rets = returns(ends);

  it('a good share of punts are fair caught, most of the rest are returned', () => {
    const fair = ends.filter((e) => e.kind === 'fairCatch').length / ends.length;
    expect(fair).toBeGreaterThan(0.15);
    expect(fair).toBeLessThan(0.5);
    expect(rets.length / ends.length).toBeGreaterThan(0.4);
  });

  it('returns average a handful of yards, a big one now and then, a touchdown very rarely', () => {
    expect(avg(rets)).toBeGreaterThan(6);
    expect(avg(rets)).toBeLessThan(13);
    const big = rets.filter((y) => y >= 15).length / rets.length;
    expect(big).toBeGreaterThan(0.01);
    expect(big).toBeLessThan(0.15);
    expect(ends.filter((e) => e.kind === 'returnTD').length / ends.length).toBeLessThanOrEqual(0.02);
  });

  it('muffs are rare', () => {
    const muffs = ends.filter((e) => e.kind === 'muff').length / ends.length;
    expect(muffs).toBeGreaterThan(0);
    expect(muffs).toBeLessThan(0.05);
  });

  it('a well-hit punt still flips the field (30+ yd net from the line of scrimmage)', () => {
    const good = Array.from({ length: 200 }, (_, i) => simulatePunt(base, 900 + i, LOS, 0));
    const net = avg(good.map((e) => (e.kind === 'returnTD' ? -(LOS - OWN_GOAL_X) : e.spotX - LOS)));
    expect(net).toBeGreaterThan(30);
  });

  it('their blockers matter: no blocking = shorter returns', () => {
    const noBlock = structuredClone(base) as Feel;
    noBlock.puntReturn.blockChance = 0;
    expect(avg(returns(punts(noBlock)))).toBeLessThan(avg(rets));
  });

  it('same seed, same punt (seeded randomness)', () => {
    expect(simulatePunt(base, 42, LOS, 0.1)).toEqual(simulatePunt(base, 42, LOS, 0.1));
  });
});

describe('punt returns: what the returner does', () => {
  const always = () => 0; // every chance roll succeeds
  const never = () => 0.999;

  it('a punt landing inside his 10 is left to bounce', () => {
    const s = startPuntPlay(OPP_GOAL_X - 50, 0, base, never); // centred punt from their 50 lands near their 5
    expect(s.path.land.x).toBeGreaterThan(OPP_GOAL_X - base.puntReturn.letBounceYards);
    expect(decide({ ...s, returner: { ...s.path.land } }, base, never)).toBe('bounce');
  });

  it("a shank he can't get to just bounces", () => {
    const s = startPuntPlay(LOS, -1, base, never);
    let play = s;
    while (play.phase === 'air') play = stepPuntPlay(play, 1 / 60, base, never).play;
    expect(play.decision).toBe('bounce');
    expect(play.end ?? null).toBeNull(); // still rolling
  });

  it('coverage right on him = fair catch; far away = he returns it', () => {
    const s = startPuntPlay(LOS, 0, base, never);
    const at = { ...s.path.land };
    const near = { ...s, returner: at, coverage: s.coverage.map((c) => ({ ...c, pos: { x: at.x - 5, y: at.y } })) };
    expect(decide(near, base, never)).toBe('fairCatch');
    const far = { ...s, returner: at, coverage: s.coverage.map((c) => ({ ...c, pos: { x: at.x - 30, y: at.y } })) };
    expect(decide(far, base, never)).toBe('return');
    expect(decide(far, base, always)).toBe('muff'); // the muff roll comes after the fair-catch check
  });

  it('drive rules: muff = our ball at the spot; return TD = 6 to them', () => {
    const s = { ...newGame(), down: 4 as const, ballX: LOS };
    const m = applyMuffedPunt(s, 75);
    expect(m.event).toBe('muffedPunt');
    expect(m.state).toMatchObject({ ballX: 75, down: 1, firstDownX: 85, oppStartX: null });
    const td = applyPuntReturnTD(s);
    expect(td.event).toBe('puntReturnTD');
    expect(td.state.them).toBe(6);
    expect(td.state.ballX).toBe(OWN_GOAL_X + 25);
  });
});
