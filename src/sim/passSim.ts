/**
 * A whole pass play simulated headless (no Phaser), built from the same pure pieces the game uses:
 * everyone lines up, runs routes, the corners cover, the QB throws to one receiver and the pass is
 * resolved. Used by the balance tests to measure how open each route gets.
 */
import type { Feel } from '../config/feel';
import { formation, playFor, type FormationId } from './formation';
import { RB, TE, coveredByLinebacker, routeBase, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, type PlayDef } from './routes';
import { reachedQb, resolveTargetedPass, rollCornerSpeed, startCoverage, stepCoverage, stepRusher, stepSafety, stepZoneSafety, type PassResult, type Rusher } from './defense';
import { ZONE_SHELL, breaksOn, contestsAsHelp, isZoneCall, zoneBallReaction, zoneCoverScale, zoneJobs, zoneTarget } from './zone';
import { canTackle, evadeSteer, startChase, stepChase, tryJuke, type Pursuer } from './carry';
import { TE_SIDE_RUSHER, carryFor, lineShedTimes, pursuerFor, shedTimeFor, tackleFor, teHelpFor } from './runRatings';
import { flightTime, type Vec } from './throw';
import { createRng } from './rng';
import { bracketCorner, bracketTarget, jumpTarget } from './scouting';
import type { Player } from '../players/player';
import { arm, missLanding, missRadius, offTargetCatchFactor } from './qbRatings';
import { contestedCatchRatio, contestMods, coverFor, receiverCatchChance, receiverRunParams, safetyReadTime } from './coverRatings';
import { coverParams, lb2ZoneSpot, lookAlignment, spreadCheckOn, tripsCheckOn, tripsCornerJob, tripsSafetyStart, tripsSafetyTarget, rotatedTarget, rotationReadDelay, safetyBaseReaction, safetyParamsFor, type Look, type ShellId, stepBlitzer, zoneParams, type DefCallId, type Lb2Job } from './defCalls';

