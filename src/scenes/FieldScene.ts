import Phaser from 'phaser';
import { feel } from '../config/feel';
import { END_ZONE_DEPTH, FIELD_WIDTH, TOTAL_LENGTH, isInBounds, yardLineNumber } from '../sim/field';
import {
  AIM_SLINGSHOT,
  aimTarget,
  arcPoints,
  ballAt,
  clampDistance,
  isRunAim,
  makeThrow,
  type Throw,
  type Vec,
} from '../sim/throw';
import { PLAYS, RB, receiverInFlight, routePath, runnerAfter, startRunner, stepRunner, type PlayDef, type Runner } from '../sim/routes';
import { laneSteer, reachedHandoff, stepRunRusher } from '../sim/run';
import {
  blockerSpot,
  closestRusher,
  isFree,
  reachedQb,
  closestIndex,
  resolveTargetedPass,
  rollCornerSpeed,
  startCoverage,
  stepCoverage,
  stepRusher,
  type Coverage,
  type Rusher,
} from '../sim/defense';
import {
  GOAL_LINE_X,
  OWN_GOAL_LINE_X,
  evadeSteer,
  startChase,
  stepChase,
  tryJuke,
  startDive,
  stepTrailer,
  type ChaseParams,
  type ChaseState,
  type Pursuer,
  type Trailer,
} from '../sim/carry';
import { formation } from '../sim/formation';
import { closePlayCall, openPlayCall } from '../ui/playCall';
import { closeDriveSummary, openDriveSummary } from '../ui/driveSummary';
import { simulateOppDrive } from '../sim/oppDrive';
import {
  HOLD_YARDS,
  OPP_GOAL_X,
  applyKick,
  applyOppDrive,
  secondHalf,
  applyPlay,
  applyMuffedPunt,
  applyPunt,
  applyPuntReturnTD,
  downText,
  newGame,
  spotText,
  type DriveEvent,
  type GameState,
  type PlayOutcome,
} from '../sim/drive';
import {
  POST_HALF_WIDTH,
  fieldGoalDistance,
  inFieldGoalRange,
  kickDifficulty,
  meterPosition,
  resolveKick,
  type KickResult,
} from '../sim/kicking';
import { PUNTER_DEPTH, insideTwenty } from '../sim/punting';
import { coverageAt, returnerStart, startPuntPlay, stepPuntPlay, type PuntEnd, type PuntPlay } from '../sim/puntReturn';
import { coachTip } from '../sim/fourthDown';
import {
  beforeSnap,
  callTimeout,
  canCallTimeout,
  clockText,
  endPlay,
  newClock,
  playStopsClock,
  runOff,
  tickPlay,
  type ClockEvent,
  type ClockState,
} from '../sim/clock';
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
  bullet: 0x9be7ff, // bullet-pass aim preview
  run: 0x7dff9b, // QB scramble preview (aiming behind the QB)
  scrimmage: 0x7ec8e3,
  firstDown: 0xffd23f,
  route: 0xffd166,
  routeOutline: 0x0d1b2a,
  goalPost: 0xffd23f,
};

// Formation (football layout, not feel), lined up on the current line of scrimmage.
const PLAYER_RADIUS = 0.9; // placeholder art size, yards
const MIN_DRAG_PX = 10; // smaller drags count as a tap, not a throw
const PRESSURE_COLOR = 0xff3b3b;
const RUSHER_COUNT = 2;
const SKILL_COUNT = 4; // three receivers + the running back (index RB), each with his own man defender
// Camera height before the throw: a bit above the middle, toward the two-receiver side, which also
// leaves room under the scoreboard. (Layout, not feel: it follows the formation.)
const FORMATION_VIEW_Y = FIELD_WIDTH / 2 - 3;

/**
 * One receiver (or the running back) on this play: his route, where he is on it, and the defender
 * covering him (a cornerback, or the linebacker for the RB).
 */
interface Receiver {
  path: Vec[];
  runner: Runner;
  atLanding: Vec; // where his route takes him when the ball lands
  coverage: Coverage;
}

type State = 'calling' | 'presnap' | 'live' | 'windup' | 'flight' | 'run' | 'return' | 'kickAim' | 'kickFlight' | 'result' | 'oppDrive';
const JUKE_MIN_PX = 25; // a flick must move at least this far to count as a juke

