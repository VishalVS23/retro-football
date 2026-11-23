import { describe, expect, it } from 'vitest';
import {
  ballBreakRatio,
  rollCornerSpeed,
  blockerSpot,
  closestIndex,
  isShielded,
  reachedQb,
  resolvePass,
  resolveTargetedPass,
  startCoverage,
  stepCoverage,
  stepRusher,
  stepSafety,
  type Coverage,
  type Rusher,
} from './defense';
import { PLAYS, ROUTES, routePath, runnerAfter, startRunner, stepRunner } from './routes';

const cover = {
  topSpeed: 7.6,
  acceleration: 16,
  reactionTime: 0.25,
  cushionYards: 5,
  cushionCloseTime: 1.5,
  ballReactionTime: 0.2,
  ballSpeedRatio: 0.6,
  bodyGapYards: 0.8,
};
const run = { topSpeed: 8, acceleration: 16, cutSpeedRatio: 0.55 };
const contest = {
  catchRadiusYards: 1.5,
  contestRadiusYards: 2.5,
  breakupChance: 0.6,
  interceptChance: 0.35,
  receiverCatchChance: 0.95,
  defenderCatchChance: 0.75,
  shieldedContestRatio: 0.5,
};
const rush = { blockedSpeed: 1, freeSpeed: 6, sackReachYards: 1.2 };
const dt = 1 / 60;

function simulateRoute(name: string, seconds: number) {
  const wrStart = { x: 34.5, y: 14.7 };
  const path = routePath(wrStart, ROUTES.find((r) => r.name === name)!, 1);
  let wr = startRunner(path);
  let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
  for (let t = 0; t < seconds; t += dt) {
    wr = stepRunner(wr, path, dt, run);
    cb = stepCoverage(cb, wr.pos, dt, cover);
  }
  return { wr: wr.pos, cb: cb.pos };
}

describe('coverage', () => {
  it('starts off the receiver and closes in on a go route', () => {
    const early = simulateRoute('Go', 0.3);
    const late = simulateRoute('Go', 2.5);
    expect(early.cb.x - early.wr.x).toBeGreaterThan(2);
    expect(Math.hypot(late.cb.x - late.wr.x, late.cb.y - late.wr.y)).toBeLessThan(3);
  });

  it('loses a step when the receiver cuts (slant opens up)', () => {
    const { wr, cb } = simulateRoute('Slant', 1.2);
    expect(Math.hypot(cb.x - wr.x, cb.y - wr.y)).toBeGreaterThan(1.5);
  });

  it('breaks on the ball after reacting to the throw', () => {
    let c = startCoverage({ x: 50, y: 20 }, { x: 45, y: 20 });
    const landing = { x: 50, y: 30 };
    for (let i = 0; i < 6; i++) c = stepCoverage(c, { x: 45, y: 20 }, dt, cover, { landing, sinceThrow: i * dt });
    const before = c.pos.y;
    for (let i = 6; i < 60; i++) c = stepCoverage(c, { x: 45, y: 20 }, dt, cover, { landing, sinceThrow: i * dt });
    expect(c.pos.y).toBeGreaterThan(before + 2);
  });
});

describe('balance', () => {
  it('a well-led slant thrown on time is usually caught', () => {
    const wrStart = { x: 34.5, y: 14.7 };
    const path = routePath(wrStart, ROUTES[0], 1);
    let wr = startRunner(path);
    let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
    for (let i = 0; i < 36; i++) {
      // throw at ~0.6s
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, cover);
    }
    const flight = 1.0;
    const landing = runnerAfter(wr, path, flight, run).pos; // perfectly led
    for (let i = 0; i < 60; i++) {
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, cover, { landing, sinceThrow: (i + 1) * dt });
    }
    // Count how many of 100 evenly spaced rolls are catches.
    let catches = 0;
    for (let k = 0; k < 100; k++) if (resolvePass(wr.pos, cb.pos, landing, (k + 0.5) / 100, contest) === 'catch') catches++;
    expect(catches).toBeGreaterThanOrEqual(60);
  });
});

