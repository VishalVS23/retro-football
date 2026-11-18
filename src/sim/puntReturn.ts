/**
 * A whole punt play after the tap: the ball in the air, their returner drifting under it, our
 * coverage team racing downfield, then FAIR CATCH / let it bounce / MUFFED / catch and return.
 * Pure (no Phaser): the game steps it every frame, and tests run it headless for balance.
 *
 * The return itself reuses the interception-return chase (carry.ts): he runs toward our end
 * zone (dirX = -1) dodging chasers; our coverage team pursues and tackles automatically.
 * Their other players are blockers: each one that meets a cover man may hold him up once.
 */
import type { Feel } from '../config/feel';
import { OPP_GOAL_X, OWN_GOAL_X } from './drive';
import { FIELD_WIDTH, TOTAL_LENGTH } from './field';
import { formation } from './formation';
import { PUNTER_DEPTH, puntPath, resolvePunt, type PuntKick, type PuntPath } from './punting';
import { canTackle, evadeSteer, startChase, stepChase, type ChaseParams, type ChaseState, type Pursuer } from './carry';
import { createRng } from './rng';
import type { Vec } from './throw';

const mid = FIELD_WIDTH / 2;

export type PuntDecision = 'bounce' | 'fairCatch' | 'muff' | 'return';

/** How the play ended. `spotX` = where the next possession starts (theirs, or ours after a muff). */
export type PuntEnd =
  | { kind: 'bounce'; path: PuntPath; spotX: number } // nobody touched it: touchback / out / downed
  | { kind: 'fairCatch'; spotX: number }
  | { kind: 'muff'; spotX: number } // he dropped it and we recovered: our ball
  | { kind: 'return'; how: 'tackled' | 'out'; spotX: number; yards: number }
  | { kind: 'returnTD'; yards: number };

export interface CoverageMan {
  pos: Vec;
  speed: number;
  /** Seconds after the kick before he starts running (gunners go at once). */
  release: number;
  /** His lane: he aims this far to the side of the landing spot (keeps coverage spread out). */
  laneY: number;
  /** Seconds left held up by one of their blockers (he can't move or tackle). */
  held: number;
}

/** One of their players on the return team. Each gets one try at blocking a cover man. */
export interface ReturnBlocker {
  pos: Vec;
  used: boolean;
}

export interface PuntPlay {
  t: number; // seconds since the kick
  phase: 'air' | 'roll' | 'return' | 'done';
  from: Vec;
  kick: PuntKick;
  path: PuntPath;
  airTime: number;
  rollTime: number;
  height: number;
  /** Ball on the ground (x, y) and its height. */
  ball: Vec;
  ballHeight: number;
  returner: Vec;
  coverage: CoverageMan[];
  /** Their other players: they head for our cover men and try to block them. */
  returnTeam: ReturnBlocker[];
  decision: PuntDecision | null;
  chase: ChaseState | null;
  catchX: number;
  end: PuntEnd | null;
}

/** Our coverage team at the kick, from the formation (index 0 and 2 = the wide receivers = gunners). */
export function coverageAt(losX: number, punter: Vec, p: Feel['puntReturn']): CoverageMan[] {
  const f = formation(losX);
  const man = (pos: Vec, speed: number, release: number): CoverageMan => ({ pos: { ...pos }, speed, release, laneY: (pos.y - mid) * p.laneSpreadRatio, held: 0 });
  return [
    ...f.skill.map((s, i) => (i === 0 || i === 2 ? man(s.pos, p.gunnerSpeed, 0) : man(s.pos, p.coverSpeed, p.coverReleaseTime))),
    ...f.block.map((b) => man(b, p.lineSpeed, p.coverReleaseTime)),
    man(punter, p.punterSpeed, p.coverReleaseTime),
  ];
}

/** Their side at the snap (the corners and rushers), from the formation. */
export function returnTeamAt(losX: number, feel: Feel): ReturnBlocker[] {
  const f = formation(losX);
  const spots = [...f.skill.map((s) => ({ x: s.pos.x + feel.defense.cbCushionYards, y: s.pos.y })), ...f.rush.map((r) => ({ ...r }))];
  return spots.map((pos) => ({ pos, used: false }));
}

