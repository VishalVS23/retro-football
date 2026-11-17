import { describe, expect, it } from 'vitest';
import {
  GOAL_LINE_X,
  OWN_GOAL_LINE_X,
  checkTackles,
  diveYards,
  startChase,
  startDive,
  stepChase,
  evadeSteer,
  playEnd,
  remember,
  stepTrailer,
  startCarrier,
  stepCarrier,
  stepPursuers,
  tryJuke,
  type Carrier,
  type ChaseState,
  type Pursuer,
  type Sightings,
} from './carry';

const carry = { runSpeed: 7.5, steerSpeed: 5, steerResponse: 10, jukeSpeed: 9, jukeTime: 0.18, jukeCooldown: 0.6 };
const pursuit = { reactionTime: 0.2, leadTime: 0.35, runSpeed: 7.5 };
const tackle = { tackleReachYards: 1.1, brokenTackleChance: 0.15, jukeEvadeChance: 0.6, stunTime: 0.7 };
const dt = 1 / 60;

function runFor(c: Carrier, seconds: number, steer: number) {
  for (let i = 0; i < Math.round(seconds / dt); i++) c = stepCarrier(c, steer, dt, carry);
  return c;
}

describe('ball carrier', () => {
  it('runs downfield on his own', () => {
    const c = runFor(startCarrier({ x: 40, y: 20 }), 1, 0);
    expect(c.pos.x).toBeCloseTo(47.5);
    expect(c.pos.y).toBeCloseTo(20);
  });

  it('steers smoothly up and down', () => {
    const c = runFor(startCarrier({ x: 40, y: 20 }), 1, 1);
    expect(c.pos.y).toBeGreaterThan(23);
    expect(c.pos.y).toBeLessThan(25); // eased in, so less than full speed for the whole second
  });

  it('a juke is a quick sideways burst with a cooldown', () => {
    let c = tryJuke(startCarrier({ x: 40, y: 20 }), -1, carry);
    const again = tryJuke(c, 1, carry);
    expect(again.jukeDir).toBe(-1); // second juke ignored during cooldown
    c = runFor(c, 0.18, 0);
    expect(c.pos.y).toBeCloseTo(20 - 9 * 0.18, 1);
    c = runFor(c, 0.7, 0);
    expect(tryJuke(c, 1, carry).jukeDir).toBe(1); // ready again
  });

  it('a juke costs forward speed, then he gets back up to full speed', () => {
    const p = { ...carry, jukeForwardRatio: 0.5, jukeRecoverTime: 0.3 };
    let c = tryJuke(startCarrier({ x: 40, y: 20 }), 1, p);
    for (let i = 0; i < Math.round(0.18 / dt); i++) c = stepCarrier(c, 0, dt, p);
    expect(c.pos.x - 40).toBeCloseTo(7.5 * 0.5 * 0.18, 1); // half speed during the juke
    const x0 = c.pos.x;
    for (let i = 0; i < Math.round(0.3 / dt); i++) c = stepCarrier(c, 0, dt, p);
    const recovering = c.pos.x - x0;
    expect(recovering).toBeGreaterThan(7.5 * 0.5 * 0.3);
    expect(recovering).toBeLessThan(7.5 * 0.3);
    const x1 = c.pos.x;
    c = stepCarrier(c, 0, dt, p);
    expect((c.pos.x - x1) / dt).toBeCloseTo(7.5); // full speed again
  });

  it('knows touchdowns and out of bounds', () => {
    expect(playEnd({ x: GOAL_LINE_X + 0.1, y: 20 })).toBe('touchdown');
    expect(playEnd({ x: 60, y: -0.1 })).toBe('out');
    expect(playEnd({ x: 60, y: 20 })).toBeNull();
  });
});