describe('balance: deep balls (go route)', () => {
  /** A go route led perfectly, thrown `throwAt` s after the snap, vs a corner at `scale` of the cover speed. Catches out of 100. */
  function goCatches(scale: number, throwAt: number, flight: number) {
    const wrStart = { x: 34.5, y: 14.7 };
    const path = routePath(wrStart, ROUTES.find((r) => r.name === 'Go')!, 1);
    let wr = startRunner(path);
    let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart, scale);
    const c = { ...cover, topSpeed: run.topSpeed }; // scale 1 = exactly as fast as the receiver
    for (let t = 0; t < throwAt; t += dt) {
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, c);
    }
    const landing = runnerAfter(wr, path, flight, run).pos;
    for (let t = 0; t < flight; t += dt) {
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, c, { landing, sinceThrow: t + dt });
    }
    let n = 0;
    for (let k = 0; k < 100; k++) if (resolvePass(wr.pos, cb.pos, landing, (k + 0.5) / 100, contest, QB) === 'catch') n++;
    return n;
  }

  it('is a race: a slower corner loses it, an equal or faster one can contest it', () => {
    expect(goCatches(0.89, 1.0, 1.6)).toBeGreaterThanOrEqual(90);
    expect(goCatches(1.0, 1.0, 1.6)).toBeLessThan(80);
    expect(goCatches(1.05, 1.0, 1.6)).toBeLessThan(goCatches(1.0, 1.0, 1.6) + 1);
  });

  it('waiting lets even an equal corner fall behind', () => {
    expect(goCatches(1.0, 2.0, 1.6)).toBeGreaterThan(goCatches(1.0, 1.0, 1.6));
  });

  it('a corner keeps full speed breaking on a ball where he is already running, slows when he has to turn', () => {
    expect(ballBreakRatio({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 0.6)).toBeCloseTo(1);
    expect(ballBreakRatio({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, 0.6)).toBeCloseTo(0.6);
    expect(ballBreakRatio({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -10, y: 0 }, 0.6)).toBeCloseTo(0.6);
    expect(ballBreakRatio(null, { x: 0, y: 0 }, { x: 10, y: 0 }, 0.6)).toBeCloseTo(0.6);
  });

  it('corner speed per snap stays within the variance', () => {
    expect(rollCornerSpeed(1, 0.08, 0)).toBeCloseTo(0.92);
    expect(rollCornerSpeed(1, 0.08, 0.5)).toBeCloseTo(1);
    expect(rollCornerSpeed(1, 0.08, 0.999999)).toBeCloseTo(1.08);
  });
});

/** QB after his dropback, for a snap at the 35 (receivers line up at x 34.5). */
const QB = { x: 30, y: 26.7 };

describe('balance: stop routes', () => {
  /**
   * Throws `throwAt` seconds after the snap, aimed at the spot where the receiver plants,
   * and counts catches out of 100 evenly spaced rolls.
   */
  function stopRouteCatches(name: string, throwAt: number, flight: number, k = contest) {
    const wrStart = { x: 34.5, y: 14.7 };
    const def = ROUTES.find((r) => r.name === name)!;
    const path = routePath(wrStart, def, 1);
    let wr = startRunner(path, def.stop);
    let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
    for (let t = 0; t < throwAt - 1e-9; t += dt) {
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, cover);
    }
    const landing = path[path.length - 1];
    for (let t = 0; t < flight - 1e-9; t += dt) {
      wr = stepRunner(wr, path, dt, run);
      cb = stepCoverage(cb, wr.pos, dt, cover, { landing, sinceThrow: t + dt });
    }
    let catches = 0;
    for (let r = 0; r < 100; r++) if (resolvePass(wr.pos, cb.pos, landing, (r + 0.5) / 100, k, QB) === 'catch') catches++;
    return catches;
  }

  it('an on-time hitch is usually caught', () => {
    expect(stopRouteCatches('Hitch', 1.0, 0.7)).toBeGreaterThanOrEqual(65);
  });

  it('a curl is usually caught once he has turned back', () => {
    expect(stopRouteCatches('Curl', 2.2, 1.0)).toBeGreaterThanOrEqual(65);
  });

  it('a curl thrown far too early goes nowhere near him', () => {
    expect(stopRouteCatches('Curl', 0.8, 1.0)).toBeLessThan(20);
  });

  it('without body shielding the corner would smother stop routes (why the rule exists)', () => {
    expect(stopRouteCatches('Hitch', 1.0, 0.7, { ...contest, shieldedContestRatio: 1 })).toBeLessThan(stopRouteCatches('Hitch', 1.0, 0.7));
  });
});

