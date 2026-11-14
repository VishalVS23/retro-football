import Phaser from 'phaser';
import { feel } from '../config/feel';
import { END_ZONE_DEPTH, FIELD_WIDTH, TOTAL_LENGTH, isInBounds, yardLineNumber } from '../sim/field';
import {
  AIM_SLINGSHOT,
  aimTarget,
  arcPoints,
  ballAt,
  makeThrow,
  type Throw,
  type Vec,
} from '../sim/throw';
import { ROUTES, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, type Runner } from '../sim/routes';
import {
  blockerSpot,
  closestRusher,
  isFree,
  reachedQb,
  resolvePass,
  startCoverage,
  stepCoverage,
  stepRusher,
  type Coverage,
  type Rusher,
} from '../sim/defense';
import {
  GOAL_LINE_X,
  checkTackles,
  playEnd,
  remember,
  startCarrier,
  stepCarrier,
  stepPursuers,
  tryJuke,
  type Carrier,
  type Pursuer,
  type Sightings,
} from '../sim/carry';
import { OPP_GOAL_X, applyPlay, downText, newGame, spotText, type GameState, type PlayOutcome } from '../sim/drive';
import { getRngOrFallback } from '../save/saveSession';
import { FEEL_CHANGE_EVENT } from '../debug/feelPanel';

// Placeholder colours only. The real art comes in stage 13.
const COLORS = {
  turf: 0x2f6b4f,
  turfAlt: 0x2a6247,
  endZone: 0x1f4d63,
  line: 0xf4efe1,
  team: 0xe76f51,
  defense: 0x3a6ea5,
  outline: 0xf4efe1,
  ball: 0x8a5a2b,
  shadow: 0x000000,
  aim: 0xffd166,
  scrimmage: 0x7ec8e3,
  firstDown: 0xffd23f,
  route: 0xffd166,
  routeOutline: 0x0d1b2a,
};

// Formation (football layout, not feel), lined up on the current line of scrimmage.
const WR_TOWARD_MIDDLE = 1; // he lines up above the middle, so "inside" is +y
const PLAYER_RADIUS = 0.9; // placeholder art size, yards
const MIN_DRAG_PX = 10; // smaller drags count as a tap, not a throw
const PRESSURE_COLOR = 0xff3b3b;
const RUSHER_COUNT = 2;

/** Where everyone lines up for a snap at losX: QB under centre, one WR, two rushers with a blocker each. */
function formation(losX: number) {
  const rush: Vec[] = [
    { x: losX + 1, y: FIELD_WIDTH / 2 - 3 },
    { x: losX + 1, y: FIELD_WIDTH / 2 + 3 },
  ];
  return {
    qb: { x: losX - 2, y: FIELD_WIDTH / 2 },
    wr: { x: losX - 0.5, y: FIELD_WIDTH / 2 - 12 },
    rush,
    block: rush.map((r) => ({ x: losX - 1, y: r.y })),
  };
}

type State = 'presnap' | 'live' | 'windup' | 'flight' | 'run' | 'result';
const JUKE_MIN_PX = 25; // a flick must move at least this far to count as a juke