describe('pursuit', () => {
  it('a defender closes in on the runner', () => {
    let c = startCarrier({ x: 40, y: 20 });
    let d: Pursuer[] = [{ pos: { x: 50, y: 30 }, speed: 7.2, stunned: 0 }];
    let seen: Sightings = remember([], 0, c, 1);
    const gap0 = Math.hypot(d[0].pos.x - c.pos.x, d[0].pos.y - c.pos.y);
    for (let i = 1; i <= 60; i++) {
      c = stepCarrier(c, 0, dt, carry);
      seen = remember(seen, i * dt, c, 1);
      d = stepPursuers(d, seen, i * dt, dt, pursuit);
    }
    expect(Math.hypot(d[0].pos.x - c.pos.x, d[0].pos.y - c.pos.y)).toBeLessThan(gap0 / 3);
  });

  it('a stunned defender stays down for a moment', () => {
    const c = startCarrier({ x: 40, y: 20 });
    const d = stepPursuers([{ pos: { x: 45, y: 20 }, speed: 7, stunned: 0.5 }], remember([], 0, c, 1), 0, 0.1, pursuit);
    expect(d[0].pos.x).toBe(45);
    expect(d[0].stunned).toBeCloseTo(0.4);
  });
});

describe('tackles', () => {
  const runner = startCarrier({ x: 40, y: 20 });
  const near: Pursuer = { pos: { x: 40.5, y: 20 }, speed: 7, stunned: 0 };
  const far: Pursuer = { pos: { x: 45, y: 20 }, speed: 7, stunned: 0 };

  it('nobody close, nothing happens', () => {
    const r = checkTackles([far], runner, () => 0.5, tackle);
    expect(r.tackled).toBe(false);
    expect(r.by).toBe(-1);
  });

  it('a defender in reach usually makes the tackle', () => {
    expect(checkTackles([near], runner, () => 0.5, tackle).tackled).toBe(true);
  });

  it('sometimes the runner breaks it, and the defender is left on the turf', () => {
    const r = checkTackles([near], runner, () => 0.05, tackle);
    expect(r.tackled).toBe(false);
    expect(r.missed).toBe('broken');
    expect(r.pursuers[0].stunned).toBe(0.7);
  });

  it('a well-timed juke can make him miss', () => {
    const juking = tryJuke(runner, 1, carry);
    const r = checkTackles([near], juking, () => 0.3, tackle);
    expect(r.missed).toBe('juked');
    expect(r.tackled).toBe(false);
  });

  it('a stunned defender cannot tackle', () => {
    expect(checkTackles([{ ...near, stunned: 0.3 }], runner, () => 0.5, tackle).tackled).toBe(false);
  });
});

describe('interception returns (running the other way)', () => {
  const still = (x: number, y: number, speed = 7): Pursuer => ({ pos: { x, y }, speed, stunned: 0 });

  it('a returner runs toward our end zone', () => {
    let c = startCarrier({ x: 60, y: 20 });
    for (let i = 0; i < 60; i++) c = stepCarrier(c, 0, dt, carry, -1);
    expect(c.pos.x).toBeCloseTo(60 - 7.5, 1);
  });

  it('crossing our goal line is a touchdown for them (pick six)', () => {
    expect(playEnd({ x: OWN_GOAL_LINE_X, y: 20 }, -1)).toBe('touchdown');
    expect(playEnd({ x: OWN_GOAL_LINE_X + 1, y: 20 }, -1)).toBeNull();
    expect(playEnd({ x: GOAL_LINE_X, y: 20 }, -1)).toBeNull(); // their own goal line is not a score
  });

  it('chasers lead the returner in his direction', () => {
    const seen: Sightings = [{ t: 0, pos: { x: 60, y: 20 }, vy: 0 }];
    // A chaser level with him, off to the side, angles toward where he's going (lower x).
    const [d] = stepPursuers([still(60, 30)], seen, 0.5, 0.1, { ...pursuit, dirX: -1 });
    expect(d.pos.x).toBeLessThan(60);
  });

  it('veers away from the nearest chaser in front of him', () => {
    expect(evadeSteer({ x: 60, y: 25 }, [still(55, 23)], -1, 8)).toBeGreaterThan(0); // chaser above: go down
    expect(evadeSteer({ x: 60, y: 25 }, [still(55, 27)], -1, 8)).toBeLessThan(0); // chaser below: go up
  });

  it('ignores chasers already behind him, and stunned ones', () => {
    expect(evadeSteer({ x: 60, y: 25 }, [still(66, 24)], -1, 8)).toBe(0);
    expect(evadeSteer({ x: 60, y: 25 }, [{ ...still(56, 24), stunned: 0.5 }], -1, 8)).toBe(0);
  });

  it('turns back in near a sideline', () => {
    expect(evadeSteer({ x: 60, y: 1 }, [], -1, 8)).toBeGreaterThan(0.5);
    expect(evadeSteer({ x: 60, y: 52.5 }, [], -1, 8)).toBeLessThan(-0.5);
  });
});

