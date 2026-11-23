/**
 * A whole pass play simulated headless (no Phaser), built from the same pure pieces the game uses:
 * everyone lines up, runs routes, the corners cover, the QB throws to one receiver and the pass is
 * resolved. Used by the balance tests to measure how open each route gets.
 */
import type { Feel } from '../config/feel';
import { FIELD_WIDTH, TOTAL_LENGTH } from './field';
import { formation } from './formation';
import { RB, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, type PlayDef } from './routes';
import { resolveTargetedPass, rollCornerSpeed, startCoverage, stepCoverage, stepRusher, stepSafety, type PassResult, type Rusher } from './defense';
import { canTackle, evadeSteer, startChase, stepChase, tryJuke, type Pursuer } from './carry';
import { carryFor, pursuerFor, tackleFor } from './runRatings';
import { flightTime, type Vec } from './throw';
import { createRng } from './rng';
import type { Player } from '../players/player';
import { arm, missLanding, missRadius, offTargetCatchFactor } from './qbRatings';
import { contestedCatchRatio, contestMods, coverFor, receiverCatchChance, receiverRunParams, safetyReadTime } from './coverRatings';
import { cornerStart, coverParams, linebackerStart, stepBlitzer, type DefCallId } from './defCalls';

const dt = 1 / 60;
const mid = FIELD_WIDTH / 2;

export interface PassShot {
  /** Which player gets the ball (formation `skill` index). */
  to: number;
  /** Seconds after the snap the ball leaves the QB's hand. */
  throwAt: number;
  /** How well he leads the receiver: 1 = to the spot his route reaches at landing, 0 = at where he is now. */
  lead: number;
}

export interface PassOptions {
  /** Our QB (Stage 3d-b): his arm speeds the ball up, his accuracy adds the miss. null = a plain 10. Leave out = no QB ratings at all (perfect throws, as before 3d). */
  qb?: Player | null;
  /** He's under pressure when he throws (the miss circle grows). */
  pressured?: boolean;
  /** Our skill players in formation order (wide top, slot, wide bottom, RB). Leave out = no receiver ratings. */
  offense?: (Player | null)[];
  /** Their coverage: cover[i] covers skill spot i (three corners + the linebacker), plus the safety. Leave out = no defender ratings. */
  defense?: { cover: (Player | null)[]; safety: Player | null };
  /** Their defensive call (3d2). Default: normal man. */
  call?: DefCallId;
  /**
   * Play out the run after a catch: the catcher runs away from the nearest chaser and jukes a
   * tackler who gets this close (yards; 0 = never jukes). Result `gain` = yards from the line to where he's
   * stopped. Uses its own dice, so the pass itself rolls exactly as without it.
   */
  afterCatch?: { jukeYards: number };
}