/** Their returner waits where a good punt usually comes down (never deeper than his own 3). */
export function returnerStart(punter: Vec, pr: Feel['puntReturn']): Vec {
  return { x: Math.min(punter.x + pr.returnerDepthYards, OPP_GOAL_X - 3), y: mid };
}

/**
 * The tap is in: work out the flight and line everyone up. `roll` slows each cover man down by
 * a random amount (up to `coverSpeedVariance`: some get held up by blockers).
 */
export function startPuntPlay(losX: number, m: number, feel: Feel, roll: () => number, coverage?: CoverageMan[], returnTeam?: ReturnBlocker[]): PuntPlay {
  const p = feel.punting;
  const pr = feel.puntReturn;
  const from = { x: Math.max(1, losX - PUNTER_DEPTH), y: mid };
  const kick = resolvePunt(m, p);
  const path = puntPath(from, kick);
  const airLen = Math.hypot(path.land.x - from.x, path.land.y - from.y);
  const full = Math.max(1, p.centreYards);
  const rollLen = Math.hypot(path.stop.x - path.land.x, path.stop.y - path.land.y);
  return {
    t: 0,
    phase: 'air',
    from,
    kick,
    path,
    airTime: Math.max(0.2, p.hangTime * (0.6 + (0.4 * airLen) / full)),
    rollTime: rollLen / Math.max(0.5, p.rollSpeed),
    height: p.arcHeightYards * Math.min(1, airLen / full),
    ball: { ...from },
    ballHeight: 0,
    returner: returnerStart(from, pr),
    coverage: (coverage ?? coverageAt(losX, from, pr)).map((c) => ({ ...c, speed: c.speed * (1 - pr.coverSpeedVariance * roll()) })),
    returnTeam: returnTeam ?? returnTeamAt(losX, feel),
    decision: null,
    chase: null,
    catchX: 0,
    end: null,
  };
}

function moveToward(pos: Vec, target: Vec, maxStep: number): Vec {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep || d < 1e-9) return { ...target };
  return { x: pos.x + (dx / d) * maxStep, y: pos.y + (dy / d) * maxStep };
}

/** Spots the ball to a whole yard, never on or behind a goal line. */
function spot(x: number): number {
  return Math.min(OPP_GOAL_X - 1, Math.max(OWN_GOAL_X + 1, Math.round(x)));
}

/** The returner's numbers once he has the ball (same shape as a ball carrier's). */
function returnParams(feel: Feel, t: number): ChaseParams {
  const pr = feel.puntReturn;
  const tk = feel.tackling;
  const r = feel.running;
  const ramp = pr.returnStartTime > 0 ? Math.min(1, t / pr.returnStartTime) : 1;
  return {
    carry: {
      runSpeed: pr.returnSpeed * Math.max(0.3, ramp),
      steerSpeed: r.steerSpeed,
      steerResponse: r.steerResponse,
      jukeSpeed: r.jukeSpeed,
      jukeTime: r.jukeTime,
      jukeCooldown: r.jukeCooldown,
      jukeForwardRatio: r.jukeForwardRatio,
      jukeRecoverTime: r.jukeRecoverTime,
    },
    pursuit: { reactionTime: tk.pursuitReactionTime, leadTime: tk.pursuitLeadTime, driveSpeed: 0 },
    tackle: { tackleReachYards: tk.tackleReachYards, brokenTackleChance: tk.brokenTackleChance, jukeEvadeChance: tk.jukeEvadeChance, stunTime: tk.stunTime },
    graceTime: 0,
    dirX: -1,
  };
}

