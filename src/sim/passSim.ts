/**
 * A whole pass play simulated headless (no Phaser), built from the same pure pieces the game uses:
 * everyone lines up, runs routes, the corners cover, the QB throws to one receiver and the pass is
 * resolved. Used by the balance tests to measure how open each route gets.
 */
import type { Feel } from '../config/feel';
import { FIELD_WIDTH, TOTAL_LENGTH } from './field';
import { formation } from './formation';
import { RB, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, type PlayDef } from './routes';
import { resolveTargetedPass, rollCornerSpeed, startCoverage, stepCoverage, stepSafety, type PassResult } from './defense';
import { flightTime, type Vec } from './throw';
import { createRng } from './rng';
import type { Player } from '../players/player';
import { arm, missLanding, missRadius, offTargetCatchFactor } from './qbRatings';

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
}

/** Headless pass play. Corner speeds are rolled from `seed`, like the game does each snap. */
export function simulatePass(
  play: PlayDef,
  shot: PassShot,
  seed: number,
  feel: Feel,
  losX = 35,
  opts: PassOptions = {},
): { result: PassResult; separation: number; defender: number; miss: number } {
  const withQb = 'qb' in opts;
  const armFx = withQb ? arm(opts.qb, feel.ratings) : { speed: 1, range: 1 };
  const rng = createRng(seed);
  const d = feel.defense;
  const f = formation(losX);
  const paths = f.skill.map((s, i) => routePath(s.pos, play.routes[i], s.towardMiddle));
  let runners = paths.map((path, i) => startRunner(path, play.routes[i].stop));
  const cbCover = {
    topSpeed: feel.routes.topSpeed * d.cbSpeedRatio,
    acceleration: feel.routes.acceleration,
    reactionTime: d.cbReactionTime,
    cushionYards: d.cbCushionYards,
    cushionCloseTime: d.cbCushionCloseTime,
    ballReactionTime: d.cbBallReactionTime,
    ballSpeedRatio: d.cbBallSpeedRatio,
    bodyGapYards: d.cbBodyGapYards,
    helpBallReactionTime: d.cbHelpBallReactionTime,
    turnAcceleration: d.cbTurnAcceleration,
    anticipation: d.cbAnticipation,
  };
  const lbCover = { ...cbCover, topSpeed: feel.routes.topSpeed * d.lbSpeedRatio, reactionTime: d.lbReactionTime, cushionYards: 1, minX: losX + d.lbPassDropYards };
  let cover = f.skill.map((s, i) =>
    startCoverage(
      i === RB ? { x: losX + d.lbDepthYards, y: mid } : { x: s.pos.x + d.cbCushionYards, y: s.pos.y },
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
    ballReactionTime: d.safetyBallReactionTime,
    ballSpeed: tk.dbPursuitSpeed * d.cbBallSpeedRatio,
  };


  let t = 0;
  for (; t < shot.throwAt - 1e-9; t += dt) {
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, feel.routes));
    cover = cover.map((c, i) => stepCoverage(c, runners[i].pos, dt, i === RB ? lbCover : cbCover));
    safety = stepSafety(safety, runners.map((r) => r.pos), dt, safetyParams);
  }

  // The throw.
  const qb = qbAt(t);
  const me = runners[shot.to];
  const guess = runnerAfter(me, paths[shot.to], 1, feel.routes).pos; // rough first guess, refined below
  let landing = guess;
  let duration = 1;
  for (let k = 0; k < 4; k++) {
    duration = flightTime(Math.hypot(landing.x - qb.x, landing.y - qb.y), feel.throw) / armFx.speed;
    const ideal = runnerAfter(me, paths[shot.to], duration, feel.routes).pos;
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
  const atLanding = runners.map((r, i) => runnerAfter(r, paths[i], duration, feel.routes).pos);
  for (let e = 0; e < duration - 1e-9; e += dt) {
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, feel.routes));
    cover = cover.map((c, i) =>
      stepCoverage(c, runners[i].pos, dt, i === RB ? lbCover : cbCover, { landing, sinceThrow: e + dt, help: i !== shot.to }),
    );
    safety = stepSafety(safety, runners.map((r) => r.pos), dt, safetyParams, { landing, sinceThrow: e + dt });
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
  }, qb);
  const nearestDefender = Math.min(...cbSpots.map((c) => Math.hypot(c.x - landing.x, c.y - landing.y)));
  return { result: pass.result, separation: nearestDefender, defender: pass.defender, miss };
}
