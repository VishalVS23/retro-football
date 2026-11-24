/**
 * A whole run play simulated headless (no Phaser), built from the same pure pieces the game uses.
 * Used by the balance tests now, and a starting point for the league sim (stage 4).
 */
import type { Feel } from '../config/feel';
import { formation } from './formation';
import { RB, TE, coveredByLinebacker, routePath, startRunner, stepRunner, type PlayDef } from './routes';
import { startCoverage, stepCoverage, stepZoneSafety } from './defense';
import { isZoneCall, zoneCoverScale, zoneJobs, zoneTarget } from './zone';
import { canTackle, startChase, stepChase, tryJuke, type Pursuer } from './carry';
import { laneSteer, pathYAt, reachedHandoff, stepRunRusher } from './run';
import { createRng } from './rng';
import { cornerStart, coverParams, safetyParamsFor, safetyRunRead, safetyStart, zoneParams, type ShellId, linebacker2Start, linebackerStart, stepBlitzer, type DefCallId } from './defCalls';
import { TE_SIDE_RUSHER, carryFor, lineShedTimes, pointOfAttack, pursuerFor, tackleFor, teHelpFor } from './runRatings';
import type { Player } from '../players/player';

/** Who's on the field (ratings, 3e-a). Anyone missing plays as an average starter. */
export interface RunPlayers {
  rb?: Player;
  /** Their corners and linebackers, in formation order (CB1, CB3, CB2, LB1, LB2). */
  cover?: (Player | undefined)[];
  safety?: Player;
  /** S2, the bottom-half safety (3h-c). */
  safety2?: Player;
  /** Their four rushers, formation order. */
  rush?: (Player | undefined)[];
  /** Our five blockers, formation order (`BLOCKER_OF[i]` blocks rusher i). */
  line?: (Player | undefined)[];
  /** Our tight end (3h-b): he blocks on runs, helping on the edge on his side. */
  te?: Player;
}

const dt = 1 / 60;

/**
 * Headless run play, built from the same pure pieces the game uses: everyone lines up, the RB
 * takes the handoff, then follows his lane (never jukes) until the play ends. Returns yards gained.
 */
/**
 * `jukeYards`: like a player would, juke away from a defender who gets this close in front of him
 * (0 = never juke).
 */
/**
 * `holdSteer`: instead of following the lane, hold the steering this way the whole run (-1 up .. +1 down),
 * or a function of the time since the handoff (e.g. flip up/down every 0.2 s to zig-zag).
 */