describe('teammates without the ball', () => {
  const p = { stopTime: 0.5, jogSpeed: 4.5, jogAcceleration: 8, trailYards: 3, maxSideYards: 8 };
  const carrier = { x: 50, y: 25 };

  it('pull up out of their route over stopTime', () => {
    let t = { pos: { x: 70, y: 10 }, speed: 8, dir: { x: 1, y: 0 } };
    let time = 0;
    for (let i = 0; i < 30; i++) {
      t = stepTrailer(t, carrier, time, dt, p);
      time += dt;
    }
    expect(t.speed).toBeLessThan(0.5);
    expect(t.pos.x - 70).toBeLessThan(8 * 0.5); // slowed down, didn't keep sprinting
  });

  it('then jog after the play: behind the carrier, never running off ahead', () => {
    let t = { pos: { x: 70, y: 10 }, speed: 0, dir: { x: 1, y: 0 } };
    for (let i = 0; i < 60 * 6; i++) t = stepTrailer(t, carrier, 1 + i * dt, dt, p);
    expect(t.pos.x).toBeCloseTo(47, 0); // 3 yd behind him
    expect(t.pos.y).toBeCloseTo(17, 0); // no more than 8 yd to the side
  });
});

describe('going down on his own (dive / QB slide)', () => {
  const costly = { ...carry, jukeForwardRatio: 0.8, jukeRecoverTime: 0.2 };
  const dive = { minYards: 1, maxYards: 3, time: 0.3 };
  const chase = {
    carry: costly,
    pursuit: { reactionTime: 0.2, leadTime: 0.35 },
    tackle: { ...tackle, brokenTackleChance: 0 },
    graceTime: 0,
    dirX: 1 as const,
  };
  const diveUntilEnd = (s: ChaseState) => {
    for (let i = 0; i < 120; i++) {
      const step = stepChase(s, 0, dt, chase, () => 0.99);
      s = step.state;
      if (step.end) return { s, end: step.end };
    }
    return { s, end: null };
  };

  it('dives further at full speed than just after a juke', () => {
    const full = startCarrier({ x: 40, y: 20 });
    expect(diveYards(full, costly, dive)).toBeCloseTo(3);
    expect(diveYards(tryJuke(full, 1, costly), costly, dive)).toBeCloseTo(1);
  });

  it('goes down at the dive spot, and nobody can tackle him on the way', () => {
    // A defender right on top of him would tackle him on the next frame without the dive.
    const s = startDive(startChase({ x: 40, y: 20 }, [{ pos: { x: 40.5, y: 20 }, speed: 7, stunned: 0 }]), costly, dive);
    const r = diveUntilEnd(s);
    expect(r.end).toBe('down');
    expect(r.s.carrier.pos.x).toBeCloseTo(43);
  });

  it('a QB slide (0 yards) goes down on the spot', () => {
    const r = diveUntilEnd(startDive(startChase({ x: 40, y: 20 }, []), costly, { minYards: 0, maxYards: 0, time: 0.3 }));
    expect(r.end).toBe('down');
    expect(r.s.carrier.pos.x).toBeCloseTo(40);
  });

  it('diving across the goal line is a touchdown', () => {
    const r = diveUntilEnd(startDive(startChase({ x: GOAL_LINE_X - 2, y: 20 }, []), costly, dive));
    expect(r.end).toBe('touchdown');
  });
});