/** What the returner does as the ball comes down. */
export function decide(s: PuntPlay, feel: Feel, roll: () => number): PuntDecision {
  const pr = feel.puntReturn;
  const { path } = s;
  const wentOutInAir = path.result !== 'downed' && path.land === path.stop && path.land.x < OPP_GOAL_X;
  if (wentOutInAir || path.land.x >= OPP_GOAL_X) return 'bounce';
  if (Math.hypot(s.returner.x - path.land.x, s.returner.y - path.land.y) > pr.catchReachYards) return 'bounce'; // can't get there
  if (path.land.x >= OPP_GOAL_X - pr.letBounceYards) return 'bounce'; // too close to his goal line to field it
  const nearest = Math.min(...s.coverage.map((c) => Math.hypot(c.pos.x - path.land.x, c.pos.y - path.land.y)));
  // Coverage right there = fair catch for sure; a bit further off, it gets less likely.
  const span = Math.max(0.01, pr.fairCatchMaxYards - pr.fairCatchYards);
  if (nearest <= pr.fairCatchYards || roll() < (pr.fairCatchMaxYards - nearest) / span) return 'fairCatch';
  if (roll() < pr.muffChance) return 'muff';
  return 'return';
}

export interface PuntStepEvents {
  /** The ball just came down and the returner made his choice this frame. */
  decided: PuntDecision | null;
  /** Someone missed a tackle on the return this frame. */
  missed: boolean;
}