/** Headless pass play. Corner speeds are rolled from `seed`, like the game does each snap. */
export function simulatePass(
  play: PlayDef,
  shot: PassShot,
  seed: number,
  feel: Feel,
  losX = 35,
  opts: PassOptions = {},
): { result: PassResult; separation: number; defender: number; miss: number; sacked: boolean; gain?: number; afterCatch?: number } {
  const withQb = 'qb' in opts;
  const armFx = withQb ? arm(opts.qb, feel.ratings) : { speed: 1, range: 1 };
  const rng = createRng(seed);
  const d = feel.defense;
  const f = formation(losX);
  const paths = f.skill.map((s, i) => routePath(s.pos, play.routes[i], s.towardMiddle));
  let runners = paths.map((path, i) => startRunner(path, play.routes[i].stop));
  const R = feel.ratings;
  // Each receiver runs his route at his own speed (3d-c); without `offense`, everyone at the plain values.
  const run = f.skill.map((_, i) => (opts.offense ? receiverRunParams(opts.offense[i], feel.routes, R) : feel.routes));
  const call = opts.call ?? 'man';
  const blitz = call === 'blitz';
  const { cb: cbCover, lb: lbCover } = coverParams(call, feel, losX, false);
  // Each defender covers with his own ratings (3d-c).
  const def = opts.defense;
  const coverP = f.skill.map((_, i) => {
    const base = i === RB ? lbCover : cbCover;
    return def ? coverFor(def.cover[i], base, R) : base;
  });
  let cover = f.skill.map((s, i) =>
    startCoverage(
      i === RB ? linebackerStart(call, feel, losX) : cornerStart(call, feel, s.pos),
      s.pos,
      i === RB ? 1 : rollCornerSpeed(1, d.cbSpeedVariance, rng.next()),
    ),
  );
  let safety: Vec = { x: losX + d.safetyDepthYards, y: mid };
  const qbStart = f.qb;
  const qbAt = (t: number) => {
    const u = Math.min(1, t / Math.max(0.01, feel.pocket.dropbackTime));
    return { x: qbStart.x - feel.pocket.dropbackYards * (1 - (1 - u) * (1 - u)), y: qbStart.y };
  };
  const tk = feel.tackling;
  const safetyParams = {
    baseX: Math.min(losX + d.safetyDepthYards, TOTAL_LENGTH - 1),
    maxX: TOTAL_LENGTH - 1,
    cushionYards: d.safetyCushionYards,
    driftSpeed: tk.dbPursuitSpeed * d.safetyDriftRatio,
    bailSpeed: tk.dbPursuitSpeed * d.safetyBailRatio,
    ballReactionTime: def ? safetyReadTime(def.safety, d.safetyBallReactionTime, R) : d.safetyBallReactionTime,
    ballSpeed: tk.dbPursuitSpeed * d.safetyBallSpeedRatio,
  };


  // A blitzing linebacker runs at the QB instead of covering the RB (nobody blocks him).
  type Cov = (typeof cover)[number];
  const stepLb = (c: Cov, tt: number): Cov => ({ ...c, pos: stepBlitzer(c.pos, qbAt(tt), tt, dt, feel) });
  // The two pass rushers (only needed to chase after a catch; their own dice keep the pass rolls unchanged).
  const rng2 = createRng((seed ^ 0x5bd1e995) >>> 0);
  const pk = feel.pocket;
  let rushers: Rusher[] = f.rush.map((pos) => ({ pos: { ...pos }, shedAt: pk.shedTime + (rng2.next() * 2 - 1) * pk.shedTimeVariance }));
  const rushP = { blockedSpeed: pk.rushBlockedSpeed, freeSpeed: pk.rushFreeSpeed, sackReachYards: pk.sackReachYards };
  let sacked = false;
  let t = 0;
  for (; t < shot.throwAt - 1e-9; t += dt) {
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, run[i]));
    cover = cover.map((c, i) => (blitz && i === RB ? stepLb(c, t + dt) : stepCoverage(c, runners[i].pos, dt, coverP[i])));
    safety = stepSafety(safety, runners.map((r) => r.pos), dt, safetyParams);
    const q = qbAt(t + dt);
    rushers = rushers.map((r) => stepRusher(r, q, t + dt, dt, rushP));
    if (blitz && Math.hypot(cover[RB].pos.x - q.x, cover[RB].pos.y - q.y) <= feel.pocket.sackReachYards) sacked = true;
  }

  // The throw.
  const qb = qbAt(t);
  const me = runners[shot.to];
  const guess = runnerAfter(me, paths[shot.to], 1, run[shot.to]).pos; // rough first guess, refined below
  let landing = guess;
  let duration = 1;
  for (let k = 0; k < 4; k++) {
    duration = flightTime(Math.hypot(landing.x - qb.x, landing.y - qb.y), feel.throw) / armFx.speed;
    const ideal = runnerAfter(me, paths[shot.to], duration, run[shot.to]).pos;
    landing = { x: me.pos.x + (ideal.x - me.pos.x) * shot.lead, y: me.pos.y + (ideal.y - me.pos.y) * shot.lead };
  }
  // His accuracy: the ball lands somewhere in a circle around where he aimed.
  let miss = 0;
  if (withQb) {
    const aimed = landing;
    const radius = missRadius(opts.qb, Math.hypot(aimed.x - qb.x, aimed.y - qb.y), !!opts.pressured, feel.throw, feel.ratings);
    landing = missLanding(qb, aimed, radius, feel.ratings.scatterDepthRatio, rng.next(), rng.next());
    miss = Math.hypot(landing.x - aimed.x, landing.y - aimed.y);
  }
  const atLanding = runners.map((r, i) => runnerAfter(r, paths[i], duration, run[i]).pos);
  for (let e = 0; e < duration - 1e-9; e += dt) {
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, run[i]));
    cover = cover.map((c, i) => stepCoverage(c, runners[i].pos, dt, coverP[i], { landing, sinceThrow: e + dt, help: i !== shot.to }));
    safety = stepSafety(safety, runners.map((r) => r.pos), dt, safetyParams, { landing, sinceThrow: e + dt });
    rushers = rushers.map((r) => stepRusher(r, qb, t + e + dt, dt, rushP));
  }
  const ca = feel.catching;
  const wrSpots = runners.map((r, i) =>
    i === shot.to ? receiverInFlight(r.pos, atLanding[i], landing, duration, ca.receiverAdjustYards, ca.receiverAdjustSpeed) : r.pos,
  );
  const cbSpots = [...cover.map((c) => c.pos), safety];
  const pass = resolveTargetedPass(wrSpots, cbSpots, landing, rng.next(), {
    catchRadiusYards: ca.catchRadiusYards,
    contestRadiusYards: d.contestRadiusYards,
    breakupChance: d.breakupChance,
    interceptChance: d.interceptChance,
    receiverCatchChance: ca.receiverCatchChance * offTargetCatchFactor(miss, ca.catchRadiusYards, feel.ratings),
    defenderCatchChance: d.defenderCatchChance,
    shieldedContestRatio: d.shieldedContestRatio,
    helpContestRatio: d.helpContestRatio,
  }, qb, {
    ...(opts.offense && {
      receiverCatch: opts.offense.map((p) => receiverCatchChance(p, ca.receiverCatchChance, R) * offTargetCatchFactor(miss, ca.catchRadiusYards, R)),
      contested: opts.offense.map((p) => contestedCatchRatio(p, R)),
    }),
    ...(def && (() => {
      const all = [...def.cover, def.safety].map((p) => contestMods(p, R));
      return { breakup: all.map((m) => m.breakup), intercept: all.map((m) => m.intercept), hold: all.map((m) => m.hold) };
    })()),
  });
  const nearestDefender = Math.min(...cbSpots.map((c) => Math.hypot(c.x - landing.x, c.y - landing.y)));
  const out = { result: pass.result, separation: nearestDefender, defender: pass.defender, miss, sacked };
  if (!opts.afterCatch || sacked || pass.result !== 'catch') return out;

  // Run after the catch, like the game: every defender chases (the rushers too: on a pass nobody blocks them any more).
  const at = wrSpots[shot.to];
  const isRb = shot.to === RB;
  const catcher = opts.offense?.[shot.to] ?? undefined;
  const role = isRb ? 'RB' : 'WR';
  const pursuers: Pursuer[] = [
    ...cover.map((c, i) =>
      pursuerFor(def?.cover[i] ?? undefined, i === RB ? 'LB' : 'CB', { pos: { ...c.pos }, speed: i === RB ? d.lbPursuitSpeed : tk.dbPursuitSpeed, stunned: 0 }, R),
    ),
    pursuerFor(def?.safety ?? undefined, 'S', { pos: { ...safety }, speed: tk.dbPursuitSpeed, stunned: 0 }, R),
    ...rushers.map((r) => pursuerFor(undefined, 'DL', { pos: { ...r.pos }, speed: tk.dlPursuitSpeed, stunned: 0 }, R)),
  ];
  const carry = carryFor(catcher, role, { ...feel.running, runSpeed: isRb ? feel.runGame.rbRunSpeed : feel.running.runSpeed }, R);
  const params = {
    carry,
    pursuit: { reactionTime: tk.pursuitReactionTime, leadTime: tk.pursuitLeadTime, readWindow: tk.pursuitReadWindow, driveSpeed: 0 },
    tackle: tackleFor(catcher, role, tk, R),
    graceTime: tk.catchGraceTime,
    dirX: 1 as const,
  };
  let chase = startChase(at, pursuers);
  const juke = opts.afterCatch.jukeYards;
  for (let i = 0; i < 60 * 15; i++) {
    const c = chase.carrier.pos;
    if (juke > 0) {
      const threat = chase.pursuers.find((q) => canTackle(q) && q.pos.x > c.x - 0.5 && Math.hypot(q.pos.x - c.x, q.pos.y - c.y) < juke);
      if (threat) chase = { ...chase, carrier: tryJuke(chase.carrier, Math.sign(c.y - threat.pos.y) || 1, carry) };
    }
    const step = stepChase(chase, evadeSteer(c, chase.pursuers, 1, feel.interception.evadeLookYards), dt, params, () => rng2.next());
    chase = step.state;
    if (step.end) break;
  }
  return { ...out, gain: chase.carrier.pos.x - losX, afterCatch: chase.carrier.pos.x - at.x };
}