describe('body shielding', () => {
  it('a defender behind the receiver (further from the QB) is shielded', () => {
    expect(isShielded({ x: 40, y: 20 }, { x: 41.5, y: 20 }, QB)).toBe(true);
    expect(isShielded({ x: 40, y: 20 }, { x: 38.5, y: 20 }, QB)).toBe(false);
  });

  it('a shielded defender breaks up fewer passes', () => {
    const landing = { x: 40, y: 20 };
    const wr = { x: 40, y: 20 };
    const behind = { x: 41, y: 20 };
    const count = (thrower?: { x: number; y: number }) => {
      let n = 0;
      for (let r = 0; r < 100; r++) if (resolvePass(wr, behind, landing, (r + 0.5) / 100, contest, thrower) === 'catch') n++;
      return n;
    };
    expect(count(QB)).toBeGreaterThan(count());
  });

  it("the corner can't run through the receiver when breaking on the ball", () => {
    let c = startCoverage({ x: 45, y: 20 }, { x: 40, y: 20 });
    const wr = { x: 40, y: 20 };
    for (let i = 0; i < 120; i++) c = stepCoverage(c, wr, dt, cover, { landing: wr, sinceThrow: 1 });
    expect(Math.hypot(c.pos.x - wr.x, c.pos.y - wr.y)).toBeCloseTo(0.8, 1);
    expect(c.pos.x).toBeGreaterThan(wr.x); // stayed on his own (downfield) side
  });
});

describe('corner momentum, anticipation and help defense', () => {
  const momentum = { ...cover, topSpeed: 7.8, turnAcceleration: 17, anticipation: 0.8, helpBallReactionTime: 0.5 };

  it('a sharp cut leaves a corner with momentum further behind than an instant-turn corner', () => {
    const gapAfter = (p: typeof cover) => {
      const wrStart = { x: 34.5, y: 14.7 };
      const def = ROUTES.find((r) => r.name === 'Out')!;
      const path = routePath(wrStart, def, 1);
      let wr = startRunner(path);
      let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
      for (let t = 0; t < 1.6; t += dt) {
        wr = stepRunner(wr, path, dt, run);
        cb = stepCoverage(cb, wr.pos, dt, p);
      }
      return Math.hypot(cb.pos.x - wr.pos.x, cb.pos.y - wr.pos.y);
    };
    expect(gapAfter(momentum)).toBeGreaterThan(gapAfter({ ...cover, topSpeed: 7.8 }) + 0.5);
  });

  it('anticipation keeps him tight on a straight route', () => {
    const gapOnGo = (anticipation: number) => {
      const wrStart = { x: 34.5, y: 14.7 };
      const path = routePath(wrStart, ROUTES.find((r) => r.name === 'Go')!, 1);
      let wr = startRunner(path);
      let cb: Coverage = startCoverage({ x: wrStart.x + 5, y: wrStart.y }, wrStart);
      for (let t = 0; t < 2.5; t += dt) {
        wr = stepRunner(wr, path, dt, run);
        cb = stepCoverage(cb, wr.pos, dt, { ...momentum, anticipation });
      }
      return Math.hypot(cb.pos.x - wr.pos.x, cb.pos.y - wr.pos.y);
    };
    expect(gapOnGo(0.8)).toBeLessThan(gapOnGo(0) - 0.5);
  });

  it("a help defender (the ball isn't for his man) breaks on it later", () => {
    const after = (help: boolean) => {
      let c = startCoverage({ x: 50, y: 20 }, { x: 45, y: 20 });
      for (let i = 0; i < 24; i++) c = stepCoverage(c, { x: 45, y: 20 }, dt, momentum, { landing: { x: 50, y: 30 }, sinceThrow: (i + 1) * dt, help });
      return c.pos.y;
    };
    expect(after(false)).toBeGreaterThan(after(true) + 0.3);
  });

  it('a help defender contests weaker; the deep safety (no man) contests fully', () => {
    const wrs = [{ x: 40, y: 20 }, { x: 40, y: 40 }];
    const landing = { x: 40, y: 20 };
    const k = { ...contest, helpContestRatio: 0.5 };
    const count = (defenders: { x: number; y: number }[]) => {
      let n = 0;
      for (let r = 0; r < 100; r++) if (resolveTargetedPass(wrs, defenders, landing, (r + 0.5) / 100, k).result === 'catch') n++;
      return n;
    };
    const near = { x: 40.5, y: 20.5 };
    const far = { x: 70, y: 0 };
    const own = count([near, far]); // receiver 0's own corner on him
    const help = count([far, near]); // receiver 1's corner passing through
    const safety = count([far, far, near]); // the safety
    expect(help).toBeGreaterThan(own);
    expect(safety).toBe(own);
  });

  it('his own man right on him makes the play, not a help defender a step closer (3h-b)', () => {
    const wrs = [{ x: 40, y: 20 }, { x: 40, y: 40 }];
    const landing = { x: 40, y: 20 };
    const k = { ...contest, helpContestRatio: 0.5 };
    const own = { x: 40.9, y: 20 }; // 0.9 yd: strength 0.64
    const help = { x: 40.5, y: 20.3 }; // ~0.58 yd, but at half strength: ~0.38
    expect(resolveTargetedPass(wrs, [own, help], landing, 0.5, k).defender).toBe(0);
    // His own man far off: the help defender is the one in the way.
    expect(resolveTargetedPass(wrs, [{ x: 45, y: 20 }, help], landing, 0.5, k).defender).toBe(1);
  });

  it('a linebacker in a zone (covering no one) contests fully, like the safety', () => {
    const wrs = [{ x: 40, y: 20 }, { x: 40, y: 40 }];
    const landing = { x: 40, y: 20 };
    const k = { ...contest, helpContestRatio: 0.5 };
    const near = { x: 40.5, y: 20.5 };
    const far = { x: 70, y: 0 };
    const count = (zone?: boolean[]) => {
      let n = 0;
      for (let r = 0; r < 100; r++) if (resolveTargetedPass(wrs, [far, near], landing, (r + 0.5) / 100, k, undefined, { zone }).result === 'catch') n++;
      return n;
    };
    expect(count([false, true])).toBeLessThan(count());
  });

  it('the safety stays deeper than the deepest receiver, then breaks on the ball after reading it', () => {
    const p = { baseX: 50, maxX: 119, cushionYards: 3, driftSpeed: 4, bailSpeed: 7, ballReactionTime: 0.25, ballSpeed: 5 };
    let s = { x: 50, y: 26.65 };
    for (let i = 0; i < 120; i++) s = stepSafety(s, [{ x: 60, y: 10 }, { x: 40, y: 30 }], dt, p);
    expect(s.x).toBeCloseTo(63, 0);
    const before = { ...s };
    s = stepSafety(s, [{ x: 60, y: 10 }], dt, p, { landing: { x: 63, y: 40 }, sinceThrow: 0.1 });
    const stillReading = { ...s };
    for (let i = 0; i < 30; i++) s = stepSafety(s, [{ x: 60, y: 10 }], dt, p, { landing: { x: 63, y: 40 }, sinceThrow: 0.3 + i * dt });
    expect(stillReading.y - before.y).toBeLessThan(0.1); // not yet breaking toward y 40
    expect(s.y).toBeGreaterThan(stillReading.y + 2);
  });
});

