/**
 * A whole run play simulated headless (no Phaser), built from the same pure pieces the game uses.
 * Used by the balance tests now, and a starting point for the league sim (stage 4).
 */
import type { Feel } from '../config/feel';
import { FIELD_WIDTH } from './field';
import { formation } from './formation';
import { RB, routePath, startRunner, stepRunner, type PlayDef } from './routes';
import { startCoverage, stepCoverage } from './defense';
import { canTackle, startChase, stepChase, tryJuke, type Pursuer } from './carry';
import { laneSteer, reachedHandoff, stepRunRusher } from './run';
import { createRng } from './rng';
import { cornerStart, coverParams, linebackerStart, stepBlitzer, type DefCallId } from './defCalls';

const dt = 1 / 60;
const mid = FIELD_WIDTH / 2;

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
): { yards: number; by: number } {
  const rng = createRng(seed);
  const f = formation(losX);
  const paths = f.skill.map((s, i) => routePath(s.pos, p.routes[i], s.towardMiddle));
  let runners = paths.map((path, i) => startRunner(path, p.routes[i].stop));
  const d = feel.defense;
  const blitz = call === 'blitz';
  const { cb: cbCover, lb: lbCover } = coverParams(call, feel, losX, true);
  let cover = f.skill.map((s, i) => startCoverage(i === RB ? linebackerStart(call, feel, losX) : cornerStart(call, feel, s.pos), s.pos));
  const rg = feel.runGame;
  let rushers = f.rush.map((pos) => ({ pos: { ...pos }, shedAt: rg.shedTime + (rng.next() * 2 - 1) * rg.shedTimeVariance }));
  let t = 0;
  while (!reachedHandoff(runners[RB]) && t < 3) {
    t += dt;
    runners = runners.map((r, i) => stepRunner(r, paths[i], dt, feel.routes));
    // A blitzing linebacker shoots his gap, straight at the QB (a run away from him gets outside him).
    cover = cover.map((c, i) =>
      blitz && i === RB ? { ...c, pos: stepBlitzer(c.pos, f.qb, t, dt, feel) } : stepCoverage(c, runners[i].pos, dt, i === RB ? lbCover : cbCover),
    );
    rushers = rushers.map((r) => stepRunRusher(r, runners[RB].pos, t, dt, { driveSpeed: rg.driveSpeed, freeSpeed: feel.pocket.rushFreeSpeed }));
  }
  const tk = feel.tackling;
  const pursuers: Pursuer[] = [
    ...cover.map((c, i) => ({
      pos: { ...c.pos },
      speed: i === RB ? d.lbPursuitSpeed : tk.dbPursuitSpeed,
      stunned: 0,
      // A blitzer is already coming: no read.
      wait: i === RB ? (blitz ? 0 : rg.lbReadTime) : rg.cbReadTime,
    })),
    { pos: { x: losX + d.safetyDepthYards, y: mid }, speed: tk.dbPursuitSpeed, stunned: 0 },
    ...rushers.map((r) => ({ pos: { ...r.pos }, speed: tk.dlPursuitSpeed, stunned: 0, held: Math.max(0, r.shedAt - t) })),
  ];
  let s = startChase(runners[RB].pos, pursuers);
  const params = {
    carry: { ...feel.running, runSpeed: rg.rbRunSpeed },
    pursuit: { reactionTime: tk.pursuitReactionTime, leadTime: tk.pursuitLeadTime, readWindow: tk.pursuitReadWindow, driveSpeed: rg.driveSpeed },
    tackle: tk,
    graceTime: tk.catchGraceTime,
    dirX: 1 as const,
  };
  let lastBy = -1;
  for (let i = 0; i < 60 * 15; i++) {
    const steer = typeof holdSteer === 'function' ? holdSteer(s.t) : holdSteer ?? laneSteer(s.carrier.pos, paths[RB], rg.laneLookAheadYards, rg.laneFullSteerYards);
    if (jukeYards > 0) {
      const c = s.carrier.pos;
      const threat = s.pursuers.find((d) => canTackle(d) && d.pos.x > c.x - 0.5 && Math.hypot(d.pos.x - c.x, d.pos.y - c.y) < jukeYards);
      if (threat) s = { ...s, carrier: tryJuke(s.carrier, Math.sign(c.y - threat.pos.y) || 1, params.carry) };
    }
    const step = stepChase(s, steer, dt, params, () => rng.next());
    s = step.state;
    if (step.end) {
      if (step.end === 'tackled') lastBy = nearest(s);
      break;
    }
  }
  return { yards: s.carrier.pos.x - losX, by: lastBy };
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