/** One frame of the punt play. */
export function stepPuntPlay(s0: PuntPlay, dt: number, feel: Feel, roll: () => number): { play: PuntPlay; events: PuntStepEvents } {
  const s: PuntPlay = { ...s0, t: s0.t + dt };
  const pr = feel.puntReturn;
  const events: PuntStepEvents = { decided: null, missed: false };
  if (s.phase === 'done') return { play: s0, events };

  /**
   * Their blockers: each heads for the nearest free cover man between him and the returner and,
   * on reaching him, may hold him up (one try each). Blockers that have had their try jog after
   * the returner. Returns the new blockers and each cover man's added hold time.
   */
  const block = (cover: Vec[], free: boolean[]) => {
    const holds = cover.map(() => 0);
    const team = s.returnTeam.map((b) => {
      if (b.used) {
        const d = Math.hypot(s.returner.x - b.pos.x, s.returner.y - b.pos.y);
        return d <= pr.returnTeamGapYards ? b : { ...b, pos: moveToward(b.pos, s.returner, pr.returnTeamJogSpeed * dt) };
      }
      let best = -1;
      let bestD = Infinity;
      cover.forEach((c, i) => {
        const d = Math.hypot(c.x - b.pos.x, c.y - b.pos.y);
        if (free[i] && c.x < b.pos.x + pr.blockLookYards && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      if (best < 0) return { ...b, pos: moveToward(b.pos, s.returner, pr.returnTeamJogSpeed * dt) };
      if (bestD <= pr.blockReachYards) {
        if (roll() < pr.blockChance) {
          holds[best] = pr.blockHoldTime;
          free[best] = false;
        }
        return { ...b, used: true };
      }
      return { ...b, pos: moveToward(b.pos, cover[best], pr.blockerSpeed * dt) };
    });
    return { team, holds };
  };

  if (s.phase === 'air') {
    const { land } = s.path;
    const u = Math.min(1, s.t / s.airTime);
    s.ball = { x: s.from.x + (land.x - s.from.x) * u, y: s.from.y + (land.y - s.from.y) * u };
    s.ballHeight = 4 * s.height * u * (1 - u);
    // The returner drifts under it (he stays in bounds); our coverage races to the landing spot.
    const target = { x: Math.min(land.x, TOTAL_LENGTH), y: Math.max(0, Math.min(FIELD_WIDTH, land.y)) };
    s.returner = moveToward(s.returner, target, pr.returnerSpeed * dt);
    s.coverage = s.coverage.map((c) => {
      if (c.held > 0) return { ...c, held: Math.max(0, c.held - dt) };
      if (s.t < c.release) return c;
      return { ...c, pos: moveToward(c.pos, { x: target.x, y: Math.max(1, Math.min(FIELD_WIDTH - 1, target.y + c.laneY)) }, c.speed * dt) };
    });
    const b = block(
      s.coverage.map((c) => c.pos),
      s.coverage.map((c) => c.held <= 0),
    );
    s.returnTeam = b.team;
    s.coverage = s.coverage.map((c, i) => (b.holds[i] > 0 ? { ...c, held: b.holds[i] } : c));
    if (u < 1) return { play: s, events };

    const d = decide(s, feel, roll);
    s.decision = d;
    events.decided = d;
    s.ballHeight = 0;
    if (d === 'bounce') s.phase = 'roll';
    if (d === 'fairCatch') {
      s.phase = 'done';
      s.end = { kind: 'fairCatch', spotX: spot(land.x) };
    }
    if (d === 'muff') {
      s.phase = 'done';
      s.end = { kind: 'muff', spotX: spot(land.x) };
    }
    if (d === 'return') {
      s.phase = 'return';
      s.catchX = land.x;
      s.returner = { ...land };
      const chasers: Pursuer[] = s.coverage.map((c) => ({ pos: { ...c.pos }, speed: c.speed, stunned: 0, held: c.held }));
      s.chase = startChase(land, chasers);
    }
    return { play: s, events };
  }

  if (s.phase === 'roll') {
    const { land, stop } = s.path;
    const u = s.rollTime > 0 ? Math.min(1, (s.t - s.airTime) / s.rollTime) : 1;
    const e = 1 - (1 - u) * (1 - u); // rolls to a stop
    s.ball = { x: land.x + (stop.x - land.x) * e, y: land.y + (stop.y - land.y) * e };
    s.coverage = s.coverage.map((c) => ({ ...c, pos: moveToward(c.pos, s.ball, c.speed * dt) }));
    s.returner = moveToward(s.returner, s.ball, pr.returnerSpeed * 0.5 * dt);
    s.returnTeam = s.returnTeam.map((q) => ({ ...q, used: true, pos: moveToward(q.pos, s.returner, pr.returnTeamJogSpeed * dt) }));
    if (u >= 1) {
      s.phase = 'done';
      s.end = { kind: 'bounce', path: s.path, spotX: s.path.spotX };
    }
    return { play: s, events };
  }

  // Return: the chase engine from runs and interception returns.
  const chase = s.chase!;
  const steer = evadeSteer(chase.carrier.pos, chase.pursuers, -1, pr.evadeLookYards);
  const step = stepChase(chase, steer, dt, returnParams(feel, chase.t), roll);
  s.returner = { ...step.state.carrier.pos };
  s.ball = { ...s.returner };
  const pursuers = step.state.pursuers;
  const b = block(
    pursuers.map((q) => q.pos),
    pursuers.map((q) => canTackle(q)),
  );
  s.returnTeam = b.team;
  s.chase = { ...step.state, pursuers: pursuers.map((q, i) => (b.holds[i] > 0 ? { ...q, held: b.holds[i] } : q)) };
  s.coverage = s.coverage.map((c, i) => ({ ...c, pos: { ...pursuers[i].pos }, held: s.chase!.pursuers[i].held ?? 0 }));
  events.missed = step.missed !== null;
  if (step.end) {
    s.phase = 'done';
    const x = s.returner.x;
    if (step.end === 'touchdown') s.end = { kind: 'returnTD', yards: Math.round(s.catchX - OWN_GOAL_X) };
    else s.end = { kind: 'return', how: step.end === 'out' ? 'out' : 'tackled', spotX: spot(x), yards: Math.round(s.catchX - x) };
  }
  return { play: s, events };
}

/** Headless punt (balance tests): line of scrimmage `losX`, meter tap `m`. */
export function simulatePunt(feel: Feel, seed: number, losX: number, m: number): PuntEnd {
  const rng = createRng(seed);
  const r = () => rng.next();
  let s = startPuntPlay(losX, m, feel, r);
  for (let i = 0; i < 60 * 30 && s.phase !== 'done'; i++) s = stepPuntPlay(s, 1 / 60, feel, r).play;
  return s.end!;
}