describe('pass rush', () => {
  it('blocked rushers crawl, free rushers fly', () => {
    const qb = { x: 30, y: 26 };
    let blocked: Rusher = { pos: { x: 36, y: 26 }, shedAt: 99 };
    let free: Rusher = { pos: { x: 36, y: 26 }, shedAt: 0 };
    for (let i = 0; i < 30; i++) {
      blocked = stepRusher(blocked, qb, i * dt, dt, rush);
      free = stepRusher(free, qb, i * dt, dt, rush);
    }
    expect(36 - blocked.pos.x).toBeCloseTo(0.5, 1);
    expect(36 - free.pos.x).toBeCloseTo(3, 1);
  });

  it('a sack happens at roughly the old 3 second pocket time with default-ish values', () => {
    const qb = { x: 30, y: 26.7 };
    let rushers: Rusher[] = [
      { pos: { x: 36, y: 23.7 }, shedAt: 2.2 },
      { pos: { x: 36, y: 29.7 }, shedAt: 2.4 },
    ];
    let t = 0;
    while (!reachedQb(rushers, qb, rush) && t < 10) {
      t += dt;
      rushers = rushers.map((r) => stepRusher(r, qb, t, dt, rush));
    }
    expect(t).toBeGreaterThan(2.5);
    expect(t).toBeLessThan(3.5);
  });

  it('puts the blocker between the rusher and the QB', () => {
    const spot = blockerSpot({ pos: { x: 36, y: 26 }, shedAt: 9 }, { x: 30, y: 26 });
    expect(spot.x).toBeCloseTo(35);
  });
});