const dt = 1 / 60;
/** Where a player who can't catch the ball (the TE in to block) is put for the catch check. */
const OFF_FIELD: Vec = { x: -1000, y: -1000 };

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
  /** Our skill players in formation order (wide top, slot, wide bottom, RB, TE). Leave out = no receiver ratings. */
  offense?: (Player | null)[];
  /** Their coverage: cover[i] covers skill spot i (three corners, LB1, LB2), plus the two safeties (S1 top half, S2 bottom) and the four rushers. Leave out = no defender ratings. */
  defense?: { cover: (Player | null)[]; safety: Player | null; safety2?: Player | null; rush?: (Player | null)[] };
  /** Our five blockers (3h-a), formation order: `BLOCKER_OF[i]` blocks their rusher i. Leave out = average blocking. */
  line?: (Player | null)[];
  /** Their defensive call (3d2). Default: normal man. */
  call?: DefCallId;
  /** Their safety look (3h-c). Default: two deep. */
  shell?: ShellId;
  /** Disguise (D-a): they line up in this look and play `call` / `shell` from there. Leave out = they line up in what they play. */
  shown?: Look;
  /** A-b: defender `cover` (0-4) sits on `spot` (he expects a throw there), reads the throw quicker and contests at full strength. */
  jump?: { cover: number; spot: Vec };
  /** A-c: S2 brackets this skill spot (man calls only: the look becomes one deep + the bracket). */
  bracket?: number;
  /** F-a: our formation (default NORMAL). */
  formation?: FormationId;
  /** Our TE stays in to block (his route is Block): what LB2 does. Default: drops into the short middle. */
  lb2?: 'drop' | 'blitz';
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
): { result: PassResult; separation: number; defender: number; miss: number; sacked: boolean; landing?: Vec; gain?: number; afterCatch?: number } {
  const withQb = 'qb' in opts;
  const armFx = withQb ? arm(opts.qb, feel.ratings) : { speed: 1, range: 1 };
  const rng = createRng(seed);
  const d = feel.defense;
  const f = formation(losX, opts.formation);
  play = playFor(play, opts.formation); // SPREAD: the split-out TE runs receiver routes
  const paths = f.skill.map((s, i) => routePath(s.pos, play.routes[i], s.towardMiddle));
  let runners = paths.map((path, i) => startRunner(path, play.routes[i].stop));
  const R = feel.ratings;
  // Each receiver runs his route at his own speed (3d-c); without `offense`, everyone at the plain values.
  const run = f.skill.map((_, i) => (opts.offense ? receiverRunParams(opts.offense[i], routeBase(i, feel.routes), R) : routeBase(i, feel.routes)));
  const call = opts.call ?? 'man';
  const blitz = call === 'blitz';
  const { cb: cbCover, lb: lbCover, lb2: lb2Cover } = coverParams(call, feel, losX, false);
  // Each defender covers with his own ratings (3d-c).
  const def = opts.defense;
  // LB2 (3h-b) covers the TE, or with the TE in to block drops into the short middle / blitzes.
  const teBlocks = !!play.routes[TE]?.block;
  // F-c2, the Spread check: S2 takes the split-out TE, LB2 drops or blitzes (like with the TE in to block).
  const spreadChk = spreadCheckOn(opts.formation ?? 'normal', call, !isZoneCall(call) && opts.bracket !== undefined ? opts.bracket : null) && !opts.shown;
  const job: Lb2Job = teBlocks || spreadChk ? (opts.lb2 ?? 'drop') : 'cover';
  // Zone call (Z-a): everyone plays an area instead of a man (LB2 still blitzes when the TE blocks and the dice say so).
  const zone = isZoneCall(call);
  const jobs = zone ? zoneJobs(call, feel, losX, f.sides.strongSide) : null;
  const coverP = f.skill.map((_, i) => {
    const base = i === TE ? lb2Cover : i === RB ? lbCover : cbCover;
    const rated = def ? coverFor(def.cover[i], base, R, zone) : base;
    if (jobs) {
      const zs = zoneCoverScale(jobs[i], feel);
      return { ...zoneParams(rated), ballReactionTime: zs.ballReactionTime, topSpeed: rated.topSpeed * zs.speedRatio };
    }
    return i === TE && job === 'drop' ? zoneParams(rated) : rated;
  });
  // A-c: the bracketed receiver's corner plays him tight underneath.
  if (opts.bracket !== undefined && !isZoneCall(call)) coverP[opts.bracket] = bracketCorner(coverP[opts.bracket], feel);
  // A-b: the jumper sits on his spot (no cushion) and reads the throw quicker.
  const jumper = opts.jump && !(blitz && opts.jump.cover === RB) && !(opts.jump.cover === TE && job === 'blitz') ? opts.jump : null;
  if (jumper) {
    const p = zoneParams(coverP[jumper.cover]);
    coverP[jumper.cover] = { ...p, ballReactionTime: p.ballReactionTime * feel.adjust.jumpReactionRatio };
  }
  const zoneSpot = lb2ZoneSpot(feel, losX, f.sides);
  // Safety look (3h-c): two deep (S1 top half, S2 bottom half) or one deep + robber. Cover 3: one deep (S1 in the middle third), S2 rotates down.
  const bracket = !isZoneCall(call) && opts.bracket !== undefined ? opts.bracket : null;
  // F-b, the Trips check: the empty-side corner stays home in a flat zone, S2 comes down on the inside slot, S1 single high.
  const trips = tripsCheckOn(opts.formation ?? 'normal', call, bracket) && !opts.shown;
  const tripsJob = trips ? tripsCornerJob(feel, losX, f.sides) : null;
  if (trips) coverP[2] = { ...zoneParams(coverP[2]), ballReactionTime: feel.zone.underBallReactionTime };
  const shell = isZoneCall(call) ? ZONE_SHELL[call] : (opts.shell ?? 'twoDeep');
  // Where they line up: the look they show (a disguise) or the one they play.
  const align = lookAlignment(opts.shown ?? { call, shell }, feel, losX, f.skill.map((s) => s.pos), f.sides);
  if (tripsJob) align.cover[2] = { ...tripsJob.spot };
  // The safety coming down on a man (Trips: the inside slot; Spread: the split-out TE).
  const s2Man = trips ? 2 : spreadChk ? TE : null;
  if (s2Man !== null) align.safeties[1] = tripsSafetyStart(f.skill[s2Man].pos, losX, feel);
  // A disguise rotates: each defender plays his real job, a step late (`rotatedTarget`).
  const rotation = opts.shown ? { shown: align, real: lookAlignment({ call, shell }, feel, losX, f.skill.map((s) => s.pos), f.sides) } : null;
  const rot = (i: number, tt: number, target: Vec) => rotatedTarget(rotation, i, tt, target, feel);
  // ...and whoever rotates reads the throw a little later.
  coverP.forEach((p, i) => (coverP[i] = { ...p, ballReactionTime: p.ballReactionTime + rotationReadDelay(rotation, i, feel) }));
  let cover = f.skill.map((s, i) =>
    startCoverage(
      align.cover[i],
      s.pos,
      coveredByLinebacker(i) ? 1 : rollCornerSpeed(1, d.cbSpeedVariance, rng.next()),
    ),
  );
  /** Who defender i is following before the throw: his man, or LB2's zone spot. */
  /** Receivers out on a route (a blocking TE is nobody's in a zone). */
  const live = () => runners.filter((_, i) => !(i === TE && teBlocks)).map((r) => r.pos);
  const jobTarget = (i: number) =>
    tripsJob && i === 2 ? zoneTarget(tripsJob, live(), feel) : jobs ? zoneTarget(jobs[i], live(), feel) : i === TE && job === 'drop' ? zoneSpot : runners[i].pos;
  const coverTarget = (i: number) => (jumper && i === jumper.cover ? jumpTarget(jobTarget(i), jumper.spot, feel) : jobTarget(i));
  const KS = [0, 1] as const;
  let safeties: Vec[] = [...align.safeties];
  // A-c: the bracketing S2 lines up deep over the hot receiver (the tell).
  if (bracket !== null) safeties[1] = bracketTarget(f.skill[bracket].pos, losX, feel);
  const safetyPlayers = [def?.safety ?? null, def?.safety2 ?? null];
  const qbStart = f.qb;
  const qbAt = (t: number) => {
    const u = Math.min(1, t / Math.max(0.01, feel.pocket.dropbackTime));
    return { x: qbStart.x - feel.pocket.dropbackYards * (1 - (1 - u) * (1 - u)), y: qbStart.y };
  };
  const tk = feel.tackling;
  const safetyParams = KS.map((k) => {
    const base = jobs ? zoneBallReaction(jobs[5 + k], feel) : safetyBaseReaction(feel, shell, k);
    const sp = safetyParamsFor(feel, losX, shell, k, def ? safetyReadTime(safetyPlayers[k], base, R) : base);
    const late = rotationReadDelay(rotation, 5 + k, feel);
    return { ...sp, ballReactionTime: sp.ballReactionTime + late, ...(sp.frontBallReactionTime !== undefined && { frontBallReactionTime: sp.frontBallReactionTime + late }) };
  });
  // A-c: the bracketing S2 plays deep, so he reads and breaks like a two-deep half safety.
  if (bracket !== null) {
    const read = feel.defense.twoDeepBallReactionTime;
    safetyParams[1] = safetyParamsFor(feel, losX, 'twoDeep', 1, def ? safetyReadTime(safetyPlayers[1], read, R) : read);
  }
  // Trips check: S2 down on the slot reads like the robber on throws to his man, like a help defender on the rest.
  if (s2Man !== null) safetyParams[1] = safetyParamsFor(feel, losX, 'robber', 1, def ? safetyReadTime(safetyPlayers[1], d.robberBallReactionTime, R) : d.robberBallReactionTime);
  if (s2Man !== null && shot.to !== s2Man) safetyParams[1] = { ...safetyParams[1], ballReactionTime: Math.max(safetyParams[1].ballReactionTime, d.cbHelpBallReactionTime) };
  const s2Target = (): Vec | null => (bracket !== null ? bracketTarget(runners[bracket].pos, losX, feel) : s2Man !== null ? tripsSafetyTarget(runners[s2Man].pos, feel) : null);


  // A blitzing linebacker runs at the QB instead of covering the RB (nobody blocks him).
  type Cov = (typeof cover)[number];
  const stepLb = (c: Cov, tt: number): Cov => ({ ...c, pos: stepBlitzer(c.pos, qbAt(tt), tt, dt, feel) });
  // The pass rush (own dice, so the pass rolls the same whatever the line does).
  const rng2 = createRng((seed ^ 0x5bd1e995) >>> 0);
  const pk = feel.pocket;
  // TE in to block: he helps on the edge on his side (first, so the centre helps someone else), or picks up LB2 if he blitzes.
  const te = opts.offense?.[TE];
  const sheds = lineShedTimes(opts.line, def?.rush, false, pk, () => rng2.next(), R);
  if (job === 'drop' && teBlocks) {
    const extra = teHelpFor(te, def?.rush?.[TE_SIDE_RUSHER], false, pk.teProtectTime, R);
    sheds.shedAt = sheds.shedAt.map((t) => t + extra);
  }
  let rushers: Rusher[] = f.rush.map((pos, i) => ({ pos: { ...pos }, shedAt: sheds.shedAt[i] }));
  let lb2Rush: Rusher | null =
    job === 'blitz'
      ? {
          pos: { ...cover[TE].pos },
          // Spread: no TE to pick him up.
          shedAt: spreadChk ? feel.formations.spreadBlitzFreeTime : shedTimeFor(te, def?.cover[TE], false, { shedTime: pk.tePickupTime, shedTimeVariance: pk.shedTimeVariance }, rng2.next() * 2 - 1, () => rng2.next(), R),
        }
      : null;
  const rushP = { blockedSpeed: pk.rushBlockedSpeed, freeSpeed: pk.rushFreeSpeed, sackReachYards: pk.sackReachYards };
  let sacked = false;
  let t = 0;
  for (; t < shot.throwAt - 1e-9; t += dt) {
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, run[i]));
    cover = cover.map((c, i) => (blitz && i === RB ? stepLb(c, t + dt) : i === TE && lb2Rush ? c : stepCoverage(c, rot(i, t, coverTarget(i)), dt, coverP[i])));
    safeties = safeties.map((s, k) =>
      k === 1 && s2Target()
        ? stepZoneSafety(s, s2Target()!, dt, safetyParams[k])
        : jobs
          ? stepZoneSafety(s, rot(5 + k, t, zoneTarget(jobs[5 + k], live(), feel)), dt, safetyParams[k])
          : stepSafety(s, runners.map((r) => r.pos), dt, safetyParams[k], undefined, (p) => rot(5 + k, t, p)),
    );
    const q = qbAt(t + dt);
    rushers = rushers.map((r) => stepRusher(r, q, t + dt, dt, rushP));
    if (lb2Rush) {
      lb2Rush = stepRusher(lb2Rush, q, t + dt, dt, rushP);
      cover[TE] = { ...cover[TE], pos: lb2Rush.pos };
    }
    if (reachedQb(lb2Rush ? [...rushers, lb2Rush] : rushers, q, rushP)) sacked = true;
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
    cover = cover.map((c, i) =>
      i === TE && lb2Rush
        ? c
        : stepCoverage(c, rot(i, t + e, coverTarget(i)), dt, coverP[i], (jobs && i !== jumper?.cover && !breaksOn(jobs[i], landing, feel)) || (tripsJob && i === 2 && !breaksOn(tripsJob, landing, feel)) ? undefined : { landing, sinceThrow: e + dt, help: !zone && i !== shot.to }),
    );
    safeties = safeties.map((s, k) => {
      const ball = !jobs || breaksOn(jobs[5 + k], landing, feel) ? { landing, sinceThrow: e + dt } : undefined;
      const own = k === 1 ? s2Target() : null;
      if (own) return stepZoneSafety(s, own, dt, safetyParams[k], { landing, sinceThrow: e + dt });
      return jobs
        ? stepZoneSafety(s, rot(5 + k, t + e, zoneTarget(jobs[5 + k], live(), feel)), dt, safetyParams[k], ball)
        : stepSafety(s, runners.map((r) => r.pos), dt, safetyParams[k], ball, (p) => rot(5 + k, t + e, p));
    });
    rushers = rushers.map((r) => stepRusher(r, qb, t + e + dt, dt, rushP));
  }
  const ca = feel.catching;
  // A blocking TE isn't a receiver: he can't catch it (kept far away).
  const wrSpots = runners.map((r, i) =>
    i === TE && teBlocks ? OFF_FIELD : i === shot.to ? receiverInFlight(r.pos, atLanding[i], landing, duration, ca.receiverAdjustYards, ca.receiverAdjustSpeed) : r.pos,
  );
  const cbSpots = [...cover.map((c) => c.pos), ...safeties];
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
    zone: cover.map((_, i) => zone || (i === TE && job === 'drop') || i === jumper?.cover || (trips && i === 2)),
    under: jobs ? jobs.map((j, i) => contestsAsHelp(j, landing, feel) && i !== jumper?.cover) : trips ? cover.map((_, i) => i === 2) : undefined,
    ...(s2Man !== null && { covers: [undefined, undefined, undefined, undefined, undefined, undefined, s2Man] }),
    ...(opts.offense && {
      receiverCatch: opts.offense.map((p) => receiverCatchChance(p, ca.receiverCatchChance, R) * offTargetCatchFactor(miss, ca.catchRadiusYards, R)),
      contested: opts.offense.map((p) => contestedCatchRatio(p, R)),
    }),
    ...(def && (() => {
      const all = [...def.cover, ...safetyPlayers].map((p) => contestMods(p, R));
      return { breakup: all.map((m) => m.breakup), intercept: all.map((m) => m.intercept), hold: all.map((m) => m.hold) };
    })()),
  });
  const nearestDefender = Math.min(...cbSpots.map((c) => Math.hypot(c.x - landing.x, c.y - landing.y)));
  const out = { result: pass.result, separation: nearestDefender, defender: pass.defender, miss, sacked, landing };
  if (!opts.afterCatch || sacked || pass.result !== 'catch') return out;

  // Run after the catch, like the game: every defender chases (the rushers too: on a pass nobody blocks them any more).
  const at = wrSpots[shot.to];
  const isRb = shot.to === RB;
  const isTe = shot.to === TE;
  const catcher = opts.offense?.[shot.to] ?? undefined;
  const role = isRb ? 'RB' : isTe ? 'TE' : 'WR';
  const pursuers: Pursuer[] = [
    ...cover.map((c, i) =>
      pursuerFor(def?.cover[i] ?? undefined, coveredByLinebacker(i) ? 'LB' : 'CB', { pos: { ...c.pos }, speed: coveredByLinebacker(i) ? d.lbPursuitSpeed : tk.dbPursuitSpeed, stunned: 0 }, R),
    ),
    ...safeties.map((s, k) => pursuerFor(safetyPlayers[k] ?? undefined, 'S', { pos: { ...s }, speed: tk.dbPursuitSpeed, stunned: 0 }, R)),
    ...rushers.map((r, i) => pursuerFor(def?.rush?.[i] ?? undefined, 'DL', { pos: { ...r.pos }, speed: tk.dlPursuitSpeed, stunned: 0 }, R)),
  ];
  const carry = carryFor(catcher, role, { ...feel.running, runSpeed: isRb ? feel.runGame.rbRunSpeed : isTe ? feel.running.teRunSpeed : feel.running.runSpeed }, R);
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