/** Draws the field in "yard" units; the camera zoom turns yards into screen pixels. */
export class FieldScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  private qb!: Phaser.GameObjects.Arc;
  private wr!: Phaser.GameObjects.Arc;
  private cb!: Phaser.GameObjects.Arc;
  private safety!: Phaser.GameObjects.Arc;
  private safetyPos: Vec = { x: 0, y: 0 };
  // After the catch:
  private carrier: Carrier = startCarrier({ x: 0, y: 0 });
  private pursuers: Pursuer[] = [];
  private pursuerDots: Phaser.GameObjects.Arc[] = [];
  private sightings: Sightings = [];
  private runTime = 0;
  private steer = 0;
  private steerTouch: { id: number; x: number; y: number; time: number } | null = null;
  private hitPauseLeft = 0;
  private banner: Phaser.GameObjects.Text | null = null;
  private rusherDots: Phaser.GameObjects.Arc[] = [];
  private blockerDots: Phaser.GameObjects.Arc[] = [];
  private coverage!: Coverage;
  private rushers: Rusher[] = [];
  private ball!: Phaser.GameObjects.Ellipse;
  private shadow!: Phaser.GameObjects.Ellipse;
  private aimG!: Phaser.GameObjects.Graphics;
  private routeG!: Phaser.GameObjects.Graphics;

  // Downs, distance and score (rules live in sim/drive.ts).
  private match: GameState = newGame();
  private form = formation(newGame().ballX);
  private scoreboard!: Phaser.GameObjects.Text;
  private markersG!: Phaser.GameObjects.Graphics;

  private state: State = 'presnap';
  private playTime = 0; // seconds since the snap
  private routeIndex = 0;
  private path: Vec[] = [];
  private runner: Runner = startRunner([this.form.wr]);
  private qbPos: Vec = { ...this.form.qb };
  private aimPointerId: number | null = null;
  private aimStart = { x: 0, y: 0 };
  private aimDrag: { x: number; y: number } | null = null;
  private target: Vec | null = null;
  private queuedTarget: Vec | null = null; // released before the earliest throw time
  private currentThrow: Throw | null = null;
  private flightElapsed = 0;
  private wrAtLanding: Vec = { ...this.form.wr }; // where his route takes him when the ball lands
  private underPressure = false;
  private resetTimer: Phaser.Time.TimerEvent | null = null;
  private cameraFocus: Vec = { ...this.form.qb };

  constructor() {
    super('field');
  }

  create() {
    this.drawField();

    this.markersG = this.add.graphics().setDepth(0.5); // line of scrimmage + first-down line
    this.routeG = this.add.graphics().setDepth(1);
    this.aimG = this.add.graphics().setDepth(4);
    this.shadow = this.add.ellipse(0, 0, 1, 0.6, COLORS.shadow, 0.35).setDepth(1);
    this.qb = this.add.circle(0, 0, PLAYER_RADIUS, COLORS.team).setStrokeStyle(0.2, COLORS.outline).setDepth(2);
    this.wr = this.add.circle(0, 0, PLAYER_RADIUS, COLORS.team).setStrokeStyle(0.2, COLORS.outline).setDepth(2);
    const dot = (color: number) => this.add.circle(0, 0, PLAYER_RADIUS, color).setStrokeStyle(0.2, COLORS.outline).setDepth(2);
    this.cb = dot(COLORS.defense);
    this.safety = dot(COLORS.defense);
    this.rusherDots = Array.from({ length: RUSHER_COUNT }, () => dot(COLORS.defense));
    this.blockerDots = Array.from({ length: RUSHER_COUNT }, () => dot(COLORS.team));
    this.ball = this.add.ellipse(0, 0, 1, 0.7, COLORS.ball).setStrokeStyle(0.08, COLORS.outline).setDepth(3);

    this.label = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f4efe1',
        backgroundColor: '#14202bcc',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(10);

    // Scoreboard bar, top centre (placeholder style until the UI kit pass).
    this.scoreboard = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#f4efe1',
        backgroundColor: '#0d1b2aee',
        padding: { x: 10, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.resetPlay();
    this.fitCamera();
    this.cameras.main.centerOn(this.cameraFocus.x, this.cameraFocus.y);
    this.scale.on('resize', () => this.fitCamera());

    // React live when a value changes in the feel panel.
    const onFeelChange = () => {
      this.fitCamera();
      this.updateLabel();
      this.sizeBall();
    };
    window.addEventListener(FEEL_CHANGE_EVENT, onFeelChange);
    this.events.once('shutdown', () => window.removeEventListener(FEEL_CHANGE_EVENT, onFeelChange));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.1); // avoid huge jumps after a pause
    if (this.hitPauseLeft > 0) {
      this.hitPauseLeft -= dt; // freeze-frame on a big hit
      return;
    }
    if (this.state === 'run') this.stepRun(dt);

    const playing = this.state === 'live' || this.state === 'windup' || this.state === 'flight';
    if (playing) {
      this.playTime += dt;
      this.runner = stepRunner(this.runner, this.path, dt, feel.routes);
      this.updateQbDropback();
      this.stepDefense(dt);
    }

    if (this.state === 'live') {
      if (this.aimDrag) this.updateAim();
      if (this.queuedTarget && this.playTime >= feel.throw.earliestRelease) {
        const t = this.queuedTarget;
        this.queuedTarget = null;
        this.startWindup(t);
      } else if (!this.underPressure && closestRusher(this.rushers, this.qbPos) <= feel.pocket.pressureYards) {
        this.underPressure = true;
        this.qb.setStrokeStyle(0.3, PRESSURE_COLOR);
      }
      if (this.state === 'live' && reachedQb(this.rushers, this.qbPos, this.rushParams())) this.sack();
    }

    let wrPos = this.runner.pos;
    if (this.state === 'flight' && this.currentThrow) {
      this.flightElapsed += dt;
      const b = ballAt(this.currentThrow, this.flightElapsed);
      this.drawBall(b.x, b.y, b.h);
      wrPos = this.receiverPosition();
      this.cameraFocus = { x: b.x + feel.camera.leadYards, y: b.y };
      if (b.done) {
        this.wr.setPosition(wrPos.x, wrPos.y);
        this.resolveThrow();
      }
    } else if (playing) {
      this.cameraFocus = {
        x: (this.qbPos.x + wrPos.x) / 2 + feel.camera.leadYards,
        y: (this.qbPos.y + wrPos.y) / 2,
      };
    }
    if (playing) this.wr.setPosition(wrPos.x, wrPos.y);

    // Camera eases toward its focus point (frame-rate independent).
    const cam = this.cameras.main;
    const k = 1 - Math.pow(1 - feel.camera.followLerp, dt * 60);
    cam.scrollX += (this.cameraFocus.x - cam.width / 2 - cam.scrollX) * k;
    cam.scrollY += (this.cameraFocus.y - cam.height / 2 - cam.scrollY) * k;
  }

  // ---------- Input ----------

  private onDown(p: Phaser.Input.Pointer) {
    if (this.state === 'run') {
      // Any thumb steers the runner (drag up/down); a quick flick jukes.
      this.steerTouch = { id: p.id, x: p.x, y: p.y, time: this.time.now };
      return;
    }
    if (this.state === 'result') {
      this.resetPlay(); // tap to skip
      return;
    }
    if (this.state === 'presnap') this.snap(); // tap anywhere to snap
    // Aim with the right thumb (the same touch that snapped can start aiming straight away).
    if (this.state === 'live' && this.aimPointerId === null && p.x >= this.scale.width / 2) {
      this.aimPointerId = p.id;
      this.aimStart = { x: p.x, y: p.y };
      this.aimDrag = null;
      this.target = null;
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (this.state === 'run' && this.steerTouch && p.id === this.steerTouch.id) {
      const full = Math.max(1, this.scale.height * feel.running.steerDragRatio);
      this.steer = Math.max(-1, Math.min(1, (p.y - this.steerTouch.y) / full));
      return;
    }
    if (this.state !== 'live' || p.id !== this.aimPointerId) return;
    this.aimDrag = { x: p.x - this.aimStart.x, y: p.y - this.aimStart.y };
    this.updateAim();
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.steerTouch && p.id === this.steerTouch.id) {
      const t = this.steerTouch;
      this.steerTouch = null;
      this.steer = 0;
      const dy = p.y - t.y;
      const quick = (this.time.now - t.time) / 1000 <= feel.running.jukeFlickTime;
      if (this.state === 'run' && quick && Math.abs(dy) >= JUKE_MIN_PX && Math.abs(dy) > Math.abs(p.x - t.x)) {
        this.carrier = tryJuke(this.carrier, Math.sign(dy), this.carryParams());
      }
      return;
    }
    if (p.id !== this.aimPointerId) return;
    this.aimPointerId = null;
    this.aimDrag = null;
    this.aimG.clear();
    if (this.state !== 'live' || !this.target) return; // just a tap: nothing thrown
    if (this.playTime < feel.throw.earliestRelease) this.queuedTarget = this.target;
    else this.startWindup(this.target);
  }

  /** Recomputes the target from the current drag (the QB keeps moving while you aim). */
  private updateAim() {
    const d = this.aimDrag;
    if (!d || Math.hypot(d.x, d.y) < MIN_DRAG_PX) {
      this.target = null;
      this.aimG.clear();
      return;
    }
    this.target = aimTarget(this.qbPos, d.x, d.y, this.scale.height, {
      mode: feel.throw.aimMode,
      dragForMaxRatio: feel.throw.aimDragForMaxRatio,
      maxDistanceYards: feel.throw.maxDistanceYards,
    });
    this.drawAimPreview(this.target);
  }

  // ---------- Play flow ----------

  private snap() {
    this.state = 'live';
    this.playTime = 0;
    this.routeG.clear(); // route lines hide on the snap
    this.updateLabel();
  }

  /** QB eases back into the pocket after the snap. */
  private updateQbDropback() {
    const u = Math.min(1, this.playTime / Math.max(0.01, feel.pocket.dropbackTime));
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const start = this.form.qb;
    this.qbPos = { x: start.x - feel.pocket.dropbackYards * eased, y: start.y };
    this.qb.setPosition(this.qbPos.x, this.qbPos.y);
  }

  private startWindup(target: Vec) {
    this.state = 'windup';
    const sq = feel.throw.windupSquashRatio;
    let released = false;
    this.tweens.add({
      targets: this.qb,
      scaleX: 1 + sq,
      scaleY: 1 - sq,
      duration: Math.max(1, feel.throw.windupTime * 1000),
      ease: 'Quad.easeOut',
      yoyo: true,
      onYoyo: () => {
        released = true;
        this.releaseBall(target);
      },
      onComplete: () => {
        if (!released) this.releaseBall(target);
      },
    });
  }

  private releaseBall(target: Vec) {
    this.currentThrow = makeThrow({ ...this.qbPos }, target, feel.throw, feel.throw.arcHeightRatio);
    this.flightElapsed = 0;
    this.wrAtLanding = runnerAfter(this.runner, this.path, this.currentThrow.duration, feel.routes).pos;
    this.state = 'flight';
    this.ball.setVisible(true);
    this.shadow.setVisible(true);
    // Landing marker stays on the turf while the ball is in the air.
    this.aimG.clear();
    this.drawLandingMarker(target, 0.8);
  }

  /** Receiver keeps running his route, drifting toward the ball while it's in the air. */
  private receiverPosition(): Vec {
    if (!this.currentThrow) return this.runner.pos;
    return receiverInFlight(
      this.runner.pos,
      this.wrAtLanding,
      this.currentThrow.to,
      this.flightElapsed,
      feel.catching.receiverAdjustYards,
      feel.catching.receiverAdjustSpeed,
    );
  }

  private resolveThrow() {
    const th = this.currentThrow!;
    const wrPos = this.receiverPosition();
    this.aimG.clear();
    this.state = 'result';

    let result = resolvePass(wrPos, this.coverage.pos, th.to, getRngOrFallback().next(), {
      catchRadiusYards: feel.catching.catchRadiusYards,
      contestRadiusYards: feel.defense.contestRadiusYards,
      breakupChance: feel.defense.breakupChance,
      interceptChance: feel.defense.interceptChance,
      receiverCatchChance: feel.catching.receiverCatchChance,
      defenderCatchChance: feel.defense.defenderCatchChance,
    });

    // A catch only counts with the catcher's feet (centre of his circle) in bounds.
    const catcher = result === 'catch' ? wrPos : result === 'interception' ? this.coverage.pos : null;
    if (catcher && !isInBounds(catcher)) {
      result = 'incomplete';
      this.floatText(catcher.x, catcher.y - 2, 'OUT OF BOUNDS', '#f4efe1');
    }

    if (result === 'interception') {
      this.ball.setVisible(false);
      this.shadow.setVisible(false);
      this.popPlayer(this.cb);
      this.shakeScreen();
      this.showBanner('INTERCEPTED');
    } else if (result === 'droppedInt' || result === 'drop') {
      // Ball clanks off the player's hands and bounces away.
      const who = result === 'drop' ? wrPos : this.coverage.pos;
      this.skidBall(th.to, { x: th.to.x - th.from.x + (th.to.y - who.y), y: th.to.y - th.from.y });
      this.showBanner(result === 'drop' ? 'DROPPED' : 'LUCKY!');
    } else if (result === 'breakup') {
      // Swatted away: the ball pops off sideways from the defender.
      const cb = this.coverage.pos;
      const away = { x: th.to.x - cb.x, y: th.to.y - cb.y };
      this.popPlayer(this.cb);
      this.skidBall(th.to, away.x === 0 && away.y === 0 ? { x: 0, y: 1 } : away);
      this.showBanner('BROKEN UP');
    } else if (result === 'catch') {
      this.ball.setVisible(false);
      this.shadow.setVisible(false);
      // Catch pop, then control passes to the receiver straight away.
      this.popPlayer(this.wr);
      this.startRun(wrPos);
      return;
    } else {
      this.skidBall(th.to, { x: th.to.x - th.from.x, y: th.to.y - th.from.y });
      this.showBanner('INCOMPLETE');
    }
    this.recordPlay(result === 'interception' ? { kind: 'interception' } : { kind: 'incomplete' });
    this.scheduleReset();
  }

  /**
   * Feeds the play's result into the downs/score rules. Big moments (first down, turnover on
   * downs, safety) replace the play's own banner; the yards popup still shows the gain.
   */
  private recordPlay(outcome: PlayOutcome) {
    const { state, event } = applyPlay(this.match, outcome);
    this.match = state;
    const banner = { firstDown: 'FIRST DOWN!', turnoverOnDowns: 'TURNOVER ON DOWNS', safety: 'SAFETY' } as const;
    if (event === 'firstDown' || event === 'turnoverOnDowns' || event === 'safety') this.showBanner(banner[event]);
    this.updateScoreboard();
  }

  /**
   * Screen shake. Phaser scales shake by the camera zoom twice, and our camera is zoomed way in
   * (1 yard = ~10px), so divide that back out: intensity is then a fraction of the screen width.
   */
  private shakeScreen(mult = 1) {
    const cam = this.cameras.main;
    cam.shake(feel.juice.screenShakeTime * 1000 * mult, (feel.juice.screenShakeIntensity * mult) / (cam.zoom * cam.zoom));
  }

  /** Catch / pick / swat "pop" on a player. */
  private popPlayer(p: Phaser.GameObjects.Arc) {
    this.tweens.add({
      targets: p,
      scale: feel.catching.catchPopScale,
      duration: feel.catching.catchPopTime * 1000,
      ease: 'Back.easeOut',
      yoyo: true,
    });
  }

  /** Dead ball skids along the turf in a direction and fades. */
  private skidBall(from: Vec, dir: Vec) {
    const d = Math.hypot(dir.x, dir.y) || 1;
    const len = feel.ball.skidYards;
    this.ball.setPosition(from.x, from.y);
    this.tweens.add({ targets: this.shadow, alpha: 0, duration: feel.pacing.bannerTime * 500 });
    this.tweens.add({
      targets: this.ball,
      x: from.x + (dir.x / d) * len,
      y: from.y + (dir.y / d) * len,
      alpha: 0,
      duration: feel.pacing.bannerTime * 1000,
      ease: 'Quad.easeOut',
    });
  }

  private rushParams() {
    return {
      blockedSpeed: feel.pocket.rushBlockedSpeed,
      freeSpeed: feel.pocket.rushFreeSpeed,
      sackReachYards: feel.pocket.sackReachYards,
    };
  }

  /** Moves the cornerback, the rushers and our blockers for one frame. */
  private stepDefense(dt: number) {
    const ball =
      this.state === 'flight' && this.currentThrow
        ? { landing: this.currentThrow.to, sinceThrow: this.flightElapsed }
        : undefined;
    this.coverage = stepCoverage(
      this.coverage,
      this.runner.pos,
      dt,
      {
        topSpeed: feel.routes.topSpeed * feel.defense.cbSpeedRatio,
        acceleration: feel.routes.acceleration,
        reactionTime: feel.defense.cbReactionTime,
        cushionYards: feel.defense.cbCushionYards,
        cushionCloseTime: feel.defense.cbCushionCloseTime,
        ballReactionTime: feel.defense.cbBallReactionTime,
        ballSpeedRatio: feel.defense.cbBallSpeedRatio,
      },
      ball,
    );
    this.cb.setPosition(this.coverage.pos.x, this.coverage.pos.y);

    // Safety: sits deep, shading toward the receiver; breaks on the ball once it's thrown.
    const deep = ball
      ? ball.landing
      : { x: this.safetyDepthX(), y: (FIELD_WIDTH / 2 + this.runner.pos.y) / 2 };
    const sSpeed = feel.tackling.dbPursuitSpeed * (ball ? feel.defense.cbBallSpeedRatio : feel.defense.safetyDriftRatio);
    const gap = Math.hypot(deep.x - this.safetyPos.x, deep.y - this.safetyPos.y);
    if (gap > 0) {
      const step = Math.min(gap, sSpeed * dt);
      this.safetyPos = {
        x: this.safetyPos.x + ((deep.x - this.safetyPos.x) / gap) * step,
        y: this.safetyPos.y + ((deep.y - this.safetyPos.y) / gap) * step,
      };
    }
    this.safety.setPosition(this.safetyPos.x, this.safetyPos.y);

    const p = this.rushParams();
    this.rushers = this.rushers.map((r) => stepRusher(r, this.qbPos, this.playTime, dt, p));
    this.rushers.forEach((r, i) => {
      this.rusherDots[i].setPosition(r.pos.x, r.pos.y);
      // Blocker stays in front of his man until beaten, then is left where he was.
      if (!isFree(r, this.playTime)) {
        const spot = blockerSpot(r, this.qbPos, PLAYER_RADIUS * 2);
        this.blockerDots[i].setPosition(spot.x, spot.y);
      }
    });
  }

  private carryParams() {
    return {
      runSpeed: feel.running.runSpeed,
      steerSpeed: feel.running.steerSpeed,
      steerResponse: feel.running.steerResponse,
      jukeSpeed: feel.running.jukeSpeed,
      jukeTime: feel.running.jukeTime,
      jukeCooldown: feel.running.jukeCooldown,
    };
  }

  /** After the catch: the receiver becomes the ball carrier and every defender chases him. */
  private startRun(at: Vec) {
    this.state = 'run';
    this.runTime = 0;
    this.carrier = startCarrier(at);
    this.sightings = remember([], 0, this.carrier, 1);
    const db = feel.tackling.dbPursuitSpeed;
    const dl = feel.tackling.dlPursuitSpeed;
    this.pursuers = [
      { pos: { ...this.coverage.pos }, speed: db, stunned: 0 },
      { pos: { ...this.safetyPos }, speed: db, stunned: 0 },
      ...this.rushers.map((r) => ({ pos: { ...r.pos }, speed: dl, stunned: 0 })),
    ];
    this.pursuerDots = [this.cb, this.safety, ...this.rusherDots];
    this.updateLabel();
  }

  private stepRun(dt: number) {
    this.runTime += dt;
    this.carrier = stepCarrier(this.carrier, this.steer, dt, this.carryParams());
    this.wr.setPosition(this.carrier.pos.x, this.carrier.pos.y);
    this.sightings = remember(this.sightings, this.runTime, this.carrier, 1);
    this.pursuers = stepPursuers(this.pursuers, this.sightings, this.runTime, dt, {
      reactionTime: feel.tackling.pursuitReactionTime,
      leadTime: feel.tackling.pursuitLeadTime,
      runSpeed: feel.running.runSpeed,
    });
    this.pursuers.forEach((d, i) => this.pursuerDots[i].setPosition(d.pos.x, d.pos.y).setAlpha(d.stunned > 0 ? 0.45 : 1));
    this.cameraFocus = { x: this.carrier.pos.x + feel.camera.leadYards, y: this.carrier.pos.y };

    if (this.runTime < feel.tackling.catchGraceTime) {
      const end = playEnd(this.carrier.pos);
      if (end) this.endRun(end);
      return;
    }
    const rng = getRngOrFallback();
    const check = checkTackles(this.pursuers, this.carrier, () => rng.next(), {
      tackleReachYards: feel.tackling.tackleReachYards,
      brokenTackleChance: feel.tackling.brokenTackleChance,
      jukeEvadeChance: feel.tackling.jukeEvadeChance,
      stunTime: feel.tackling.stunTime,
    });
    if (check.missed) {
      this.pursuers = check.pursuers;
      this.floatText(this.carrier.pos.x, this.carrier.pos.y - 2, check.missed === 'juked' ? 'JUKED!' : 'BROKE IT!', '#7ec8e3');
    }
    if (check.tackled) {
      this.endRun('tackled');
      return;
    }
    const end = playEnd(this.carrier.pos);
    if (end) this.endRun(end);
  }

  private endRun(how: 'tackled' | 'out' | 'touchdown') {
    this.state = 'result';
    this.steerTouch = null;
    this.steer = 0;
    const c = this.carrier.pos;
    const yards = Math.round((how === 'touchdown' ? GOAL_LINE_X : c.x) - this.match.ballX);
    const shake = (mult: number) => this.shakeScreen(mult);
    if (how === 'touchdown') {
      shake(feel.juice.touchdownShakeScale);
      this.popPlayer(this.wr);
      this.showBanner('TOUCHDOWN!');
    } else if (how === 'tackled') {
      this.hitPauseLeft = feel.juice.hitPauseTime; // tiny freeze-frame, then shake
      shake(yards >= feel.juice.bigGainYards ? feel.juice.bigHitShakeScale : 1);
      this.showBanner('TACKLED');
    } else {
      this.showBanner('OUT OF BOUNDS');
    }
    this.floatText(c.x, c.y - 2, `${yards >= 0 ? '+' : ''}${yards} YDS`, '#ffd166');
    this.recordPlay(how === 'touchdown' ? { kind: 'touchdown' } : { kind: 'spot', x: c.x });
    this.scheduleReset();
  }

  /** The pass rush got home. */
  private sack() {
    this.state = 'result';
    this.aimPointerId = null;
    this.aimDrag = null;
    this.aimG.clear();
    const sq = feel.throw.windupSquashRatio;
    this.tweens.add({
      targets: this.qb,
      scaleY: 1 - sq * 1.5,
      scaleX: 1 + sq,
      duration: feel.juice.screenShakeTime * 1000,
      yoyo: true,
    });
    this.shakeScreen();
    this.showBanner('SACKED');
    const loss = Math.round(this.qbPos.x - this.match.ballX);
    this.floatText(this.qbPos.x, this.qbPos.y - 2, `${loss} YDS`, '#ff8a8a');
    this.recordPlay({ kind: 'spot', x: this.qbPos.x });
    this.scheduleReset();
  }

  private scheduleReset() {
    this.resetTimer = this.time.delayedCall(
      (feel.pacing.bannerTime + feel.pacing.betweenPlaysTime) * 1000,
      () => this.resetPlay(),
    );
  }

  /** The safety's spot: deep behind the line, but never past the back of the end zone. */
  private safetyDepthX() {
    return Math.min(this.match.ballX + feel.defense.safetyDepthYards, TOTAL_LENGTH - 1);
  }

  private resetPlay() {
    this.resetTimer?.remove();
    this.resetTimer = null;
    this.form = formation(this.match.ballX); // line up wherever the last play left the ball
    const { qb: qbStart, wr: wrStart } = this.form;
    if (this.path.length) this.routeIndex = (this.routeIndex + 1) % ROUTES.length; // try each route in turn
    this.path = routePath(wrStart, ROUTES[this.routeIndex], WR_TOWARD_MIDDLE);
    this.runner = startRunner(this.path);
    this.state = 'presnap';
    this.playTime = 0;
    this.currentThrow = null;
    this.target = null;
    this.queuedTarget = null;
    this.aimPointerId = null;
    this.aimDrag = null;
    this.underPressure = false;
    this.aimG.clear();
    this.tweens.killTweensOf([this.qb, this.wr, this.cb, this.safety, this.ball, this.shadow]);
    this.safetyPos = { x: this.safetyDepthX(), y: FIELD_WIDTH / 2 };
    this.safety.setPosition(this.safetyPos.x, this.safetyPos.y).setAlpha(1).setScale(1);
    [this.cb, ...this.rusherDots].forEach((d) => d.setAlpha(1));
    this.steerTouch = null;
    this.steer = 0;
    this.hitPauseLeft = 0;
    this.clearBanner(); // tapping to skip clears the old banner straight away
    const cbStart = { x: wrStart.x + feel.defense.cbCushionYards, y: wrStart.y };
    this.coverage = startCoverage(cbStart, wrStart);
    this.cb.setPosition(cbStart.x, cbStart.y).setScale(1);
    const rng = getRngOrFallback();
    this.rushers = this.form.rush.map((pos) => ({
      pos: { ...pos },
      shedAt: feel.pocket.shedTime + (rng.next() * 2 - 1) * feel.pocket.shedTimeVariance,
    }));
    this.rushers.forEach((r, i) => this.rusherDots[i].setPosition(r.pos.x, r.pos.y));
    this.form.block.forEach((b, i) => this.blockerDots[i].setPosition(b.x, b.y));
    this.qbPos = { ...qbStart };
    this.qb.setPosition(qbStart.x, qbStart.y).setScale(1).setStrokeStyle(0.2, COLORS.outline);
    this.wr.setPosition(wrStart.x, wrStart.y).setScale(1);
    this.ball.setVisible(false).setAlpha(1);
    this.shadow.setVisible(false).setAlpha(1);
    this.sizeBall();
    this.drawMarkers();
    this.drawRoute();
    this.cameraFocus = { x: qbStart.x + 12, y: (qbStart.y + wrStart.y) / 2 };
    this.updateLabel();
    this.updateScoreboard();
  }

  /** Blue line of scrimmage and yellow first-down line (none when it's "& Goal"). */
  private drawMarkers() {
    const g = this.markersG;
    g.clear();
    g.fillStyle(COLORS.scrimmage, 0.8);
    g.fillRect(this.match.ballX - 0.12, 0, 0.24, FIELD_WIDTH);
    if (this.match.firstDownX < OPP_GOAL_X) {
      g.fillStyle(COLORS.firstDown, 0.9);
      g.fillRect(this.match.firstDownX - 0.15, 0, 0.3, FIELD_WIDTH);
    }
  }

  private updateScoreboard() {
    const g = this.match;
    this.scoreboard.setText(`YOU ${g.us} - ${g.them} CPU   ${downText(g)}  ·  ${spotText(g.ballX)}`);
    this.placeScoreboard();
  }

  private placeScoreboard() {
    const cam = this.cameras.main;
    this.scoreboard.setScale(1 / cam.zoom).setOrigin(0.5, 0);
    this.placeOnScreen(this.scoreboard, cam.width / 2, 8);
  }

  /**
   * Pre-snap route art (placeholder style until the stage-13 art pass): a thick bright line with
   * a dark pixel-style outline and a chunky arrowhead. Static (user didn't like animated chevrons).
   */
  private drawRoute() {
    const g = this.routeG;
    g.clear();
    const path = this.path;
    if (path.length < 2) return;
    const OUTLINE = 0.75;
    const LINE = 0.42;

    // Stop the line short of the tip so the arrowhead sits on the end.
    const end = path[path.length - 1];
    const prev = path[path.length - 2];
    const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
    const HEAD = 2.0;
    const lineEnd = { x: end.x - Math.cos(ang) * HEAD * 0.6, y: end.y - Math.sin(ang) * HEAD * 0.6 };
    const pts = [...path.slice(0, -1), lineEnd];

    const stroke = (width: number, color: number) => {
      g.lineStyle(width, color, 1);
      for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      g.fillStyle(color, 1);
      for (const pt of pts) g.fillCircle(pt.x, pt.y, width / 2); // round the corners
    };
    stroke(OUTLINE, COLORS.routeOutline);

    // Arrowhead: outline triangle, then the bright one inside it.
    const tri = (len: number, half: number, back: number) => {
      const bx = end.x - Math.cos(ang) * back;
      const by = end.y - Math.sin(ang) * back;
      const tipX = bx + Math.cos(ang) * len;
      const tipY = by + Math.sin(ang) * len;
      const nx = -Math.sin(ang) * half;
      const ny = Math.cos(ang) * half;
      return [tipX, tipY, bx + nx, by + ny, bx - nx, by - ny] as const;
    };
    g.fillStyle(COLORS.routeOutline, 1);
    g.fillTriangle(...tri(HEAD + 0.5, 1.35, HEAD * 0.8));
    stroke(LINE, COLORS.route);
    g.fillStyle(COLORS.route, 1);
    g.fillTriangle(...tri(HEAD, 0.95, HEAD * 0.6));
  }

  private updateLabel() {
    if (this.state === 'presnap') {
      this.label.setText(`${ROUTES[this.routeIndex].name} route · TAP to snap · ⚙ = feel`);
      return;
    }
    if (this.state === 'run') {
      this.label.setText('RUN! Drag up/down to steer · quick flick = juke');
      return;
    }
    const how = feel.throw.aimMode === AIM_SLINGSHOT ? 'pull BACK from your target' : 'drag TOWARD your target';
    this.label.setText(`Right side: ${how}, release to throw`);
  }

  // ---------- Drawing ----------

  private sizeBall() {
    const r = feel.ball.radiusYards;
    this.ball.setSize(r * 2, r * 1.4).setDisplaySize(r * 2, r * 1.4);
    this.shadow.setSize(r * 2, r * 1.2).setDisplaySize(r * 2, r * 1.2);
  }

  /** Ball is lifted up the screen by its height and grows a little; the shadow stays on the turf. */
  private drawBall(x: number, y: number, h: number) {
    const r = feel.ball.radiusYards;
    const grow = 1 + h * feel.ball.growPerYard;
    this.ball.setPosition(x, y - h * feel.ball.heightDrawRatio).setDisplaySize(r * 2 * grow, r * 1.4 * grow);
    this.shadow.setPosition(x, y).setAlpha(Math.max(0.12, 0.35 - h * 0.02));
  }

  private drawAimPreview(target: Vec) {
    const th = makeThrow(this.qbPos, target, feel.throw, feel.throw.arcHeightRatio);
    const g = this.aimG;
    g.clear();
    g.fillStyle(COLORS.aim, 0.9);
    const pts = arcPoints(th, Math.max(6, Math.round(Math.hypot(target.x - this.qbPos.x, target.y - this.qbPos.y) / 1.5)));
    for (const pt of pts.slice(1)) g.fillCircle(pt.x, pt.y - pt.h * feel.ball.heightDrawRatio, 0.22);
    this.drawLandingMarker(target, 1);
  }

  private drawLandingMarker(target: Vec, alpha: number) {
    const g = this.aimG;
    g.lineStyle(0.18, COLORS.aim, alpha);
    g.strokeCircle(target.x, target.y, feel.catching.catchRadiusYards);
    g.lineBetween(target.x - 0.5, target.y, target.x + 0.5, target.y);
    g.lineBetween(target.x, target.y - 0.5, target.x, target.y + 0.5);
  }

  /** World-space text that floats up and fades (e.g. "+12 YDS"). */
  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '48px', fontStyle: 'bold', color, stroke: '#14202b', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScale(2.2 / 48)
      .setDepth(6);
    this.tweens.add({
      targets: t,
      y: y - feel.juice.yardsPopupRise,
      alpha: { from: 1, to: 0 },
      duration: feel.juice.yardsPopupTime * 1000,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /** Big centred banner (e.g. INCOMPLETE) fixed to the screen. */
  private clearBanner() {
    if (!this.banner) return;
    this.tweens.killTweensOf(this.banner);
    this.banner.destroy();
    this.banner = null;
  }

  private showBanner(text: string) {
    this.clearBanner();
    const cam = this.cameras.main;
    const z = cam.zoom;
    const b = this.add
      .text(0, 0, text, { fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold', color: '#f4efe1', backgroundColor: '#14202bdd', padding: { x: 18, y: 8 } })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11)
      .setScale(0.6 / z);
    this.placeOnScreen(b, cam.width / 2, cam.height * 0.35);
    this.banner = b;
    this.tweens.add({ targets: b, scale: 1 / z, duration: feel.pacing.bannerPopTime * 1000, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: b,
      alpha: 0,
      delay: feel.pacing.bannerTime * 1000,
      duration: feel.pacing.bannerFadeTime * 1000,
      onComplete: () => b.destroy(),
    });
  }

  /**
   * Places a scroll-fixed object at a screen position. Scroll-fixed objects are still
   * zoomed around the screen centre, so the position has to be adjusted for zoom.
   */
  private placeOnScreen(obj: Phaser.GameObjects.Components.Transform, sx: number, sy: number) {
    const cam = this.cameras.main;
    const z = cam.zoom;
    obj.setPosition(cam.width / 2 + (sx - cam.width / 2) / z, cam.height / 2 + (sy - cam.height / 2) / z);
  }

  /** Zoom so the field width fits the screen height, then zoom in by feel.camera.zoomScale. */
  private fitCamera() {
    const cam = this.cameras.main;
    const m = feel.camera.sidelineMarginYards;
    cam.setZoom((this.scale.height / (FIELD_WIDTH + m * 2)) * Math.max(1, feel.camera.zoomScale));
    cam.setBounds(-m, -m, TOTAL_LENGTH + m * 2, FIELD_WIDTH + m * 2);
    // Keep the on-screen hint at normal size in the bottom-left, whatever the zoom
    // (the scoreboard has the top centre, the ⚙ button the top right).
    this.label.setScale(1 / cam.zoom);
    this.label.setOrigin(0, 1);
    this.placeOnScreen(this.label, 8, cam.height - 8);
    this.placeScoreboard();
  }

  private drawField() {
    const g = this.add.graphics();

    // Turf stripes every 5 yards, then the two end zones.
    for (let x = END_ZONE_DEPTH; x < TOTAL_LENGTH - END_ZONE_DEPTH; x += 5) {
      g.fillStyle((x / 5) % 2 === 0 ? COLORS.turf : COLORS.turfAlt);
      g.fillRect(x, 0, 5, FIELD_WIDTH);
    }
    g.fillStyle(COLORS.endZone);
    g.fillRect(0, 0, END_ZONE_DEPTH, FIELD_WIDTH);
    g.fillRect(TOTAL_LENGTH - END_ZONE_DEPTH, 0, END_ZONE_DEPTH, FIELD_WIDTH);

    // Yard lines every 5 yards, thicker goal lines, and the outer border.
    for (let x = END_ZONE_DEPTH; x <= TOTAL_LENGTH - END_ZONE_DEPTH; x += 5) {
      const isGoal = x === END_ZONE_DEPTH || x === TOTAL_LENGTH - END_ZONE_DEPTH;
      g.fillStyle(COLORS.line, isGoal ? 1 : 0.6);
      g.fillRect(x - 0.1, 0, isGoal ? 0.35 : 0.2, FIELD_WIDTH);
    }
    g.lineStyle(0.3, COLORS.line, 1);
    g.strokeRect(0, 0, TOTAL_LENGTH, FIELD_WIDTH);

    // Yard numbers, drawn big and then shrunk down so they stay sharp.
    for (let x = 0; x <= TOTAL_LENGTH; x += 10) {
      const n = yardLineNumber(x);
      if (n === null) continue;
      for (const y of [FIELD_WIDTH * 0.2, FIELD_WIDTH * 0.8]) {
        this.add
          .text(x, y, String(n), { fontFamily: 'monospace', fontSize: '64px', color: '#f4efe1' })
          .setOrigin(0.5)
          .setAlpha(0.5)
          .setScale(3 / 64);
      }
    }
  }
}