describe('resolving the pass', () => {
  const landing = { x: 50, y: 20 };

  it('open receiver usually catches, occasionally drops', () => {
    expect(resolvePass({ x: 50.5, y: 20 }, { x: 56, y: 20 }, landing, 0.0, contest)).toBe('catch');
    expect(resolvePass({ x: 50.5, y: 20 }, { x: 56, y: 20 }, landing, 0.94, contest)).toBe('catch');
    expect(resolvePass({ x: 50.5, y: 20 }, { x: 56, y: 20 }, landing, 0.97, contest)).toBe('drop');
  });

  it('nobody near the ball is incomplete', () => {
    expect(resolvePass({ x: 45, y: 20 }, { x: 56, y: 20 }, landing, 0.0, contest)).toBe('incomplete');
  });

  it('a ball thrown straight to the defender is usually picked, sometimes dropped (never "incomplete")', () => {
    expect(resolvePass({ x: 45, y: 20 }, { x: 50.2, y: 20 }, landing, 0.1, contest)).toBe('interception');
    expect(resolvePass({ x: 45, y: 20 }, { x: 50.2, y: 20 }, landing, 0.7, contest)).toBe('interception');
    expect(resolvePass({ x: 45, y: 20 }, { x: 50.2, y: 20 }, landing, 0.9, contest)).toBe('droppedInt');
  });

  it('a tight defender can intercept, break it up, or lose the battle', () => {
    const wr = { x: 50.8, y: 20 };
    const cb = { x: 50.3, y: 20 }; // closer than the receiver
    expect(resolvePass(wr, cb, landing, 0.05, contest)).toBe('interception');
    expect(resolvePass(wr, cb, landing, 0.5, contest)).toBe('breakup');
    expect(resolvePass(wr, cb, landing, 0.9, contest)).toBe('catch');
  });

  it('a trailing defender can break it up but never intercepts', () => {
    const wr = { x: 50.2, y: 20 };
    const cb = { x: 51.5, y: 20 };
    for (const roll of [0, 0.1, 0.2]) expect(resolvePass(wr, cb, landing, roll, contest)).not.toBe('interception');
    expect(resolvePass(wr, cb, landing, 0.05, contest)).toBe('breakup');
  });
});

describe('passing with three receivers', () => {
  const landing = { x: 60, y: 30 };
  // Three receivers spread out, each with his own man nearby.
  const receivers = [
    { x: 70, y: 12 },
    { x: 60.4, y: 30 }, // the one the ball is thrown to
    { x: 62, y: 44 },
  ];

  it('finds the closest point', () => {
    expect(closestIndex(receivers, landing)).toBe(1);
    expect(closestIndex([], landing)).toBe(-1);
  });

  it('the pass goes to the receiver it was thrown to, not another one', () => {
    const defenders = [
      { x: 72, y: 12 },
      { x: 66, y: 30 }, // his man is beaten (well behind)
      { x: 64, y: 44 },
    ];
    const r = resolveTargetedPass(receivers, defenders, landing, 0.0, contest);
    expect(r).toEqual({ result: 'catch', receiver: 1, defender: 1 });
  });

  it("another receiver's defender can jump the route and pick it off", () => {
    const defenders = [
      { x: 60.1, y: 30.1 }, // the top receiver's man has drifted onto this throw
      { x: 66, y: 30 },
      { x: 64, y: 44 },
    ];
    const r = resolveTargetedPass(receivers, defenders, landing, 0.05, contest);
    expect(r.receiver).toBe(1);
    expect(r.defender).toBe(0);
    expect(r.result).toBe('interception');
  });

  it('the deep safety (4th defender) can pick off a ball thrown over everyone', () => {
    const deep = { x: 85, y: 27 };
    const defenders = [
      { x: 72, y: 12 },
      { x: 66, y: 30 },
      { x: 64, y: 44 },
      { x: 85.3, y: 27 }, // safety sitting on the landing spot
    ];
    const r = resolveTargetedPass(receivers, defenders, deep, 0.1, contest);
    expect(r.defender).toBe(3);
    expect(r.result).toBe('interception');
  });

  it('every play has one route per receiver, the running back and the tight end', () => {
    for (const play of PLAYS) expect(play.routes).toHaveLength(5);
  });
});