export function simulateRun(
  p: PlayDef,
  seed: number,
  feel: Feel,
  jukeYards = 0,
  losX = 45,
  holdSteer?: number | ((t: number) => number),
  call: DefCallId = 'man',
  players: RunPlayers = {},
  shell: ShellId = 'twoDeep',
): { yards: number; by: number; broken: number } {
  const rng = createRng(seed);
  const f = formation(losX);
  const paths = f.skill.map((s, i) => routePath(s.pos, p.routes[i], s.towardMiddle));
  let runners = paths.map((path, i) => startRunner(path, p.routes[i].stop));
  const d = feel.defense;
  const blitz = call === 'blitz';
  const { cb: cbCover, lb: lbCover } = coverParams(call, feel, losX, true);
  // Zone call (Z-a): before the handoff everyone drops toward his area (corners bail, LBs to their spots).
  const jobs = isZoneCall(call) ? zoneJobs(call, feel, losX) : null;
  if (jobs) shell = 'robber';
  const zoneP = (i: number) => {
    const base = zoneParams(coveredByLinebacker(i) ? lbCover : cbCover);
    return { ...base, topSpeed: base.topSpeed * zoneCoverScale(jobs![i], feel).speedRatio };
  };
  const live = () => runners.filter((_, i) => !p.routes[i].block).map((r) => r.pos);
  let safeties = ([0, 1] as const).map((k) => safetyStart(feel, losX, shell, k));
  const sp = ([0, 1] as const).map((k) => safetyParamsFor(feel, losX, shell, k, 0));
  let cover = f.skill.map((s, i) =>
    startCoverage(i === RB ? linebackerStart(call, feel, losX) : i === TE ? linebacker2Start(feel, losX) : cornerStart(call, feel, s.pos), s.pos),
  );
  const rg = feel.runGame;
  const holeY = pathYAt(paths[RB], losX);
  const teHelp = { rusher: TE_SIDE_RUSHER, time: teHelpFor(players.te, players.rush?.[TE_SIDE_RUSHER], true, rg.teHelpTime, feel.ratings) };
  const sheds = lineShedTimes(players.line, players.rush, true, rg, () => rng.next(), feel.ratings, pointOfAttack(f.rush.map((r) => r.y), holeY), teHelp);
  let rushers = f.rush.map((pos, i) => ({ pos: { ...pos }, shedAt: sheds.shedAt[i] }));
  let t = 0;
  while (!reachedHandoff(runners[RB]) && t < 3) {
    t += dt;
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, feel.routes));
    // A blitzing linebacker shoots his gap, straight at the QB (a run away from him gets outside him).
    cover = cover.map((c, i) =>
      blitz && i === RB
        ? { ...c, pos: stepBlitzer(c.pos, f.qb, t, dt, feel) }
        : jobs
          ? stepCoverage(c, zoneTarget(jobs[i], live(), feel), dt, zoneP(i))
          : stepCoverage(c, runners[i].pos, dt, coveredByLinebacker(i) ? lbCover : cbCover),
    );
    if (jobs) safeties = safeties.map((v, k) => stepZoneSafety(v, zoneTarget(jobs[5 + k], live(), feel), dt, sp[k]));
    rushers = rushers.map((r) => stepRunRusher(r, runners[RB].pos, t, dt, { driveSpeed: rg.driveSpeed, freeSpeed: feel.pocket.rushFreeSpeed }, holeY));
  }
  const tk = feel.tackling;
  const R = feel.ratings;
  const pursuers: Pursuer[] = [
    ...cover.map((c, i) =>
      pursuerFor(
        players.cover?.[i],
        coveredByLinebacker(i) ? 'LB' : 'CB',
        {
          pos: { ...c.pos },
          speed: coveredByLinebacker(i) ? d.lbPursuitSpeed : tk.dbPursuitSpeed,
          stunned: 0,
          // A blitzer is already coming: no read.
          wait: (i === RB ? (blitz ? 0 : rg.lbReadTime) : i === TE ? rg.lbReadTime : rg.cbReadTime) + (jobs && jobs[i].kind === 'under' ? feel.zone.underRunReadTime : 0),
        },
        R,
      ),
    ),
    ...([0, 1] as const).map((k) =>
      pursuerFor(k ? players.safety2 : players.safety, 'S', { pos: { ...safeties[k] }, speed: tk.dbPursuitSpeed, stunned: 0, wait: safetyRunRead(feel, shell) + (jobs && jobs[5 + k].kind === 'under' ? feel.zone.underRunReadTime : 0) }, R),
    ),
    ...rushers.map((r, i) =>
      pursuerFor(players.rush?.[i], 'DL', { pos: { ...r.pos }, speed: tk.dlPursuitSpeed, stunned: 0, held: Math.max(0, r.shedAt - t) }, R),
    ),
  ];
  let s = startChase(runners[RB].pos, pursuers);
  const params = {
    carry: carryFor(players.rb, 'RB', { ...feel.running, runSpeed: rg.rbRunSpeed }, R),
    pursuit: { reactionTime: tk.pursuitReactionTime, leadTime: tk.pursuitLeadTime, readWindow: tk.pursuitReadWindow, driveSpeed: rg.driveSpeed },
    tackle: tackleFor(players.rb, 'RB', tk, R),
    graceTime: tk.catchGraceTime,
    dirX: 1 as const,
  };
  let lastBy = -1;
  let broken = 0;
  for (let i = 0; i < 60 * 15; i++) {
    const steer = typeof holdSteer === 'function' ? holdSteer(s.t) : holdSteer ?? laneSteer(s.carrier.pos, paths[RB], rg.laneLookAheadYards, rg.laneFullSteerYards);
    if (jukeYards > 0) {
      const c = s.carrier.pos;
      const threat = s.pursuers.find((d) => canTackle(d) && d.pos.x > c.x - 0.5 && Math.hypot(d.pos.x - c.x, d.pos.y - c.y) < jukeYards);
      if (threat) s = { ...s, carrier: tryJuke(s.carrier, Math.sign(c.y - threat.pos.y) || 1, params.carry) };
    }
    const step = stepChase(s, steer, dt, params, () => rng.next());
    s = step.state;
    if (step.missed) broken++;
    if (step.end) {
      if (step.end === 'tackled') lastBy = nearest(s);
      break;
    }
  }
  return { yards: s.carrier.pos.x - losX, by: lastBy, broken };
}

/** Index of the pursuer nearest the carrier (who made the tackle). */
function nearest(s: { carrier: { pos: { x: number; y: number } }; pursuers: Pursuer[] }) {
  let best = -1;
  let bestD = Infinity;
  s.pursuers.forEach((d, i) => {
    const k = Math.hypot(d.pos.x - s.carrier.pos.x, d.pos.y - s.carrier.pos.y);
    if (k < bestD) {
      bestD = k;
      best = i;
    }
  });
  return best;
}