/** Draws the field in "yard" units; the camera zoom turns yards into screen pixels. */
export class FieldScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  private qb!: Phaser.GameObjects.Arc;
  private wrDots: Phaser.GameObjects.Arc[] = []; // receivers, then the RB (index RB)
  private cbDots: Phaser.GameObjects.Arc[] = []; // cornerbacks, then the linebacker (index RB)
  private carrierDot: Phaser.GameObjects.Arc | null = null; // whoever has the ball after a catch
  private safety!: Phaser.GameObjects.Arc;
  private safetyPos: Vec = { x: 0, y: 0 };
  // After the catch / handoff / scramble: the ball carrier and everyone chasing him.
  private chase: ChaseState = startChase({ x: 0, y: 0 }, []);
  private pursuerDots: Phaser.GameObjects.Arc[] = [];
  private trailers: Trailer[] = []; // receivers / RB without the ball: they pull up and follow the play
  private steer = 0;
  private steered = false; // you've steered the RB yourself (his lane steering switches off)
  private steerTouch: { id: number; x: number; y: number; time: number } | null = null;
  private hitPauseLeft = 0;
  // Interception return: their defender runs at our end zone, our players chase (watch-only).
  private ret: ChaseState = startChase({ x: 0, y: 0 }, []);
  private returnerDot: Phaser.GameObjects.Arc | null = null;
  private returnStartX = 0;
  private chaserDots: Phaser.GameObjects.Arc[] = [];
  private skipBtn: HTMLButtonElement | null = null; // DOM button, shown during returns and result banners
  private playsBtn: HTMLButtonElement | null = null; // DOM button: reopen play calling before the snap
  private banner: Phaser.GameObjects.Text | null = null;
  private rusherDots: Phaser.GameObjects.Arc[] = [];
  private blockerDots: Phaser.GameObjects.Arc[] = [];
  private receivers: Receiver[] = [];
  private targetIndex = 0; // the receiver the ball in the air is meant for
  private rushers: Rusher[] = [];
  private ball!: Phaser.GameObjects.Ellipse;
  private shadow!: Phaser.GameObjects.Ellipse;
  private aimG!: Phaser.GameObjects.Graphics;
  private routeG!: Phaser.GameObjects.Graphics;

  // Downs, distance and score (rules live in sim/drive.ts).
  private match: GameState = newGame();
  private form = formation(newGame().ballX);
  private scoreboard!: Phaser.GameObjects.Text;
  private scoreText = '';
  // Game clock (rules live in sim/clock.ts).
  private clock: ClockState = newClock(feel.clock);
  private pendingBreak: ClockEvent = null; // END OF Q1 / HALFTIME / FINAL / warning, shown after the play
  private finishBreak: (() => void) | null = null; // what happens when that banner is done (new half, new game)
  private nextClock: ClockState | null = null; // next quarter's clock; the scoreboard shows 0:00 until the break
  private markersG!: Phaser.GameObjects.Graphics;
  // Field goals and extra points (rules in sim/kicking.ts): the meter is a DOM overlay.
  private kickMeter: HTMLDivElement | null = null;
  private kickKind: 'fieldGoal' | 'extraPoint' | 'punt' = 'fieldGoal';
  private kickDistance = 0;
  private kickSweep = 1; // seconds per sweep of the marker
  private kickTime = 0; // seconds the meter has been running
  private kickFlight: { from: Vec; to: Vec; t: number; duration: number; result: KickResult } | null = null;
  // A punt play after the tap: flight, returner, coverage, return (rules in sim/puntReturn.ts).
  // Coverage dots = [...wrDots, ...blockerDots, qb]; their blockers = [...cbDots, ...rusherDots]; returner = safety.
  private puntPlay: PuntPlay | null = null;

  private state: State = 'presnap';
  private playTime = 0; // seconds since the snap
  private playIndex = 0; // the play called (index into PLAYS)
  private calledPlay: PlayDef = PLAYS[0]; // that play with any hot routes (this snap only)
  private qbPos: Vec = { ...this.form.qb };
  private aimPointerId: number | null = null;
  private aimStart = { x: 0, y: 0 };
  private aimDrag: { x: number; y: number } | null = null;
  private target: Vec | null = null;
  private queuedTarget: Vec | null = null; // released before the earliest throw time
  private bulletAim = false; // aiming a bullet (other thumb tapped while aiming)
  private bulletThrow = false; // the throw being made / in the air is a bullet
  private runAim = false; // aiming behind the QB: releasing = QB scramble
  private qbRun = false; // the ball carrier is the QB (scramble), not a receiver
  private rbRun = false; // the ball carrier is the RB (handoff, pitch, or a pass to him)
  private currentThrow: Throw | null = null;
  private flightElapsed = 0;
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
    const dot = (color: number) => this.add.circle(0, 0, PLAYER_RADIUS, color).setStrokeStyle(0.2, COLORS.outline).setDepth(2);
    this.wrDots = Array.from({ length: SKILL_COUNT }, () => dot(COLORS.team));
    this.cbDots = Array.from({ length: SKILL_COUNT }, () => dot(COLORS.defense));
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

    // SKIP button (a DOM button, so taps on it never reach the field). Taps elsewhere don't skip.
    const skip = document.createElement('button');
    skip.id = 'skip-btn';
    skip.textContent = 'SKIP >';
    skip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    });
    document.body.appendChild(skip);
    this.skipBtn = skip;

    const plays = document.createElement('button');
    plays.id = 'plays-btn';
    plays.textContent = 'PLAYS';
    plays.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.state === 'presnap') this.openCall();
    });
    document.body.appendChild(plays);
    this.playsBtn = plays;

    // Kick meter: taps go straight through it to the field (any tap kicks).
    const meter = document.createElement('div');
    meter.id = 'kick-meter';
    meter.innerHTML = `
      <div class="km-title"></div>
      <div class="km-bar"><div class="km-green"></div><div class="km-centre"></div><div class="km-marker"></div></div>
      <div class="km-hint">TAP IN THE GREEN</div>`;
    document.body.appendChild(meter);
    this.kickMeter = meter;
    this.events.once('shutdown', () => {
      skip.remove();
      plays.remove();
      meter.remove();
      closePlayCall();
      closeDriveSummary();
    });

    // Keyboard: SPACE while aiming switches normal/bullet (a mouse has no second thumb).
    // SPACE also kicks when the kick meter is up.
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => (this.state === 'kickAim' ? this.kick() : this.toggleBullet()));
    // D while running: dive (QB: slide), like a forward flick on the phone.
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D).on('down', () => this.goDown());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.1); // avoid huge jumps after a pause
    const punting = this.state === 'kickFlight' && this.puntPlay !== null;
    this.skipBtn?.classList.toggle('show', this.state === 'return' || this.state === 'result' || punting);
    this.playsBtn?.classList.toggle('show', this.state === 'presnap');
    if (this.hitPauseLeft > 0) {
      this.hitPauseLeft -= dt; // freeze-frame on a big hit
      return;
    }
    // The clock runs while the ball is live (a play in progress always finishes, even at 0:00).
    // The try after a touchdown is untimed.
    if (['live', 'windup', 'flight', 'run', 'return'].includes(this.state) && !this.match.tryPending) {
      this.clock = tickPlay(this.clock, dt);
      this.updateScoreboard();
    }
    if (this.state === 'run') this.stepRun(dt);
    if (this.state === 'return') this.stepReturn(dt);
    if (this.state === 'kickAim') this.stepMeter(dt);
    if (this.state === 'kickFlight') this.stepKick(dt);

    const playing = this.state === 'live' || this.state === 'windup' || this.state === 'flight';
    if (playing) {
      this.playTime += dt;
      this.stepRoutes(dt);
      if (!this.calledPlay.run) this.updateQbDropback(); // on a run play the QB stays put to hand off
      this.stepDefense(dt);
    }

    if (this.state === 'live' && this.calledPlay.run) {
      if (reachedHandoff(this.receivers[RB].runner)) this.handoff();
    } else if (this.state === 'live') {
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

    if (playing) this.drawReceivers();
    if (this.state === 'flight' && this.currentThrow) {
      this.flightElapsed += dt;
      const b = ballAt(this.currentThrow, this.flightElapsed);
      this.drawBall(b.x, b.y, b.h);
      this.cameraFocus = { x: b.x + feel.camera.leadYards, y: b.y };
      if (b.done) this.resolveThrow();
    } else if (playing) {
      // Frame the QB and the receivers' average depth.
      const avgX = this.receivers.reduce((s, r) => s + r.runner.pos.x, 0) / this.receivers.length;
      this.cameraFocus = { x: (this.qbPos.x + avgX) / 2 + feel.camera.leadYards, y: FORMATION_VIEW_Y };
    }

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
    // Returns and result banners are skipped with the SKIP button only (stray taps did it by accident).
    if (this.state === 'kickAim') {
      this.kick(); // any tap kicks
      return;
    }
    if (this.state === 'return' || this.state === 'result' || this.state === 'calling' || this.state === 'kickFlight' || this.state === 'oppDrive') return;
    if (this.state === 'live' && this.aimPointerId !== null && p.id !== this.aimPointerId) {
      this.toggleBullet(); // other thumb taps while aiming
      return;
    }
    if (this.state === 'presnap') this.trySnap(); // tap anywhere to snap
    if (this.state === 'live' && this.calledPlay.run) {
      // Run play: no throwing. A thumb held down now steers the RB once he has the ball.
      this.steerTouch = { id: p.id, x: p.x, y: p.y, time: this.time.now };
      return;
    }
    // Aim with the right thumb (the same touch that snapped can start aiming straight away).
    if (this.state === 'live' && this.aimPointerId === null && p.x >= this.scale.width / 2) {
      this.aimPointerId = p.id;
      this.aimStart = { x: p.x, y: p.y };
      this.aimDrag = null;
      this.target = null;
      this.bulletAim = false;
      this.updateLabel();
    }
  }

  /** Switch the pass being aimed between normal and bullet (other thumb, or SPACE on a keyboard). */
  private toggleBullet() {
    if (this.state !== 'live' || this.aimPointerId === null) return;
    this.bulletAim = !this.bulletAim;
    this.updateAim();
    this.updateLabel();
  }

  /** SKIP button: finish a return instantly, or go straight to the next play. */
  private skip() {
    if (this.state === 'return') this.skipReturn();
    else if (this.state === 'kickFlight' && this.puntPlay) this.skipPunt();
    else if (this.state === 'result') this.afterPlay();
  }

  private onMove(p: Phaser.Input.Pointer) {
    const running = this.state === 'run' || (this.state === 'live' && this.calledPlay.run);
    if (running && this.steerTouch && p.id === this.steerTouch.id) {
      const full = Math.max(1, this.scale.height * feel.running.steerDragRatio);
      this.steer = Math.max(-1, Math.min(1, (p.y - this.steerTouch.y) / full));
      if (Math.abs(p.y - this.steerTouch.y) >= MIN_DRAG_PX) this.steered = true;
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
      const dx = p.x - t.x;
      if (this.state === 'run' && quick && Math.abs(dy) >= JUKE_MIN_PX && Math.abs(dy) > Math.abs(dx)) {
        this.chase = { ...this.chase, carrier: tryJuke(this.chase.carrier, Math.sign(dy), this.carryParams()) };
        this.steered = true;
      } else if (this.state === 'run' && quick && dx >= JUKE_MIN_PX && dx > Math.abs(dy)) {
        this.goDown(); // quick flick FORWARD (toward their end zone) = dive / slide
      }
      return;
    }
    if (p.id !== this.aimPointerId) return;
    this.aimPointerId = null;
    this.aimDrag = null;
    this.aimG.clear();
    this.updateLabel();
    if (this.state === 'live' && this.runAim) {
      this.runAim = false;
      this.startRun(this.qbPos, null); // aimed behind him: tuck it and run
      return;
    }
    if (this.state !== 'live' || !this.target) return; // just a tap: nothing thrown
    this.bulletThrow = this.bulletAim;
    if (this.playTime < feel.throw.earliestRelease) this.queuedTarget = this.target;
    else this.startWindup(this.target);
  }

  /** Go down on your own terms: a dive forward (1-3 yd, longer at full speed), or a QB slide. */
  private goDown() {
    if (this.state !== 'run' || this.chase.dive) return;
    const d = feel.dive;
    const params = this.qbRun ? { minYards: 0, maxYards: 0, time: d.qbSlideTime } : d;
    this.chase = startDive(this.chase, this.carryParams(), params);
    this.steerTouch = null;
    this.steer = 0;
    const dot = this.carrierDot;
    if (dot) {
      // Dive: stretched out flat toward the end zone. Slide: squashed low.
      const look = this.qbRun ? { scaleX: 1.2, scaleY: 0.7 } : { scaleX: 1.6, scaleY: 0.65 };
      this.tweens.add({ targets: dot, ...look, duration: params.time * 500, ease: 'Quad.easeOut' });
    }
    this.updateLabel();
  }

  private setRunAim(on: boolean) {
    if (on === this.runAim) return;
    this.runAim = on;
    this.updateLabel();
  }

  /** Recomputes the target from the current drag (the QB keeps moving while you aim). */
  private updateAim() {
    const d = this.aimDrag;
    if (!d || Math.hypot(d.x, d.y) < MIN_DRAG_PX) {
      this.target = null;
      this.setRunAim(false);
      this.aimG.clear();
      return;
    }
    this.target = aimTarget(this.qbPos, d.x, d.y, this.scale.height, {
      mode: feel.throw.aimMode,
      dragForMaxRatio: feel.throw.aimDragForMaxRatio,
      maxDistanceYards: feel.throw.maxDistanceYards,
    });
    // Aiming behind the QB = scramble: show a RUN arrow instead of a throw arc.
    this.setRunAim(isRunAim(this.qbPos, this.target, feel.scramble.runAimAngle));
    if (this.runAim) {
      this.target = null;
      this.drawRunPreview();
      return;
    }
    // A bullet can't go as far: same direction, cut down to its max distance.
    if (this.bulletAim) this.target = clampDistance(this.qbPos, this.target, feel.bullet.maxDistanceYards);
    this.drawAimPreview(this.target, this.bulletAim);
  }

  // ---------- Play flow ----------

  /** The huddle runoff comes off first; it can run out the quarter or hit the warning (no snap then). */
  private trySnap() {
    const r = beforeSnap(this.clock, feel.clock);
    this.setClock(r.clock, r.event);
    this.updateScoreboard();
    if (r.snap) this.snap();
    else if (r.event === 'warning') {
      this.showBanner(this.warningText());
      this.updateLabel();
    } else if (r.event) this.showBreak(r.event);
  }

  /** A new quarter's clock waits (scoreboard shows 0:00) until its END OF / HALFTIME banner is done. */
  private setClock(next: ClockState, event: ClockEvent) {
    if (event === 'endQuarter' || event === 'halftime' || event === 'final') {
      this.clock = { ...this.clock, timeLeft: 0, running: false };
      this.nextClock = event === 'final' ? null : next;
    } else {
      this.clock = next;
    }
  }

  private warningText() {
    return `${Math.round(feel.clock.warningTime)} SEC WARNING`;
  }

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
    this.currentThrow = this.buildThrow(this.qbPos, target, this.bulletThrow);
    this.flightElapsed = 0;
    const duration = this.currentThrow.duration;
    for (const r of this.receivers) r.atLanding = runnerAfter(r.runner, r.path, duration, feel.routes).pos;
    // The ball is meant for whoever's route takes him closest to the landing spot.
    this.targetIndex = closestIndex(this.receivers.map((r) => r.atLanding), target);
    this.state = 'flight';
    this.ball.setVisible(true);
    this.shadow.setVisible(true);
    // Landing marker stays on the turf while the ball is in the air.
    this.aimG.clear();
    this.drawLandingMarker(target, 0.8, this.bulletThrow);
  }

  /**
   * Where receiver i is now. Everyone runs his route; while the ball is in the air the
   * intended receiver also drifts toward it.
   */
  private receiverPosition(i: number): Vec {
    const r = this.receivers[i];
    if (this.state !== 'flight' || !this.currentThrow || i !== this.targetIndex) return r.runner.pos;
    return receiverInFlight(
      r.runner.pos,
      r.atLanding,
      this.currentThrow.to,
      this.flightElapsed,
      feel.catching.receiverAdjustYards,
      feel.catching.receiverAdjustSpeed,
    );
  }

  private stepRoutes(dt: number) {
    for (const r of this.receivers) r.runner = stepRunner(r.runner, r.path, dt, feel.routes);
  }

  private drawReceivers() {
    this.receivers.forEach((_, i) => {
      const p = this.receiverPosition(i);
      this.wrDots[i].setPosition(p.x, p.y);
    });
  }

  private resolveThrow() {
    const th = this.currentThrow!;
    const wrSpots = this.receivers.map((_, i) => this.receiverPosition(i));
    // Every defender in coverage can contest: the three cornerbacks and the deep safety.
    const cbSpots = [...this.receivers.map((r) => r.coverage.pos), { ...this.safetyPos }];
    this.aimG.clear();
    this.state = 'result';

    const pass = resolveTargetedPass(wrSpots, cbSpots, th.to, getRngOrFallback().next(), {
      catchRadiusYards: this.bulletThrow ? feel.bullet.catchRadiusYards : feel.catching.catchRadiusYards,
      contestRadiusYards: feel.defense.contestRadiusYards,
      breakupChance: feel.defense.breakupChance,
      interceptChance: feel.defense.interceptChance,
      receiverCatchChance: this.bulletThrow ? feel.bullet.catchChance : feel.catching.receiverCatchChance,
      defenderCatchChance: feel.defense.defenderCatchChance,
      shieldedContestRatio: feel.defense.shieldedContestRatio,
    }, th.from);

    let result = pass.result;
    const wrPos = wrSpots[pass.receiver];
    const cbPos = cbSpots[pass.defender];
    const cbDot = [...this.cbDots, this.safety][pass.defender];

    // A catch only counts with the catcher's feet (centre of his circle) in bounds.
    const catcher = result === 'catch' ? wrPos : result === 'interception' ? cbPos : null;
    if (catcher && !isInBounds(catcher)) {
      result = 'incomplete';
      this.floatText(catcher.x, catcher.y - 2, 'OUT OF BOUNDS', '#f4efe1');
    }

    if (result === 'interception') {
      this.ball.setVisible(false);
      this.shadow.setVisible(false);
      this.popPlayer(cbDot);
      this.shakeScreen();
      this.showBanner('INTERCEPTED');
      this.startReturn(cbPos, cbDot);
      return;
    } else if (result === 'droppedInt' || result === 'drop') {
      // Ball clanks off the player's hands and bounces away.
      const who = result === 'drop' ? wrPos : cbPos;
      this.skidBall(th.to, { x: th.to.x - th.from.x + (th.to.y - who.y), y: th.to.y - th.from.y });
      this.showBanner(result === 'drop' ? 'DROPPED' : 'LUCKY!');
    } else if (result === 'breakup') {
      // Swatted away: the ball pops off sideways from the defender.
      const away = { x: th.to.x - cbPos.x, y: th.to.y - cbPos.y };
      this.popPlayer(cbDot);
      this.skidBall(th.to, away.x === 0 && away.y === 0 ? { x: 0, y: 1 } : away);
      this.showBanner('BROKEN UP');
    } else if (result === 'catch') {
      this.ball.setVisible(false);
      this.shadow.setVisible(false);
      // Catch pop, then control passes to the receiver straight away.
      this.popPlayer(this.wrDots[pass.receiver]);
      this.startRun(wrPos, pass.receiver);
      return;
    } else {
      this.skidBall(th.to, { x: th.to.x - th.from.x, y: th.to.y - th.from.y });
      this.showBanner('INCOMPLETE');
    }
    this.recordPlay({ kind: 'incomplete' });
    this.scheduleReset();
  }

  // ---------- Interception return ----------

  /** The defender who picked it off heads for our end zone; everyone on our team chases him. */
  private startReturn(at: Vec, dot: Phaser.GameObjects.Arc) {
    this.state = 'return';
    this.returnStartX = at.x;
    this.returnerDot = dot;
    const ic = feel.interception;
    const chase = (d: Phaser.GameObjects.Arc, speed: number): Pursuer => ({ pos: { x: d.x, y: d.y }, speed, stunned: 0 });
    this.chaserDots = [...this.wrDots, this.qb, ...this.blockerDots];
    this.ret = startChase(at, [
      ...this.wrDots.map((d) => chase(d, ic.wrChaseSpeed)),
      chase(this.qb, ic.qbChaseSpeed),
      ...this.blockerDots.map((d) => chase(d, ic.olChaseSpeed)),
    ]);
    this.qb.setStrokeStyle(0.2, COLORS.outline);
    this.updateLabel();
  }

  /** Returner's running numbers: he builds up to full speed over returnTurnTime after the pick. */
  private returnParams() {
    const ic = feel.interception;
    const ramp = ic.returnTurnTime > 0 ? Math.min(1, this.ret.t / ic.returnTurnTime) : 1;
    return { ...this.carryParams(), runSpeed: ic.returnSpeed * ramp };
  }

  private stepReturn(dt: number) {
    const steer = evadeSteer(this.ret.carrier.pos, this.ret.pursuers, -1, feel.interception.evadeLookYards);
    const rng = getRngOrFallback();
    const step = stepChase(this.ret, steer, dt, this.chaseParams(this.returnParams(), -1), () => rng.next());
    this.ret = step.state;
    const r = this.ret.carrier.pos;
    this.returnerDot?.setPosition(r.x, r.y);
    this.ret.pursuers.forEach((c, i) => this.chaserDots[i].setPosition(c.pos.x, c.pos.y).setAlpha(c.stunned > 0 ? 0.45 : 1));
    this.cameraFocus = { x: r.x - feel.camera.leadYards, y: r.y };
    if (step.missed) this.floatText(r.x, r.y - 2, 'BROKE IT!', '#ff8a8a');
    if (step.end) this.endReturn(step.end === 'down' ? 'tackled' : step.end); // returners never dive
  }

  /** Numbers for one frame of a run: the carrier's running, the chase, and the tackles. */
  private chaseParams(carry: ReturnType<FieldScene['carryParams']>, dirX: 1 | -1, driveSpeed = 0): ChaseParams {
    const tk = feel.tackling;
    return {
      carry,
      pursuit: { reactionTime: tk.pursuitReactionTime, leadTime: tk.pursuitLeadTime, driveSpeed },
      tackle: {
        tackleReachYards: tk.tackleReachYards,
        brokenTackleChance: tk.brokenTackleChance,
        jukeEvadeChance: tk.jukeEvadeChance,
        stunTime: tk.stunTime,
      },
      graceTime: tk.catchGraceTime,
      dirX,
    };
  }

  /** Tap during a return: run the rest of it instantly. */
  private skipReturn() {
    for (let i = 0; i < 60 * 30 && this.state === 'return'; i++) this.stepReturn(1 / 60);
    this.hitPauseLeft = 0;
    if (this.returnerDot) this.cameras.main.centerOn(this.ret.carrier.pos.x, this.ret.carrier.pos.y);
  }

  private endReturn(how: 'tackled' | 'out' | 'touchdown') {
    this.state = 'result';
    const r = this.ret.carrier.pos;
    const yards = Math.max(0, Math.round(this.returnStartX - (how === 'touchdown' ? OWN_GOAL_LINE_X : r.x)));
    if (how === 'touchdown') {
      this.shakeScreen(feel.juice.touchdownShakeScale);
      if (this.returnerDot) this.popPlayer(this.returnerDot);
      this.showBanner('PICK SIX!');
      this.recordPlay({ kind: 'pickSix' });
    } else {
      if (how === 'tackled') {
        this.hitPauseLeft = feel.juice.hitPauseTime;
        this.shakeScreen();
        this.showBanner('STOPPED!');
      } else {
        this.showBanner('OUT OF BOUNDS');
      }
      this.recordPlay({ kind: 'interception', returnedTo: r.x });
    }
    this.floatText(r.x, r.y - 2, `${yards} YD RETURN`, '#ff8a8a');
    this.scheduleReset();
  }

  /**
   * Feeds the play's result into the downs/score rules. Big moments (first down, turnover on
   * downs, safety) replace the play's own banner; the yards popup still shows the gain.
   */
  private recordPlay(outcome: PlayOutcome, outOfBounds = false) {
    const { state, event } = applyPlay(this.match, outcome);
    this.finishPlay(state, event, playStopsClock(outcome, event, outOfBounds));
  }

  /** New game state after a play or a kick, then the clock (`stops` = this play stops it). */
  private finishPlay(state: GameState, event: DriveEvent, stops: boolean) {
    this.match = state;
    if (state.tryPending) {
      // Touchdown: the try comes first and is untimed. An end of quarter waits until it's over.
      this.clock = { ...this.clock, running: false };
      this.pendingBreak = null;
    } else {
      const clock = endPlay(this.clock, stops, feel.clock);
      this.setClock(clock.clock, clock.event);
      this.pendingBreak = clock.event;
    }
    const banner: Partial<Record<NonNullable<DriveEvent>, string>> = {
      firstDown: 'FIRST DOWN!',
      turnoverOnDowns: 'TURNOVER ON DOWNS',
      safety: 'SAFETY',
      twoPointGood: '2-PT GOOD!',
      twoPointFailed: 'NO GOOD',
    };
    const text = event ? banner[event] : undefined;
    if (text) this.showBanner(text);
    this.updateScoreboard();
  }

  // ---------- Kicking (field goals, extra points) ----------

  /** FIELD GOAL / KICK XP / PUNT on the play calling screen: line up the kick and start the meter. */
  private startKick(punt = false) {
    // A kick is a snap: a running clock loses the huddle runoff first (that can end the quarter).
    const r = beforeSnap(this.clock, feel.clock);
    this.setClock(r.clock, r.event);
    this.updateScoreboard();
    if (!r.snap && r.event !== 'warning') {
      if (r.event) this.showBreak(r.event);
      return;
    }
    if (r.event === 'warning') this.showBanner(this.warningText());
    this.kickKind = punt ? 'punt' : this.match.tryPending ? 'extraPoint' : 'fieldGoal';
    this.kickDistance = punt ? feel.punting.centreYards : fieldGoalDistance(this.match.ballX);
    const diff = punt ? { green: feel.punting.green, sweepTime: feel.punting.sweepTime } : kickDifficulty(this.kickDistance, feel.kicking);
    this.kickSweep = diff.sweepTime;
    this.kickTime = 0;
    this.state = 'kickAim';
    // The holder's spot, 7 yd behind the line (punter: 15 yd); the QB stands in as the kicker for now.
    const spot = this.kickSpot();
    this.routeG.clear();
    this.qb.setPosition(spot.x - 1.5, spot.y + 1.2);
    this.tweens.killTweensOf([this.ball, this.shadow]);
    this.ball.setVisible(true).setAlpha(1);
    this.shadow.setVisible(true).setAlpha(1);
    this.sizeBall();
    this.drawBall(spot.x, spot.y, 0);
    this.cameraFocus = { x: spot.x + this.kickDistance / 2, y: FIELD_WIDTH / 2 };
    if (punt) {
      // Their deep safety drops back to field it.
      const r = returnerStart(spot, feel.puntReturn);
      this.safety.setPosition(r.x, r.y);
    }
    // Meter: green zone centred, as wide as this kick allows.
    const m = this.kickMeter;
    if (m) {
      const what = this.kickKind === 'extraPoint' ? 'EXTRA POINT' : 'FIELD GOAL';
      m.querySelector('.km-title')!.textContent = punt ? 'PUNT · RED = SHANK' : `${what} · ${this.kickDistance} YD`;
      const green = m.querySelector<HTMLDivElement>('.km-green')!;
      green.style.left = `${((1 - diff.green) / 2) * 100}%`;
      green.style.width = `${diff.green * 100}%`;
      m.classList.remove('done');
      m.classList.add('show');
    }
    this.stepMeter(0);
    this.updateLabel();
  }

  private kickSpot(): Vec {
    if (this.kickKind === 'punt') return { x: Math.max(1, this.match.ballX - PUNTER_DEPTH), y: FIELD_WIDTH / 2 };
    return { x: this.match.ballX - HOLD_YARDS, y: FIELD_WIDTH / 2 };
  }

  private stepMeter(dt: number) {
    this.kickTime += dt;
    const pos = meterPosition(this.kickTime, this.kickSweep);
    const marker = this.kickMeter?.querySelector<HTMLDivElement>('.km-marker');
    if (marker) marker.style.left = `${((pos + 1) / 2) * 100}%`;
  }

  /** The tap: the marker freezes where it is and that decides the kick. */
  private kick() {
    if (this.state !== 'kickAim') return;
    if (this.kickKind === 'punt') {
      this.punt();
      return;
    }
    const k = resolveKick(this.kickDistance, meterPosition(this.kickTime, this.kickSweep), feel.kicking);
    if (this.kickKind === 'fieldGoal') {
      this.clock = tickPlay(this.clock, feel.kicking.clockRunoff); // extra points are untimed
      this.updateScoreboard();
    }
    this.kickMeter?.classList.add('done');
    // The ball heads for the posts at the back of the end zone, crossing that line `aim` of the
    // way to an upright; a short kick comes down before it gets there.
    const from = this.kickSpot();
    const postY = FIELD_WIDTH / 2 + k.aim * POST_HALF_WIDTH;
    const endX = k.result === 'short' ? from.x + k.carry : TOTAL_LENGTH + 3;
    const u = (endX - from.x) / Math.max(1, TOTAL_LENGTH - from.x);
    const to = { x: endX, y: from.y + (postY - from.y) * u };
    const kc = feel.kicking;
    const far = Math.max(0, Math.min(1, (this.kickDistance - kc.nearYards) / Math.max(1, kc.maxRangeYards - kc.nearYards)));
    const duration = kc.nearFlightTime + (kc.farFlightTime - kc.nearFlightTime) * far;
    this.kickFlight = { from, to, t: 0, duration: Math.max(0.1, duration), result: k.result };
    this.state = 'kickFlight';
    // Kicker's swing: a quick squash.
    const sq = feel.throw.windupSquashRatio;
    this.tweens.add({ targets: this.qb, scaleX: 1 + sq, scaleY: 1 - sq, duration: Math.max(1, feel.throw.windupTime * 1000), yoyo: true });
    this.updateLabel();
  }

  private coverageDots() {
    return [...this.wrDots, ...this.blockerDots, this.qb];
  }

  private returnTeamDots() {
    return [...this.cbDots, ...this.rusherDots];
  }

  /** The punt tap: the punt play starts (flight, returner, coverage; rules in sim/puntReturn.ts). */
  private punt() {
    const rng = getRngOrFallback();
    const roll = () => rng.next();
    this.clock = tickPlay(this.clock, feel.punting.clockRunoff);
    this.updateScoreboard();
    this.kickMeter?.classList.add('done');
    // Everyone starts from where they stand now.
    const at = (d: Phaser.GameObjects.Arc) => ({ x: d.x, y: d.y });
    const cover = coverageAt(this.match.ballX, this.kickSpot(), feel.puntReturn).map((c, i) => ({ ...c, pos: at(this.coverageDots()[i]) }));
    const team = this.returnTeamDots().map((d) => ({ pos: at(d), used: false }));
    this.puntPlay = startPuntPlay(this.match.ballX, meterPosition(this.kickTime, this.kickSweep), feel, roll, cover, team);
    this.puntPlay.returner = at(this.safety);
    this.state = 'kickFlight';
    this.qb.setStrokeStyle(0.2, COLORS.outline);
    const sq = feel.throw.windupSquashRatio;
    this.tweens.add({ targets: this.qb, scaleX: 1 + sq, scaleY: 1 - sq, duration: Math.max(1, feel.throw.windupTime * 1000), yoyo: true });
    this.updateLabel();
  }

  private stepPunt(dt: number) {
    const rng = getRngOrFallback();
    const { play, events } = stepPuntPlay(this.puntPlay!, dt, feel, () => rng.next());
    this.puntPlay = play;
    this.drawBall(play.ball.x, play.ball.y, play.ballHeight);
    this.safety.setPosition(play.returner.x, play.returner.y);
    const cover = this.coverageDots();
    play.coverage.forEach((c, i) => cover[i].setPosition(c.pos.x, c.pos.y).setAlpha(c.held > 0 ? 0.45 : 1));
    const team = this.returnTeamDots();
    play.returnTeam.forEach((b, i) => team[i].setPosition(b.pos.x, b.pos.y));
    if (play.chase) play.chase.pursuers.forEach((q, i) => cover[i].setAlpha(q.stunned > 0 || (q.held ?? 0) > 0 ? 0.45 : 1));
    if (events.decided) this.kickMeter?.classList.remove('show'); // the ball is down: clear the view
    if (events.decided === 'return') {
      this.popPlayer(this.safety);
      this.updateLabel();
    }
    if (events.missed) this.floatText(play.returner.x, play.returner.y - 2, 'BROKE IT!', '#ff8a8a');
    if (play.phase === 'return') this.cameraFocus = { x: play.returner.x - feel.camera.leadYards, y: play.returner.y };
    else this.cameraFocus = { x: play.ball.x + feel.camera.leadYards, y: FIELD_WIDTH / 2 };
    if (play.end) this.endPunt(play, play.end);
  }

  /** SKIP during a punt: run the rest of it instantly. */
  private skipPunt() {
    for (let i = 0; i < 60 * 30 && this.state === 'kickFlight' && this.puntPlay; i++) this.stepPunt(1 / 60);
    this.hitPauseLeft = 0;
    if (this.puntPlay) this.cameras.main.centerOn(this.puntPlay.ball.x, this.puntPlay.ball.y);
  }

  private endPunt(play: PuntPlay, end: PuntEnd) {
    this.state = 'result';
    this.kickMeter?.classList.remove('show');
    const losX = this.match.ballX;
    const r = play.returner;
    const textX = Math.min(Math.max(play.ball.x, 6), TOTAL_LENGTH - 6);
    let result: { state: GameState; event: DriveEvent };
    if (end.kind === 'returnTD') {
      this.shakeScreen(feel.juice.touchdownShakeScale);
      this.popPlayer(this.safety);
      this.showBanner('PUNT RETURN TD');
      this.floatText(textX, r.y - 2, `${end.yards} YD RETURN`, '#ff8a8a');
      result = applyPuntReturnTD(this.match);
    } else if (end.kind === 'muff') {
      this.shakeScreen();
      this.showBanner('MUFFED!');
      this.floatText(textX, FIELD_WIDTH / 2 - 6, `OUR BALL · ${spotText(end.spotX)}`, '#ffd166');
      result = applyMuffedPunt(this.match, end.spotX);
    } else {
      const net = Math.round(end.spotX - losX);
      if (end.kind === 'return') {
        if (end.how === 'tackled') {
          this.hitPauseLeft = feel.juice.hitPauseTime;
          this.shakeScreen();
          this.showBanner('STOPPED!');
        } else this.showBanner('OUT OF BOUNDS');
        this.floatText(textX, Math.min(r.y + 8, FIELD_WIDTH - 2), `${end.yards} YD RETURN · ${spotText(end.spotX)}`, '#ff8a8a'); // below him, clear of the banner
      } else if (end.kind === 'fairCatch') {
        this.showBanner('FAIR CATCH');
        this.floatText(textX, FIELD_WIDTH / 2 - 6, `${net} YD · ${spotText(end.spotX)}`, end.spotX >= OPP_GOAL_X - 20 ? '#ffd166' : '#ffffff');
      } else {
        const { path } = end;
        const pinned = insideTwenty(path);
        const text = play.kick.shank
          ? 'SHANK!'
          : path.result === 'touchback'
            ? 'TOUCHBACK'
            : pinned
              ? 'INSIDE THE 20!'
              : path.result === 'outOfBounds'
                ? 'OUT OF BOUNDS'
                : 'PUNT';
        this.showBanner(text);
        const colour = play.kick.shank ? '#ff8a8a' : pinned ? '#ffd166' : '#ffffff';
        this.floatText(textX, FIELD_WIDTH / 2 - 6, `${net} YD · ${spotText(end.spotX)}`, colour);
      }
      result = applyPunt(this.match, end.spotX);
    }
    this.puntPlay = null;
    this.tweens.add({ targets: [this.ball, this.shadow], alpha: 0, duration: feel.pacing.bannerTime * 1000 });
    this.finishPlay(result.state, result.event, true);
    this.scheduleReset();
  }

  private stepKick(dt: number) {
    if (this.puntPlay) {
      this.stepPunt(dt);
      return;
    }
    const f = this.kickFlight;
    if (!f) return;
    f.t += dt;
    const u = Math.min(1, f.t / f.duration);
    const x = f.from.x + (f.to.x - f.from.x) * u;
    const y = f.from.y + (f.to.y - f.from.y) * u;
    this.drawBall(x, y, 4 * feel.kicking.arcHeightYards * u * (1 - u));
    this.cameraFocus = { x: x + feel.camera.leadYards, y: FIELD_WIDTH / 2 };
    if (u >= 1) this.endKick();
  }

  private endKick() {
    const f = this.kickFlight!;
    this.kickFlight = null;
    this.state = 'result';
    this.kickMeter?.classList.remove('show');
    const good = f.result === 'good';
    const text = { good: 'GOOD!', wideLeft: 'WIDE LEFT', wideRight: 'WIDE RIGHT', short: 'SHORT' }[f.result];
    if (good) this.shakeScreen();
    this.tweens.add({ targets: [this.ball, this.shadow], alpha: 0, duration: feel.pacing.bannerTime * 1000 });
    this.showBanner(text);
    this.floatText(Math.min(f.to.x, TOTAL_LENGTH - 6), FIELD_WIDTH / 2 - 6, `${this.kickDistance} YD`, good ? '#ffd166' : '#ff8a8a');
    const { state, event } = applyKick(this.match, this.kickKind === 'extraPoint' ? 'extraPoint' : 'fieldGoal', good);
    this.finishPlay(state, event, true);
    this.scheduleReset();
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

  /** Moves the cornerbacks, the safety, the rushers and our blockers for one frame. */
  private stepDefense(dt: number) {
    const ball =
      this.state === 'flight' && this.currentThrow
        ? { landing: this.currentThrow.to, sinceThrow: this.flightElapsed }
        : undefined;
    const cover = {
      topSpeed: feel.routes.topSpeed * feel.defense.cbSpeedRatio,
      acceleration: feel.routes.acceleration,
      reactionTime: feel.defense.cbReactionTime,
      cushionYards: feel.defense.cbCushionYards,
      cushionCloseTime: feel.defense.cbCushionCloseTime,
      ballReactionTime: feel.defense.cbBallReactionTime,
      ballSpeedRatio: feel.defense.cbBallSpeedRatio,
      bodyGapYards: feel.defense.cbBodyGapYards,
    };
    // The linebacker covers the RB, but holds his ground past the line until the ball is thrown or handed off.
    const lbCover = {
      ...cover,
      topSpeed: feel.routes.topSpeed * feel.defense.lbSpeedRatio,
      reactionTime: feel.defense.lbReactionTime,
      cushionYards: 1,
      // He reads the play: holds near the line against a run, drops into coverage against a pass.
      minX: this.match.ballX + (this.calledPlay.run ? feel.defense.lbFloorYards : feel.defense.lbPassDropYards),
    };
    // Man coverage: each defender follows his own man, and all of them break on a thrown ball.
    this.receivers.forEach((r, i) => {
      r.coverage = stepCoverage(r.coverage, r.runner.pos, dt, i === RB ? lbCover : cover, ball);
      this.cbDots[i].setPosition(r.coverage.pos.x, r.coverage.pos.y);
    });

    // Safety: sits deep, shading toward the side with more receivers; breaks on the ball once it's thrown.
    const avgY = this.receivers.reduce((s, r) => s + r.runner.pos.y, 0) / this.receivers.length;
    const deep = ball ? ball.landing : { x: this.safetyDepthX(), y: (FIELD_WIDTH / 2 + avgY) / 2 };
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
    const run = this.calledPlay.run;
    const rbPos = this.receivers[RB].runner.pos;
    // Pass play: they rush the QB. Run play: our blockers drive them back, and once free they go for the RB.
    this.rushers = this.rushers.map((r) =>
      run
        ? stepRunRusher(r, rbPos, this.playTime, dt, { driveSpeed: feel.runGame.driveSpeed, freeSpeed: feel.pocket.rushFreeSpeed })
        : stepRusher(r, this.qbPos, this.playTime, dt, p),
    );
    this.rushers.forEach((r, i) => {
      this.rusherDots[i].setPosition(r.pos.x, r.pos.y);
      // Blocker stays in front of his man until beaten, then is left where he was.
      if (!isFree(r, this.playTime)) {
        const spot = blockerSpot(r, run ? { x: r.pos.x - 5, y: r.pos.y } : this.qbPos, PLAYER_RADIUS * 2);
        this.blockerDots[i].setPosition(spot.x, spot.y);
      }
    });
  }

  private carryParams() {
    return {
      runSpeed: this.qbRun ? feel.scramble.qbRunSpeed : this.rbRun ? feel.runGame.rbRunSpeed : feel.running.runSpeed,
      steerSpeed: feel.running.steerSpeed,
      steerResponse: feel.running.steerResponse,
      jukeSpeed: feel.running.jukeSpeed,
      jukeTime: feel.running.jukeTime,
      jukeCooldown: feel.running.jukeCooldown,
      jukeForwardRatio: feel.running.jukeForwardRatio,
      jukeRecoverTime: feel.running.jukeRecoverTime,
    };
  }

  /** Run play: the RB reached the QB (Dive) or the pitch point (Toss), so he has the ball now. */
  private handoff() {
    const rb = this.receivers[RB].runner.pos;
    if (Math.hypot(rb.x - this.qbPos.x, rb.y - this.qbPos.y) > 2) {
      // A pitch: show the ball flying out to him (he already has it, so nothing waits on this).
      this.tweens.killTweensOf(this.ball);
      this.ball.setVisible(true).setAlpha(1).setPosition(this.qbPos.x, this.qbPos.y);
      this.tweens.add({
        targets: this.ball,
        x: rb.x,
        y: rb.y,
        duration: Math.max(1, feel.runGame.pitchFlightTime * 1000),
        ease: 'Quad.easeOut',
        onComplete: () => this.ball.setVisible(false),
      });
    }
    this.startRun(rb, RB);
  }

  /**
   * After a catch (`receiver` = his index), a handoff (`receiver` = RB on a run play) or a QB
   * scramble (`receiver` = null): he becomes the ball carrier and every defender chases him.
   */
  private startRun(at: Vec, receiver: number | null) {
    this.state = 'run';
    this.qbRun = receiver === null;
    this.rbRun = receiver === RB;
    this.carrierDot = receiver === null ? this.qb : this.wrDots[receiver];
    this.targetIndex = receiver ?? -1; // -1: every receiver keeps running his route
    if (this.qbRun) {
      this.queuedTarget = null;
      this.aimG.clear();
      this.qb.setStrokeStyle(0.2, COLORS.outline); // pressure warning off: he's on the move
    }
    const db = feel.tackling.dbPursuitSpeed;
    const dl = feel.tackling.dlPursuitSpeed;
    // On a scramble or a run play our line keeps blocking: a rusher is held (can't tackle) until
    // the moment he beats his blocker.
    const blocking = this.qbRun || !!this.calledPlay.run;
    this.chase = startChase(at, [
      ...this.receivers.map((r, i) => ({
        pos: { ...r.coverage.pos },
        speed: i === RB ? feel.defense.lbPursuitSpeed : db,
        stunned: 0,
        wait: i === RB && this.calledPlay.run ? feel.runGame.lbReadTime : 0, // the linebacker reads the run first
      })),
      { pos: { ...this.safetyPos }, speed: db, stunned: 0 },
      ...this.rushers.map((r) => ({ pos: { ...r.pos }, speed: dl, stunned: 0, held: blocking ? Math.max(0, r.shedAt - this.playTime) : 0 })),
    ]);
    this.pursuerDots = [...this.cbDots, this.safety, ...this.rusherDots];
    // Everyone else stops his route and follows the play (the carrier's own entry is ignored).
    this.trailers = this.receivers.map((r) => ({ pos: { ...r.runner.pos }, speed: r.runner.speed, dir: { ...r.runner.dir } }));
    this.updateLabel();
  }

  private stepRun(dt: number) {
    // Until you steer him yourself, the RB on a run play follows his lane.
    const rb = this.receivers[RB];
    const run = !!this.calledPlay.run;
    const steer =
      run && !this.steered
        ? laneSteer(this.chase.carrier.pos, rb.path, feel.runGame.laneLookAheadYards, feel.runGame.laneFullSteerYards)
        : this.steer;
    const rng = getRngOrFallback();
    const drive = run ? feel.runGame.driveSpeed : 0;
    const step = stepChase(this.chase, steer, dt, this.chaseParams(this.carryParams(), 1, drive), () => rng.next());
    this.chase = step.state;
    const c = this.chase.carrier.pos;
    this.carrierDot?.setPosition(c.x, c.y);
    // Teammates without the ball pull up and jog after the play (downfield blocking comes later).
    this.trailers = this.trailers.map((t, i) => {
      if (i === this.targetIndex) return t;
      const next = stepTrailer(t, c, this.chase.t, dt, feel.teammates);
      this.wrDots[i].setPosition(next.pos.x, next.pos.y);
      return next;
    });
    // Faded = on the turf after a missed tackle. A rusher still held keeps his blocker on him.
    const firstRusher = this.chase.pursuers.length - this.rushers.length;
    this.chase.pursuers.forEach((d, i) => {
      this.pursuerDots[i].setPosition(d.pos.x, d.pos.y).setAlpha(d.stunned > 0 ? 0.45 : 1);
      if (i >= firstRusher && (d.held ?? 0) > 0) {
        const spot = blockerSpot({ pos: d.pos, shedAt: 0 }, { x: d.pos.x - 5, y: d.pos.y }, PLAYER_RADIUS * 2);
        this.blockerDots[i - firstRusher].setPosition(spot.x, spot.y);
      }
    });
    this.cameraFocus = { x: c.x + feel.camera.leadYards, y: c.y };
    if (step.missed) this.floatText(c.x, c.y - 2, step.missed === 'juked' ? 'JUKED!' : 'BROKE IT!', '#7ec8e3');
    if (step.end) this.endRun(step.end);
  }

  private endRun(how: 'tackled' | 'out' | 'touchdown' | 'down') {
    this.state = 'result';
    this.steerTouch = null;
    this.steer = 0;
    const c = this.chase.carrier.pos;
    const yards = Math.round((how === 'touchdown' ? GOAL_LINE_X : c.x) - this.match.ballX);
    const shake = (mult: number) => this.shakeScreen(mult);
    if (how === 'touchdown') {
      shake(feel.juice.touchdownShakeScale);
      if (this.carrierDot) this.popPlayer(this.carrierDot);
      this.showBanner('TOUCHDOWN!');
    } else if (how === 'tackled') {
      this.hitPauseLeft = feel.juice.hitPauseTime; // tiny freeze-frame, then shake
      shake(yards >= feel.juice.bigGainYards ? feel.juice.bigHitShakeScale : 1);
      // A scrambling QB brought down behind the line is a sack; a run stopped for no gain is stuffed.
      this.showBanner(this.qbRun && c.x < this.match.ballX ? 'SACKED' : this.calledPlay.run && yards <= 0 ? 'STUFFED!' : 'TACKLED');
    } else if (how === 'down') {
      this.showBanner(this.qbRun ? 'SLIDE' : 'DOWN'); // went down on his own: in bounds, clock keeps running
    } else {
      this.showBanner('OUT OF BOUNDS');
    }
    this.floatText(c.x, c.y - 2, `${yards >= 0 ? '+' : ''}${yards} YDS`, yards < 0 ? '#ff8a8a' : '#ffd166');
    this.recordPlay(how === 'touchdown' ? { kind: 'touchdown' } : { kind: 'spot', x: c.x }, how === 'out');
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
      () => this.afterPlay(),
    );
  }

  /** After the play's banner: show any clock break (end of quarter...), else the next play. */
  private afterPlay() {
    this.resetTimer?.remove();
    this.resetTimer = null;
    const ev = this.pendingBreak;
    this.pendingBreak = null;
    if (ev) {
      this.showBreak(ev);
      return;
    }
    const finish = this.finishBreak;
    this.finishBreak = null;
    finish?.();
    // Our possession is over (score, punt, turnover, second-half kickoff): their drive comes first.
    if (this.match.oppStartX !== null) {
      this.runOppDrive(this.match.oppStartX);
      return;
    }
    this.resetPlay();
  }

  /**
   * A simulated CPU drive: dice-sim it, take its time off the clock, then show the summary.
   * CONTINUE moves on: any clock break (END OF Q1 / HALFTIME / FINAL), then our play.
   */
  private runOppDrive(startX: number) {
    this.state = 'oppDrive';
    const c = this.clock;
    const drive = simulateOppDrive(
      startX,
      { quarter: c.quarter, timeLeft: c.timeLeft, quarterLength: feel.clock.quarterLength, us: this.match.us, them: this.match.them },
      feel.oppDrive,
      getRngOrFallback(),
    );
    const lastQuarter = c.quarter === 4;
    const r = runOff(c, drive.seconds, feel.clock);
    this.setClock(r.clock, r.event);
    this.pendingBreak = r.event;
    this.match = applyOppDrive(this.match, drive);
    this.updateScoreboard();
    this.updateLabel();
    // Stays up until CONTINUE (user: no auto-advance, there's a lot to read).
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      closeDriveSummary();
      this.afterPlay();
    };
    openDriveSummary({ drive, us: this.match.us, them: this.match.them, lastQuarter, onContinue: next });
  }

  /** END OF Q1 / HALFTIME / FINAL / warning banner, then on to the next play (SKIP works too). */
  private showBreak(ev: Exclude<ClockEvent, null>) {
    this.state = 'result';
    const text = {
      warning: this.warningText(),
      endQuarter: `END OF Q${this.clock.quarter}`,
      halftime: 'HALFTIME',
      final: `FINAL  ${this.match.us}-${this.match.them}`,
    }[ev];
    const hold = ev === 'warning' ? feel.pacing.bannerTime : feel.pacing.breakBannerTime;
    this.showBanner(text, hold);
    // The second half starts with their drive (we had the ball first); FINAL starts a new game.
    const next = this.nextClock;
    this.nextClock = null;
    if (next) this.finishBreak = () => (this.clock = next);
    if (ev === 'halftime') {
      this.finishBreak = () => {
        this.clock = next ?? this.clock;
        this.match = secondHalf(this.match);
      };
    }
    if (ev === 'final') {
      this.finishBreak = () => {
        this.match = newGame();
        this.clock = newClock(feel.clock);
      };
    }
    this.updateScoreboard();
    this.updateLabel();
    this.resetTimer = this.time.delayedCall((hold + feel.pacing.betweenPlaysTime) * 1000, () => this.afterPlay());
  }

  /** The safety's spot: deep behind the line, but never past the back of the end zone. */
  private safetyDepthX() {
    return Math.min(this.match.ballX + feel.defense.safetyDepthYards, TOTAL_LENGTH - 1);
  }

  /**
   * Lines everyone up for the next snap with the called play. With `call` (the default, after
   * every play) the play calling screen opens first.
   */
  private resetPlay(call = true) {
    this.resetTimer?.remove();
    this.resetTimer = null;
    this.form = formation(this.match.ballX); // line up wherever the last play left the ball
    const qbStart = this.form.qb;
    if (call) this.calledPlay = PLAYS[this.playIndex]; // hot routes only last one snap
    const play = this.calledPlay;
    const rng = getRngOrFallback();
    this.receivers = this.form.skill.map((wr, i) => {
      const path = routePath(wr.pos, play.routes[i], wr.towardMiddle);
      // Cornerbacks line up off their receiver; the linebacker in the middle, a few yards deep.
      const cbStart =
        i === RB
          ? { x: this.match.ballX + feel.defense.lbDepthYards, y: FIELD_WIDTH / 2 }
          : { x: wr.pos.x + feel.defense.cbCushionYards, y: wr.pos.y };
      // Each corner's speed is rolled per snap (the linebacker's isn't).
      const speed = i === RB ? 1 : rollCornerSpeed(1, feel.defense.cbSpeedVariance, rng.next());
      return { path, runner: startRunner(path, play.routes[i].stop), atLanding: { ...wr.pos }, coverage: startCoverage(cbStart, wr.pos, speed) };
    });
    this.targetIndex = 0;
    this.carrierDot = null;
    this.kickFlight = null;
    this.puntPlay = null;
    this.kickMeter?.classList.remove('show');
    this.state = 'presnap';
    this.playTime = 0;
    this.currentThrow = null;
    this.target = null;
    this.queuedTarget = null;
    this.bulletAim = false;
    this.bulletThrow = false;
    this.runAim = false;
    this.qbRun = false;
    this.rbRun = false;
    this.steered = false;
    this.aimPointerId = null;
    this.aimDrag = null;
    this.underPressure = false;
    this.aimG.clear();
    this.tweens.killTweensOf([this.qb, ...this.wrDots, ...this.cbDots, this.safety, this.ball, this.shadow]);
    this.safetyPos = { x: this.safetyDepthX(), y: FIELD_WIDTH / 2 };
    this.safety.setPosition(this.safetyPos.x, this.safetyPos.y).setAlpha(1).setScale(1);
    [...this.cbDots, ...this.rusherDots, ...this.wrDots, this.qb, ...this.blockerDots].forEach((d) => d.setAlpha(1));
    this.steerTouch = null;
    this.steer = 0;
    this.hitPauseLeft = 0;
    this.clearBanner(); // tapping to skip clears the old banner straight away
    this.receivers.forEach((r, i) => {
      this.cbDots[i].setPosition(r.coverage.pos.x, r.coverage.pos.y).setScale(1);
      this.wrDots[i].setPosition(r.runner.pos.x, r.runner.pos.y).setScale(1);
    });
    // Run blocking and pass blocking hold their man for different lengths of time.
    const shed = play.run ? feel.runGame : feel.pocket;
    this.rushers = this.form.rush.map((pos) => ({
      pos: { ...pos },
      shedAt: shed.shedTime + (rng.next() * 2 - 1) * shed.shedTimeVariance,
    }));
    this.rushers.forEach((r, i) => this.rusherDots[i].setPosition(r.pos.x, r.pos.y));
    this.form.block.forEach((b, i) => this.blockerDots[i].setPosition(b.x, b.y));
    this.qbPos = { ...qbStart };
    this.qb.setPosition(qbStart.x, qbStart.y).setScale(1).setStrokeStyle(0.2, COLORS.outline);
    this.ball.setVisible(false).setAlpha(1);
    this.shadow.setVisible(false).setAlpha(1);
    this.sizeBall();
    this.drawMarkers();
    this.routeG.clear();
    this.receivers.forEach((r, i) => this.drawRoute(r.path, play.routes[i].stop));
    this.cameraFocus = { x: qbStart.x + 12, y: FORMATION_VIEW_Y };
    this.updateLabel();
    this.updateScoreboard();
    if (call) this.openCall();
  }

  /** Shows the play calling screen; EXECUTE lines up the chosen play, CANCEL keeps the current one. */
  private openCall() {
    this.state = 'calling';
    this.updateLabel();
    const fgRange = inFieldGoalRange(this.match.ballX, feel.kicking);
    openPlayCall({
      match: this.match,
      clock: clockText(this.clock),
      timeoutsLeft: this.clock.timeouts,
      canTimeout: canCallTimeout(this.clock),
      // TIMEOUT on the play calling screen: the clock stops, so no huddle runoff at the snap.
      onTimeout: () => {
        this.clock = callTimeout(this.clock);
        this.updateScoreboard();
        this.updateLabel();
        return this.clock.timeouts;
      },
      plays: PLAYS,
      selected: this.playIndex,
      current: this.calledPlay,
      onExecute: (i, play) => {
        this.playIndex = i;
        this.calledPlay = play;
        this.resetPlay(false); // line up the chosen play (with any hot routes)
      },
      onCancel: () => {
        this.state = 'presnap';
        this.updateLabel();
      },
      kickLabel: this.match.tryPending
        ? 'KICK XP'
        : fgRange
          ? `${this.match.down === 4 ? 'FG' : 'FIELD GOAL'} (${fieldGoalDistance(this.match.ballX)} YD)` // short on 4th: PUNT needs the room
          : null,
      onKick: () => this.startKick(),
      // 4th down: PUNT, and the coach's tip (advice only).
      canPunt: this.match.down === 4 && !this.match.tryPending,
      onPunt: () => this.startKick(true),
      tip: coachTip({ match: this.match, quarter: this.clock.quarter, timeLeft: this.clock.timeLeft, fgRange }),
    });
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

  /** Cheap to call every frame: only redraws when the text changes. */
  private updateScoreboard() {
    const g = this.match;
    const text = `YOU ${g.us} - ${g.them} CPU  ${clockText(this.clock)}  ${downText(g)} · ${spotText(g.ballX)}`;
    if (text === this.scoreText) return;
    this.scoreText = text;
    this.scoreboard.setText(text);
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
  private drawRoute(fullPath: Vec[], stop = false) {
    const g = this.routeG;
    // Stop routes (Hitch, Curl, Check): drawn up to the turn, ending in a flat "stop" bar
    // (the short step back toward the QB is too small to draw).
    const path = stop && fullPath.length >= 3 ? fullPath.slice(0, -1) : fullPath;
    if (path.length < 2) return;
    const OUTLINE = 0.75;
    const LINE = 0.42;

    // Stop the line short of the tip so the arrowhead sits on the end.
    const end = path[path.length - 1];
    const prev = path[path.length - 2];
    const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
    // Stop routes end in a short comeback: smaller head. Never longer than the last leg, or the
    // line would poke out backwards past it.
    const HEAD = Math.min(2.0 * (stop ? 0.6 : 1), Math.hypot(end.x - prev.x, end.y - prev.y) * 0.9);
    const lineEnd = { x: end.x - Math.cos(ang) * HEAD * 0.6, y: end.y - Math.sin(ang) * HEAD * 0.6 };
    // Stop routes (Hitch, Curl, Check) end in a flat bar: "stop here and wait" (playbook style).
    const pts = stop ? path : [...path.slice(0, -1), lineEnd];

    const stroke = (width: number, color: number) => {
      g.lineStyle(width, color, 1);
      for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      g.fillStyle(color, 1);
      for (const pt of pts) g.fillCircle(pt.x, pt.y, width / 2); // round the corners
    };
    stroke(OUTLINE, COLORS.routeOutline);
    if (stop) {
      const bx = -Math.sin(ang) * 1.1;
      const by = Math.cos(ang) * 1.1;
      g.lineStyle(OUTLINE + 0.25, COLORS.routeOutline, 1);
      g.lineBetween(end.x - bx * 1.15, end.y - by * 1.15, end.x + bx * 1.15, end.y + by * 1.15);
      stroke(LINE, COLORS.route);
      g.lineStyle(LINE + 0.15, COLORS.route, 1);
      g.lineBetween(end.x - bx, end.y - by, end.x + bx, end.y + by);
      return;
    }

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
    this.label.setVisible(this.state !== 'calling'); // the play calling screen covers the field
    if (this.state === 'calling') return;
    if (this.state === 'presnap') {
      const run = this.clock.running ? ` (clock running: -${Math.round(feel.clock.huddleRunoff)}s)` : '';
      const tryText = this.match.tryPending ? '2-PT TRY: ' : '';
      this.label.setText(`${tryText}${PLAYS[this.playIndex].name} · TAP to snap${run} · ⚙ = feel`);
      return;
    }
    if (this.state === 'kickAim') {
      this.label.setText('SPACE also kicks'); // the meter itself says TAP IN THE GREEN
      return;
    }
    if (this.state === 'kickFlight') {
      this.label.setText(!this.puntPlay ? 'Kick is up…' : this.puntPlay.phase === 'return' ? 'Punt return' : 'Punt is up…');
      return;
    }
    if (this.state === 'run') {
      if (this.chase.dive) this.label.setText(this.qbRun ? 'Sliding…' : 'Diving…');
      else this.label.setText(`${this.qbRun ? 'QB RUN' : 'RUN'}! Drag = steer · flick up/down = juke · flick → = ${this.qbRun ? 'slide' : 'dive'}`);
      return;
    }
    if (this.state === 'live' && this.calledPlay.run) {
      this.label.setText(`${this.calledPlay.name}: handing off… hold a thumb down to steer`);
      return;
    }
    if (this.state === 'return') {
      this.label.setText('Interception return');
      return;
    }
    if (this.state === 'oppDrive') {
      this.label.setText('CPU drive');
      return;
    }
    if (this.aimPointerId !== null && this.runAim) {
      this.label.setText('Release to RUN with the QB · aim forward again to pass');
      return;
    }
    if (this.aimPointerId !== null) {
      this.label.setText(this.bulletAim ? 'BULLET · other thumb / SPACE = normal pass' : 'Other thumb / SPACE = BULLET pass');
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

  /** A normal pass or a bullet (flatter and faster, see feel.bullet). */
  private buildThrow(from: Vec, to: Vec, bullet: boolean) {
    return bullet
      ? makeThrow({ ...from }, to, feel.throw, feel.bullet.arcHeightRatio, feel.bullet.flightTimeRatio)
      : makeThrow({ ...from }, to, feel.throw, feel.throw.arcHeightRatio);
  }

  private drawAimPreview(target: Vec, bullet: boolean) {
    const th = this.buildThrow(this.qbPos, target, bullet);
    const g = this.aimG;
    g.clear();
    g.fillStyle(bullet ? COLORS.bullet : COLORS.aim, 0.9);
    const pts = arcPoints(th, Math.max(6, Math.round(Math.hypot(target.x - this.qbPos.x, target.y - this.qbPos.y) / 1.5)));
    for (const pt of pts.slice(1)) g.fillCircle(pt.x, pt.y - pt.h * feel.ball.heightDrawRatio, 0.22);
    this.drawLandingMarker(target, 1, bullet);
  }

  /** Scramble preview: a chunky green arrow from the QB straight upfield, with RUN on it. */
  private drawRunPreview() {
    const g = this.aimG;
    g.clear();
    const { x, y } = this.qbPos;
    const len = 6;
    g.fillStyle(COLORS.routeOutline, 0.9);
    g.fillRect(x + 0.6, y - 0.55, len, 1.1);
    g.fillTriangle(x + len + 0.3, y - 1.6, x + len + 0.3, y + 1.6, x + len + 2.6, y);
    g.fillStyle(COLORS.run, 1);
    g.fillRect(x + 0.8, y - 0.3, len - 0.2, 0.6);
    g.fillTriangle(x + len + 0.6, y - 1.15, x + len + 0.6, y + 1.15, x + len + 2.1, y);
    g.lineStyle(0.22, COLORS.run, 1);
    g.strokeCircle(x, y, 1.3);
  }

  /** Landing marker; its circle is the catch zone (smaller for a bullet). */
  private drawLandingMarker(target: Vec, alpha: number, bullet: boolean) {
    const g = this.aimG;
    g.lineStyle(0.18, bullet ? COLORS.bullet : COLORS.aim, alpha);
    g.strokeCircle(target.x, target.y, bullet ? feel.bullet.catchRadiusYards : feel.catching.catchRadiusYards);
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

  private showBanner(text: string, hold = feel.pacing.bannerTime) {
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
      delay: hold * 1000,
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

    // Goalposts on each end line, seen from above: the crossbar with an upright at each end.
    g.fillStyle(COLORS.goalPost, 1);
    const mid = FIELD_WIDTH / 2;
    for (const x of [0, TOTAL_LENGTH]) {
      g.fillRect(x - 0.2, mid - POST_HALF_WIDTH, 0.4, POST_HALF_WIDTH * 2);
      g.fillCircle(x, mid - POST_HALF_WIDTH, 0.45);
      g.fillCircle(x, mid + POST_HALF_WIDTH, 0.45);
    }

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
