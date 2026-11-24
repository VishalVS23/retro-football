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
import { PLAYS, RB, TE, coveredByLinebacker, receiverInFlight, routeBase, routePath, runnerAfter, startRunner, stepRunner, type PlayDef, type Runner } from '../sim/routes';
import { laneSteer, pathYAt, reachedHandoff, stepRunRusher } from '../sim/run';
import {
  blockerSpot,
  closestRusher,
  isFree,
  reachedQb,
  closestIndex,
  resolveTargetedPass,
  rollCornerSpeed,
  startCoverage,
  stepSafety,
  stepZoneSafety,
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
  type CarryParams,
  type ChaseParams,
  type ChaseState,
  type Pursuer,
  type Trailer,
} from '../sim/carry';
import { BLOCKER_OF, CENTRE, formation, RETURN_LINE, RETURN_RUSH, RETURN_SKILL, SLOT } from '../sim/formation';
import { closePlayCall, openPlayCall } from '../ui/playCall';
import { closeDriveSummary, openDriveSummary } from '../ui/driveSummary';
import { simulateOppDrive } from '../sim/oppDrive';
import { NEUTRAL_MODS } from '../sim/driveRatings';
import { matchupMods, simTeam } from '../league/simTeams';
import { simulateFrom, type SimGameState, type SimStop } from '../sim/simGame';
import { closeSimRecap, openSimRecap, type RecapRow } from '../ui/simRecap';
import type { OppDriveResult } from '../sim/oppDrive';

/** Recap wording for each simulated drive's result. */
const SIM_RESULT_TEXT: Record<OppDriveResult, string> = {
  touchdown: 'TOUCHDOWN',
  fieldGoal: 'FIELD GOAL',
  missedFieldGoal: 'MISSED FG',
  punt: 'PUNT',
  interception: 'INTERCEPTION',
  fumble: 'FUMBLE LOST',
  downs: 'TURNOVER ON DOWNS',
  endOfHalf: 'END OF HALF',
  quarterEnd: 'DRIVE GOES ON',
};
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
  applyFumble,
  applyTakeaway,
  downText,
  newGame,
  spotText,
  YARDS_FOR_FIRST_DOWN,
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
  DEF_CALL_NAMES,
  DEF_CALL_TIPS,
  coverParams,
  lb2BlitzChance,
  lb2Job,
  lb2ZoneSpot,
  pickShell,
  safetyBaseReaction,
  safetyParamsFor,
  safetyRunRead,
  lookAlignment,
  disguiseLooks,
  rotatedTarget,
  rotationReadDelay,
  type Look,
  type Rotation,
  SHELL_NAMES,
  SHELL_TIPS,
  type ShellId,
  pickDefCall,
  stepBlitzer,
  teamAggression,
  zoneParams,
  type DefCallId,
  type DefSituation,
  type Lb2Job,
} from '../sim/defCalls';
import { rollFumble, rollRecovery } from '../sim/fumble';
import type { DiagramDefense } from '../ui/playDiagram';
import { DISPLAY_CHANGE_EVENT, displayPrefs } from '../debug/displayOptions';
import { forcedDefCall, forcedDisguise } from '../debug/forceDefense';
import { ZONE_SHELL, breaksOn, contestsAsHelp, isZoneCall, zoneBallReaction, zoneCoverScale, zoneJobs, zoneTarget, type ZoneJob } from '../sim/zone';
import {
  TE_SIDE_RUSHER,
  blockerEdges,
  carryFor,
  edgeSign,
  lineShedTimes,
  pointOfAttack,
  pursuerFor,
  securityRatio,
  shedTimeFor,
  tackleFor,
  teHelpFor,
  type CarrierRole,
  type TacklerRole,
} from '../sim/runRatings';
import { addPoints, newGameStats, recordEvent, recordOurPlay, recordOurSimDrive, recordTheirDrive, type OurPlay } from '../sim/gameStats';
import { closeEndGame, openEndGame } from '../ui/endGame';
import { afterBothPossessions, overtimeBanner, overtimeStart, possessionOver, SHOOTOUT_PERIOD } from '../sim/overtime';
import {
  beforeSnap,
  callTimeout,
  canCallTimeout,
  huddleTick,
  clockText,
  endPlay,
  newClock,
  oppTimeoutsLeft,
  playStopsClock,
  runOff,
  tickPlay,
  type ClockEvent,
  type ClockState,
} from '../sim/clock';
import { getRngOrFallback, saveGameInProgress, setLeague, whenSaveReady } from '../save/saveSession';
import type { SaveData } from '../save/saveFormat';
import { generateLeague, pickOpponent, teamRatings, type League } from '../league/league';
import { hexToNumber, kitColors } from '../league/colors';
import { CONFERENCES, DIVISIONS } from '../league/teams';
import { closeChooseTeam, openChooseTeam } from '../ui/chooseTeam';
import { closeTeamScreen, openTeamScreen } from '../ui/teamScreen';
import { practiceRows, rosterRows } from '../league/rosterView';
import { defenseLineup, kickingUnit, offenseLineup, type DefenseLineup, type KickingUnit, type OffenseLineup } from '../league/lineup';
import { isPressureKick, kickerRules, pressureSweep, punterRules } from '../sim/kickRatings';
import type { Player } from '../players/player';
import { contestedCatchRatio, contestMods, coverFor, matchupEdge, receiverCatchChance, receiverRunParams, safetyReadTime } from '../sim/coverRatings';
import { arm, missLanding, missRadius, offTargetCatchFactor } from '../sim/qbRatings';
import { isFreshGame, sanitizeSavedGame, type SavedGame } from '../save/savedGame';
import { closeResumeGame, openResumeGame } from '../ui/resumeGame';
import { FEEL_CHANGE_EVENT } from '../debug/feelPanel';
import { CHANGE_TEAM_EVENT, CHOOSE_OPPONENT_EVENT, NEW_GAME_EVENT } from '../debug/gameControls';
import { teamStars, type TeamStars } from '../league/teamStars';

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
const LINEMAN_RADIUS = 0.8; // linemen drawn a little smaller: nine of them across ~10 yards
const SKILL_COUNT = 5; // three receivers, the running back (index RB) and the tight end (TE), each with his own man defender
/** Where a player who can't catch the ball (the TE in to block) is put for the catch checks. */
const OFF_FIELD: Vec = { x: -1000, y: -1000 };
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

type State = 'calling' | 'presnap' | 'live' | 'windup' | 'flight' | 'run' | 'return' | 'kickAim' | 'kickFlight' | 'result' | 'oppDrive' | 'gameOver';
const JUKE_MIN_PX = 25; // a flick must move at least this far to count as a juke

/** Draws the field in "yard" units; the camera zoom turns yards into screen pixels. */
export class FieldScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  private qb!: Phaser.GameObjects.Arc;
  private wrDots: Phaser.GameObjects.Arc[] = []; // receivers, then the RB (index RB)
  private cbDots: Phaser.GameObjects.Arc[] = []; // cornerbacks, then the linebacker (index RB)
  private carrierDot: Phaser.GameObjects.Arc | null = null; // whoever has the ball after a catch
  private safety!: Phaser.GameObjects.Arc; // S1 (also the punt returner)
  private safetyPos: Vec = { x: 0, y: 0 };
  /** S2 (3h-c): the bottom-half safety in a two-deep look, the robber in one deep + robber. */
  private safety2!: Phaser.GameObjects.Arc;
  private safety2Pos: Vec = { x: 0, y: 0 };
  /** Their safety look this snap (3h-c), rolled with the defensive call; readable from where the safeties stand. */
  private shell: ShellId = 'twoDeep';
  /** Disguise (D-a): the look they line up in when it isn't what they play (null = honest). */
  private shown: Look | null = null;
  /** Both alignments of a disguised snap (who rotates where), else null. */
  private rotation: Rotation | null = null;
  // After the catch / handoff / scramble: the ball carrier and everyone chasing him.
  private chase: ChaseState = startChase({ x: 0, y: 0 }, []);
  private pursuerDots: Phaser.GameObjects.Arc[] = [];
  private trailers: Trailer[] = []; // receivers / RB without the ball: they pull up and follow the play
  private steer = 0;
  private steered = false; // you've steered the RB yourself (his lane steering switches off)
  private steerTouch: { id: number; x: number; y: number; time: number } | null = null;
  // Arrow keys held down (time pressed), for steering on a keyboard; a quick tap = juke.
  private arrowDown: { up: number | null; down: number | null } = { up: null, down: null };
  private hitPauseLeft = 0;
  // Interception return: their defender runs at our end zone, our players chase (watch-only).
  private ret: ChaseState = startChase({ x: 0, y: 0 }, []);
  private returnerDot: Phaser.GameObjects.Arc | null = null;
  private returnStartX = 0;
  private chaserDots: Phaser.GameObjects.Arc[] = [];
  private skipBtn: HTMLButtonElement | null = null; // DOM button, shown during returns and result banners
  private playsBtn: HTMLButtonElement | null = null; // DOM button: reopen play calling before the snap
  private timeoutBtn: HTMLButtonElement | null = null; // DOM button, top right: timeout while the clock runs between plays
  private banner: Phaser.GameObjects.Text | null = null;
  private rusherDots: Phaser.GameObjects.Arc[] = [];
  private blockerDots: Phaser.GameObjects.Arc[] = [];
  /** Which rusher the centre is helping on this snap (3h-a). */
  private helped = 0;
  private receivers: Receiver[] = [];
  private targetIndex = 0; // the receiver the ball in the air is meant for
  private rushers: Rusher[] = [];
  private ball!: Phaser.GameObjects.Ellipse;
  private shadow!: Phaser.GameObjects.Ellipse;
  private aimG!: Phaser.GameObjects.Graphics;
  private routeG!: Phaser.GameObjects.Graphics;

  // Downs, distance and score (rules live in sim/drive.ts).
  private match: GameState = newGame();
  /** Box score for the end-of-game screen. */
  private stats = newGameStats();
  /** Overtime: our possession this period is over (the CPU's comes next). */
  private otOursDone = false;
  /** Autosave between plays. Off until the save has loaded and any CONTINUE choice is made. */
  private autosave = false;
  /** The league (teams and players), once the save has loaded. */
  private league: League | null = null;
  /** The team we're playing this game. */
  private opponentId: number | null = null;
  /** Who is on the field (from the depth charts), once both teams are known. */
  private ourLineup: OffenseLineup | null = null;
  private theirLineup: DefenseLineup | null = null;
  private ourKickers: KickingUnit | null = null;
  /** Every team's 1-5 stars (overall / offense / defense), worked out when the teams are set. */
  private stars: TeamStars[] | null = null;
  /** How far the current pass landed from where the QB aimed (his accuracy), in yards. */
  private throwMiss = 0;
  /** Last names under our skill players before the snap (formation order; the QB's is in the hint line). */
  private nameLabels: Phaser.GameObjects.Text[] = [];
  /** Runs instead of the usual next step when the current banner ends (or SKIP). */
  private nextStep: (() => void) | null = null;
  private form = formation(newGame().ballX);
  private scoreboard!: Phaser.GameObjects.Text;
  /** The defense's look at the line (LOOKS LIKE: ...), under the scoreboard until the snap. */
  private readText!: Phaser.GameObjects.Text;
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
  /** Their defensive call for this snap (3d2), rolled once per snap when the huddle opens. */
  private defCall: DefCallId = 'man';
  /** LB2's job this snap (3h-b): cover the TE, or (TE in to block) drop into the short middle / blitz. */
  private lb2Job: Lb2Job = 'cover';
  /** This snap's dice for LB2's choice (rolled with the defensive call, so reopening PLAYS keeps it). */
  private lb2Roll = 0.5;
  /** LB2 blitzing: he rushes like a lineman until our TE (who picks him up) lets him go. */
  private lb2Rush: Rusher | null = null;
  /** The play calling screen was opened at the line (PLAYS before the snap): it shows their defense. */
  private callAtLine = false;
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
    const dot = (color: number, radius = PLAYER_RADIUS) => this.add.circle(0, 0, radius, color).setStrokeStyle(0.2, COLORS.outline).setDepth(2);
    this.wrDots = Array.from({ length: SKILL_COUNT }, () => dot(COLORS.team));
    this.cbDots = Array.from({ length: SKILL_COUNT }, () => dot(COLORS.defense));
    this.safety = dot(COLORS.defense);
    this.safety2 = dot(COLORS.defense);
    this.rusherDots = Array.from({ length: BLOCKER_OF.length }, () => dot(COLORS.defense, LINEMAN_RADIUS));
    this.blockerDots = Array.from({ length: BLOCKER_OF.length + 1 }, () => dot(COLORS.team, LINEMAN_RADIUS));
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
    this.readText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffd166',
        backgroundColor: '#0d1b2add',
        padding: { x: 8, y: 3 },
        align: 'center',
      })
      .setScrollFactor(0)
      .setDepth(10)
      .setVisible(false);

    this.resetPlay();
    this.fitCamera();
    this.cameras.main.centerOn(this.cameraFocus.x, this.cameraFocus.y);
    this.scale.on('resize', () => this.fitCamera());

    // React live when a value changes in the feel panel.
    const onFeelChange = () => {
      this.fitCamera();
      this.updateLabel();
      this.sizeBall();
      this.placeNameLabels();
    };
    window.addEventListener(FEEL_CHANGE_EVENT, onFeelChange);
    this.events.once('shutdown', () => window.removeEventListener(FEEL_CHANGE_EVENT, onFeelChange));

    // ⚙ panel buttons (debug/gameControls.ts): quit to a new game, or pick another team.
    const onNewGame = () => this.startNewGame();
    const onChangeTeam = () => this.changeTeam();
    const onChooseOpponent = () => this.chooseOpponent();
    window.addEventListener(NEW_GAME_EVENT, onNewGame);
    window.addEventListener(CHANGE_TEAM_EVENT, onChangeTeam);
    window.addEventListener(CHOOSE_OPPONENT_EVENT, onChooseOpponent);
    this.events.once('shutdown', () => {
      window.removeEventListener(NEW_GAME_EVENT, onNewGame);
      window.removeEventListener(CHANGE_TEAM_EVENT, onChangeTeam);
      window.removeEventListener(CHOOSE_OPPONENT_EVENT, onChooseOpponent);
    });

    // ⚙ Display switches (matchup arrows, names): redraw the names and an open play-call screen.
    const onDisplay = () => {
      this.placeNameLabels();
      if (this.state === 'calling') this.openCall();
    };
    window.addEventListener(DISPLAY_CHANGE_EVENT, onDisplay);
    this.events.once('shutdown', () => window.removeEventListener(DISPLAY_CHANGE_EVENT, onDisplay));

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
      if (this.state === 'presnap') this.openCall(true);
    });
    document.body.appendChild(plays);
    this.playsBtn = plays;

    // TIMEOUT on the field: while the clock is running between plays (after a tackle in bounds).
    const to = document.createElement('button');
    to.id = 'timeout-btn';
    to.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.betweenPlaysClock() || !canCallTimeout(this.clock)) return;
      this.clock = callTimeout(this.clock);
      this.showBanner(`TIMEOUT (${this.clock.timeouts} LEFT)`);
      this.updateScoreboard();
      this.updateLabel();
    });
    document.body.appendChild(to);
    this.timeoutBtn = to;
    this.events.once('shutdown', () => to.remove());

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
      closeResumeGame();
      closeChooseTeam();
      closeTeamScreen();
    });

    // Once the save has loaded: pick a team (first time), offer to continue an unfinished game, then autosave.
    void whenSaveReady().then((save) => this.onSaveLoaded(save));

    // Keyboard: SPACE while aiming switches normal/bullet (a mouse has no second thumb).
    // SPACE also kicks when the kick meter is up.
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => (this.state === 'kickAim' ? this.kick() : this.toggleBullet()));
    // Arrow keys or WASD move the ball carrier: hold Up/Down (W/S) = steer, quick tap = juke,
    // Right (D) = dive / slide, like a forward flick on the phone.
    // Plain window listeners (not Phaser keys) so arrows still work on the ⚙ panel's sliders.
    const onKeyDown = (e: KeyboardEvent) => this.onArrowDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.onArrowUp(e);
    const onBlur = () => (this.arrowDown = { up: null, down: null });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });

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
    const showTimeout = this.betweenPlaysClock() && canCallTimeout(this.clock);
    if (this.timeoutBtn) {
      this.timeoutBtn.classList.toggle('show', showTimeout);
      if (showTimeout) {
        const t = `TIMEOUT (${this.clock.timeouts})`;
        if (this.timeoutBtn.textContent !== t) this.timeoutBtn.textContent = t;
      }
    }
    // Between plays a running clock visibly ticks off part of the huddle runoff (not on the play calling screen).
    if (this.betweenPlaysClock()) {
      this.clock = huddleTick(this.clock, dt, feel.clock);
      this.updateScoreboard();
    }
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
      } else if (!this.underPressure && closestRusher(this.rushThreats(), this.qbPos) <= feel.pocket.pressureYards) {
        this.underPressure = true;
        this.qb.setStrokeStyle(0.3, PRESSURE_COLOR);
      }
      if (this.state === 'live' && reachedQb(this.rushThreats(), this.qbPos, this.rushParams())) this.sack();
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
    if (this.state === 'return' || this.state === 'result' || this.state === 'calling' || this.state === 'kickFlight' || this.state === 'oppDrive' || this.state === 'gameOver') return;
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
      // Up or down, nothing in between: past the small dead zone he moves at full sideways speed.
      const dy = p.y - this.steerTouch.y;
      this.steer = Math.abs(dy) > this.scale.height * feel.running.steerDeadZoneRatio ? Math.sign(dy) : 0;
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
        this.juke(Math.sign(dy));
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

  /** Is the player carrying the ball (or about to get it on a run play)? */
  private carryingBall() {
    return this.state === 'run' || (this.state === 'live' && !!this.calledPlay.run);
  }

  /** Typing into the ⚙ panel (or moving one of its sliders): leave the arrow keys alone. */
  private static typingInPanel() {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
  }

  /** Arrow keys and WASD (by key position, so it works on any keyboard layout). */
  private static moveKey(e: KeyboardEvent): 'up' | 'down' | 'right' | null {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (e.key === 'ArrowUp' || e.code === 'KeyW') return 'up';
    if (e.key === 'ArrowDown' || e.code === 'KeyS') return 'down';
    if (e.key === 'ArrowRight' || e.code === 'KeyD') return 'right';
    return null;
  }

  private onArrowDown(e: KeyboardEvent) {
    if (FieldScene.typingInPanel()) return;
    const key = FieldScene.moveKey(e);
    if (!key) return;
    e.preventDefault(); // no page scrolling
    if (e.repeat) return;
    if (key === 'right') {
      this.goDown();
      return;
    }
    this.arrowDown[key] = this.time.now;
    if (this.carryingBall()) this.steered = true;
  }

  private onArrowUp(e: KeyboardEvent) {
    const key = FieldScene.moveKey(e);
    if (key !== 'up' && key !== 'down') return;
    const pressed = this.arrowDown[key];
    this.arrowDown[key] = null;
    if (pressed === null || this.state !== 'run') return;
    if ((this.time.now - pressed) / 1000 <= feel.running.jukeFlickTime) {
      this.juke(key === 'up' ? -1 : 1);
    }
  }

  /** Steering from the arrow keys (-1 up .. +1 down); both or neither held = 0. */
  private arrowSteer() {
    return (this.arrowDown.down !== null ? 1 : 0) - (this.arrowDown.up !== null ? 1 : 0);
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
    // A bigger arm reaches further with the same drag scale (same yards per pixel, longer max).
    const range = this.qbArm().range;
    this.target = aimTarget(this.qbPos, d.x, d.y, this.scale.height, {
      mode: feel.throw.aimMode,
      dragForMaxRatio: feel.throw.aimDragForMaxRatio * range,
      maxDistanceYards: feel.throw.maxDistanceYards * range,
    });
    // Aiming behind the QB = scramble: show a RUN arrow instead of a throw arc.
    this.setRunAim(isRunAim(this.qbPos, this.target, feel.scramble.runAimAngle));
    if (this.runAim) {
      this.target = null;
      this.drawRunPreview();
      return;
    }
    // A bullet can't go as far: same direction, cut down to its max distance.
    if (this.bulletAim) this.target = clampDistance(this.qbPos, this.target, feel.bullet.maxDistanceYards * range);
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
    this.nameLabels.forEach((t) => t.setVisible(false)); // so do the names
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

  private releaseBall(aimed: Vec) {
    // His accuracy: the ball lands somewhere in the miss oval drawn while aiming.
    const rng = getRngOrFallback();
    const radius = this.missRadiusFor(aimed);
    const target = missLanding(this.qbPos, aimed, radius, feel.ratings.scatterDepthRatio, rng.next(), rng.next());
    this.throwMiss = Math.hypot(target.x - aimed.x, target.y - aimed.y);
    this.currentThrow = this.buildThrow(this.qbPos, target, this.bulletThrow);
    this.flightElapsed = 0;
    const duration = this.currentThrow.duration;
    // A TE in to block isn't a receiver (kept far away, so the ball is never meant for him).
    this.receivers.forEach((r, i) => (r.atLanding = i === TE && this.teBlocks() ? OFF_FIELD : runnerAfter(r.runner, r.path, duration, this.runParams(i)).pos));
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
    this.receivers.forEach((r, i) => (r.runner = stepRunner(r.runner, r.path, dt, this.runParams(i))));
  }

  /**
   * The catch roll's per-player numbers (3d-c): each receiver's hands (and the QB's miss) and the
   * contested-catch trait; each defender's ball skills ([3 corners, linebacker, safety]).
   */
  private contestPlayerMods(landing: Vec) {
    const R = feel.ratings;
    const base = this.bulletThrow ? feel.bullet.catchChance : feel.catching.receiverCatchChance;
    const radius = this.bulletThrow ? feel.bullet.catchRadiusYards : feel.catching.catchRadiusYards;
    const off = this.ourLineup?.skill ?? [null, null, null, null, null];
    const def = this.theirLineup ? [...this.theirLineup.cover, this.theirLineup.safety, this.theirLineup.safety2] : [null, null, null, null, null, null, null];
    const m = def.map((p) => contestMods(p, R));
    return {
      // LB2 in his hook zone covers no one: he contests at full strength, like the safety.
      zone: def.map((_, i) => !!this.zoneJobs() || (i === TE && this.lb2Job === 'drop')),
      // Underneath zone defenders (Z-a) come from their spots to rally: help strength.
      under: this.zoneJobs()?.map((j) => contestsAsHelp(j, landing, feel)),
      receiverCatch: off.map((p) => receiverCatchChance(p, base, R) * offTargetCatchFactor(this.throwMiss, radius, R)),
      contested: off.map((p) => contestedCatchRatio(p, R)),
      breakup: m.map((x) => x.breakup),
      intercept: m.map((x) => x.intercept),
      hold: m.map((x) => x.hold),
    };
  }

  /** Receiver i's route running: his speed, acceleration and cuts (3d-c). */
  private runParams(i: number) {
    return receiverRunParams(this.ourLineup?.skill[i], routeBase(i, feel.routes), feel.ratings);
  }

  private drawReceivers() {
    this.receivers.forEach((_, i) => {
      if (i === TE && this.teBlocks()) return; // he's blocking: stepTeBlock moves him
      const p = this.receiverPosition(i);
      this.wrDots[i].setPosition(p.x, p.y);
    });
  }

  private resolveThrow() {
    const th = this.currentThrow!;
    const wrSpots = this.receivers.map((_, i) => (i === TE && this.teBlocks() ? OFF_FIELD : this.receiverPosition(i)));
    // Every defender in coverage can contest: the three cornerbacks and the deep safety.
    const cbSpots = [...this.receivers.map((r) => r.coverage.pos), { ...this.safetyPos }, { ...this.safety2Pos }];
    this.aimG.clear();
    this.state = 'result';

    const pass = resolveTargetedPass(wrSpots, cbSpots, th.to, getRngOrFallback().next(), {
      catchRadiusYards: this.bulletThrow ? feel.bullet.catchRadiusYards : feel.catching.catchRadiusYards,
      contestRadiusYards: feel.defense.contestRadiusYards,
      breakupChance: feel.defense.breakupChance,
      interceptChance: feel.defense.interceptChance,
      // An off-target ball (the QB's miss) is harder to hold on to.
      receiverCatchChance:
        (this.bulletThrow ? feel.bullet.catchChance : feel.catching.receiverCatchChance) *
        offTargetCatchFactor(this.throwMiss, this.bulletThrow ? feel.bullet.catchRadiusYards : feel.catching.catchRadiusYards, feel.ratings),
      defenderCatchChance: feel.defense.defenderCatchChance,
      shieldedContestRatio: feel.defense.shieldedContestRatio,
      helpContestRatio: feel.defense.helpContestRatio,
    }, th.from, this.contestPlayerMods(th.to));

    let result = pass.result;
    const wrPos = wrSpots[pass.receiver];
    const cbPos = cbSpots[pass.defender];
    const cbDot = [...this.cbDots, this.safety, this.safety2][pass.defender];

    // A catch only counts with the catcher's feet (centre of his circle) in bounds.
    const catcher = result === 'catch' ? wrPos : result === 'interception' ? cbPos : null;
    if (catcher && !isInBounds(catcher)) {
      result = 'incomplete';
      this.floatText(catcher.x, catcher.y - 2, 'OUT OF BOUNDS', '#f4efe1');
    }

    if (result === 'interception') {
      this.statPlay({ kind: 'pass', result: 'interception' });
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
    this.statPlay({ kind: 'pass', result: 'incomplete' });
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
    // Only the two guards chase (returns were tuned with a two-man line); the rest stay put.
    const linemen = RETURN_LINE.map((i) => this.blockerDots[i]);
    const skill = this.wrDots.slice(0, RETURN_SKILL); // not the TE (returns were tuned without him)
    this.chaserDots = [...skill, this.qb, ...linemen];
    this.ret = startChase(at, [
      ...skill.map((d) => chase(d, ic.wrChaseSpeed)),
      chase(this.qb, ic.qbChaseSpeed),
      ...linemen.map((d) => chase(d, ic.olChaseSpeed)),
    ]);
    this.qb.setStrokeStyle(0.2, COLORS.outline);
    this.updateLabel();
  }

  /** Returner's running numbers: he builds up to full speed over returnTurnTime after the pick. */
  private returnParams() {
    const ic = feel.interception;
    const ramp = ic.returnTurnTime > 0 ? Math.min(1, this.ret.t / ic.returnTurnTime) : 1;
    return { ...this.baseCarryParams(), runSpeed: ic.returnSpeed * ramp };
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
    if (step.end) this.endReturn(step.end === 'down' ? 'tackled' : step.end, step.tackler); // returners never dive
  }

  /** Numbers for one frame of a run: the carrier's running, the chase, and the tackles. */
  private chaseParams(carry: CarryParams, dirX: 1 | -1, driveSpeed = 0, rated = false): ChaseParams {
    const tk = feel.tackling;
    const tackle = {
      tackleReachYards: tk.tackleReachYards,
      brokenTackleChance: tk.brokenTackleChance,
      jukeEvadeChance: tk.jukeEvadeChance,
      stunTime: tk.stunTime,
    };
    return {
      carry,
      pursuit: { reactionTime: tk.pursuitReactionTime, leadTime: tk.pursuitLeadTime, readWindow: tk.pursuitReadWindow, driveSpeed },
      // Our ball carrier's strength and agility (his side of every tackle); returns stay plain for now.
      tackle: rated ? tackleFor(this.carrierPlayer(), this.carrierRole(), tackle, feel.ratings) : tackle,
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

  private endReturn(how: 'tackled' | 'out' | 'touchdown', tackler?: Pursuer) {
    this.state = 'result';
    const r = this.ret.carrier.pos;
    const yards = Math.max(0, Math.round(this.returnStartX - (how === 'touchdown' ? OWN_GOAL_LINE_X : r.x)));
    if (how === 'tackled') {
      const ours = this.ret.pursuers.map((q) => q.pos);
      if (this.theirFumble(r, tackler?.speed, ours, this.defenseSpots())) {
        this.hitPauseLeft = feel.juice.hitPauseTime;
        this.scheduleReset();
        return;
      }
    }
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
    this.stats = addPoints(recordEvent(this.stats, event), this.statPeriod(), state.us - this.match.us, state.them - this.match.them);
    if (this.clock.ot && possessionOver(event, state)) this.otOursDone = true;
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
    const pr = this.punterRules();
    this.kickDistance = punt ? pr.centreYards : fieldGoalDistance(this.match.ballX);
    const diff = punt ? { green: pr.green, sweepTime: pr.sweepTime } : kickDifficulty(this.kickDistance, this.kickRules());
    const kicker = punt ? this.ourKickers?.p : this.ourKickers?.k;
    const pressure = isPressureKick({ quarter: this.clock.quarter, timeLeft: this.clock.timeLeft, margin: this.match.us - this.match.them, overtime: !!this.clock.ot });
    this.kickSweep = pressureSweep(diff.sweepTime, kicker, pressure, feel.ratings);
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
      const who = kicker && feel.ratings.enabled && displayPrefs().names ? `${kicker.lastName.toUpperCase()} · ` : '';
      const title = punt ? 'PUNT · RED = SHANK' : `${what} · ${this.kickDistance} YD`;
      m.querySelector('.km-title')!.textContent = who + title;
      m.querySelector('.km-hint')!.textContent = pressure ? 'PRESSURE KICK! TAP IN THE GREEN' : 'TAP IN THE GREEN';
      m.classList.toggle('pressure', pressure);
      const green = m.querySelector<HTMLDivElement>('.km-green')!;
      green.style.left = `${((1 - diff.green) / 2) * 100}%`;
      green.style.width = `${diff.green * 100}%`;
      m.classList.remove('done');
      m.classList.add('show');
    }
    this.stepMeter(0);
    this.updateLabel();
  }

  /** Our kicker's meter: his range and green zone (rules in sim/kickRatings.ts). */
  private kickRules() {
    return kickerRules(this.ourKickers?.k, feel.kicking, feel.ratings);
  }

  /** Our punter's distance and green zone. */
  private punterRules() {
    return punterRules(this.ourKickers?.p, feel.punting, feel.ratings);
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
    const k = resolveKick(this.kickDistance, meterPosition(this.kickTime, this.kickSweep), this.kickRules());
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
    const kc = this.kickRules();
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
    return [...this.wrDots.slice(0, RETURN_SKILL), ...RETURN_LINE.map((i) => this.blockerDots[i]), this.qb];
  }

  private returnTeamDots() {
    return [...this.cbDots.slice(0, RETURN_SKILL), ...RETURN_RUSH.map((i) => this.rusherDots[i])];
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
    this.puntPlay = startPuntPlay(this.match.ballX, meterPosition(this.kickTime, this.kickSweep), { ...feel, punting: this.punterRules() }, roll, cover, team);
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
      if (end.kind === 'return' && end.how === 'tackled') {
        const ours = play.coverage.map((c) => c.pos);
        const theirs = [r, ...play.returnTeam.map((q) => q.pos)];
        if (this.theirFumble(r, end.tacklerSpeed, ours, theirs)) {
          this.hitPauseLeft = feel.juice.hitPauseTime;
          this.puntPlay = null;
          this.tweens.add({ targets: [this.ball, this.shadow], alpha: 0, duration: feel.pacing.bannerTime * 1000 });
          this.scheduleReset();
          return;
        }
      }
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
  /** Our ball carrier jukes up (-1) or down (+1), if he's ready; shows it so you know it went off. */
  private juke(dir: number) {
    const before = this.chase.carrier;
    const after = tryJuke(before, dir, this.carryParams());
    this.chase = { ...this.chase, carrier: after };
    if (after !== before) this.jukeFx(dir);
  }

  /** A juke: a puff of turf kicked up on the side he pushed off from, and a quick lean the way he cut. */
  private jukeFx(dir: number) {
    const dot = this.carrierDot;
    if (!dot) return;
    const j = feel.juice;
    for (let i = 0; i < 3; i++) {
      const puff = this.add
        .circle(dot.x - 0.4 - i * 0.5, dot.y - dir * (0.5 + i * 0.25), j.jukePuffSize * (1 - i * 0.2), 0xf4efd8, 0.95)
        .setDepth(dot.depth - 1);
      this.tweens.add({
        targets: puff,
        scale: j.jukePuffGrow,
        alpha: 0,
        x: puff.x - 0.6,
        duration: j.jukePuffTime * 1000 * (1 + i * 0.25),
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
    this.tweens.add({
      targets: dot,
      scaleX: 1 - j.jukeLean,
      scaleY: 1 + j.jukeLean,
      duration: feel.running.jukeTime * 1000,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => dot.setScale(1),
    });
  }

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
    // Corners and linebacker play this snap's call (press / off / normal man); the LB holds near the line against a run.
    const { cb: cover, lb: lbCover, lb2: lb2Cover } = coverParams(this.defCall, feel, this.match.ballX, !!this.calledPlay.run);
    // Zone call (Z-a): each defender plays an area (src/sim/zone.ts); only those whose area the ball lands in break on it.
    const jobs = this.zoneJobs();
    const live = this.receivers.filter((_, i) => !this.calledPlay.routes[i].block).map((r) => r.runner.pos);
    // A disguise (D-a): whoever lined up somewhere else plays his real job a step late and reads the throw later.
    const rot = (i: number, target: Vec) => rotatedTarget(this.rotation, i, this.playTime, target, feel);
    const late = (i: number) => rotationReadDelay(this.rotation, i, feel);
    // Man coverage: each defender follows his own man, and all of them break on a thrown ball.
    // A defender whose own man isn't the target is a step later to help.
    this.receivers.forEach((r, i) => {
      const myBall = ball && { ...ball, help: i !== this.targetIndex };
      // Each defender covers with his own ratings (3d-c): speed, man coverage, gambling.
      if (i === RB && this.defCall === 'blitz') {
        // Blitz: the linebacker shoots his gap at the QB (nobody blocks him; the RB is left uncovered).
        const goal = this.calledPlay.run ? this.form.qb : this.qbPos;
        r.coverage = { ...r.coverage, pos: stepBlitzer(r.coverage.pos, goal, this.playTime, dt, feel) };
      } else if (i === TE && this.lb2Rush) {
        // LB2 blitzing (our TE in to block): he rushes, and our TE picks him up until he gets free.
        this.lb2Rush = stepRusher(this.lb2Rush, this.qbPos, this.playTime, dt, this.rushParams());
        r.coverage = { ...r.coverage, pos: { ...this.lb2Rush.pos } };
      } else {
        const base = coverFor(this.theirLineup?.cover[i], i === TE ? lb2Cover : i === RB ? lbCover : cover, feel.ratings, !!jobs);
        if (jobs) {
          const zs = zoneCoverScale(jobs[i], feel);
          const zp = { ...zoneParams(base), ballReactionTime: zs.ballReactionTime + late(i), topSpeed: base.topSpeed * zs.speedRatio };
          const zb = ball && breaksOn(jobs[i], ball.landing, feel) ? { ...ball, help: false } : undefined;
          r.coverage = stepCoverage(r.coverage, rot(i, zoneTarget(jobs[i], live, feel)), dt, zp, zb);
        } else {
          // LB2 dropping into his hook zone heads for the spot instead of a man.
          const zone = i === TE && this.lb2Job === 'drop';
          const params = zone ? zoneParams(base) : base;
          r.coverage = stepCoverage(r.coverage, rot(i, zone ? lb2ZoneSpot(feel, this.match.ballX) : r.runner.pos), dt, { ...params, ballReactionTime: params.ballReactionTime + late(i) }, myBall);
        }
      }
      this.cbDots[i].setPosition(r.coverage.pos.x, r.coverage.pos.y);
    });

    // Safety: sits deep, shading toward the side with more receivers, stays deeper than the deepest
    // receiver; breaks on the ball once it's thrown (after a moment to read it).
    // Both safeties play this snap's look (3h-c): two deep over the halves, or one deep + a robber.
    const wrs = this.receivers.map((r) => r.runner.pos);
    const sp = (k: 0 | 1) => {
      const who = k ? this.theirLineup?.safety2 : this.theirLineup?.safety;
      const read = jobs ? zoneBallReaction(jobs[5 + k], feel) : safetyBaseReaction(feel, this.shell, k);
      const p = safetyParamsFor(feel, this.match.ballX, this.shell, k, safetyReadTime(who, read, feel.ratings));
      const d = late(5 + k);
      return { ...p, ballReactionTime: p.ballReactionTime + d, ...(p.frontBallReactionTime !== undefined && { frontBallReactionTime: p.frontBallReactionTime + d }) };
    };
    if (jobs) {
      const zb = (j: ZoneJob) => (ball && breaksOn(j, ball.landing, feel) ? ball : undefined);
      this.safetyPos = stepZoneSafety(this.safetyPos, rot(5, zoneTarget(jobs[5], live, feel)), dt, sp(0), zb(jobs[5]));
      this.safety2Pos = stepZoneSafety(this.safety2Pos, rot(6, zoneTarget(jobs[6], live, feel)), dt, sp(1), zb(jobs[6]));
    } else {
      this.safetyPos = stepSafety(this.safetyPos, wrs, dt, sp(0), ball, (t) => rot(5, t));
      this.safety2Pos = stepSafety(this.safety2Pos, wrs, dt, sp(1), ball, (t) => rot(6, t));
    }
    this.safety.setPosition(this.safetyPos.x, this.safetyPos.y);
    this.safety2.setPosition(this.safety2Pos.x, this.safety2Pos.y);

    const p = this.rushParams();
    const run = this.calledPlay.run;
    const rbPos = this.receivers[RB].runner.pos;
    // Pass play: they rush the QB. Run play: our blockers drive them back, and once free they go for the RB.
    this.rushers = this.rushers.map((r) =>
      run
        ? stepRunRusher(r, rbPos, this.playTime, dt, { driveSpeed: feel.runGame.driveSpeed, freeSpeed: feel.pocket.rushFreeSpeed }, pathYAt(this.receivers[RB].path, this.match.ballX))
        : stepRusher(r, this.qbPos, this.playTime, dt, p),
    );
    this.rushers.forEach((r, i) => {
      this.rusherDots[i].setPosition(r.pos.x, r.pos.y);
      // Blocker stays in front of his man until beaten, then is left where he was.
      if (!isFree(r, this.playTime)) {
        const spot = blockerSpot(r, run ? { x: r.pos.x - 5, y: r.pos.y } : this.qbPos, PLAYER_RADIUS * 2);
        this.blockerDots[BLOCKER_OF[i]].setPosition(spot.x, spot.y);
      }
    });
    this.stepCentre(this.rushers[this.helped], run ? { x: this.rushers[this.helped].pos.x - 5, y: this.rushers[this.helped].pos.y } : this.qbPos, dt);
    if (this.teBlocks()) this.stepTeBlock(dt);
  }

  /** Our TE stays in to block this snap (his route is Block; always on a run). */
  private teBlocks() {
    return !!this.calledPlay.routes[TE]?.block;
  }

  /**
   * The blocking TE: on LB2's blitz he stands in front of LB2 until LB2 gets free; otherwise he
   * helps on the edge rusher on his side (beside that block, on the outside).
   */
  private stepTeBlock(dt: number) {
    const dot = this.wrDots[TE];
    if (this.lb2Rush) {
      if (!isFree(this.lb2Rush, this.playTime)) this.slideToward(dot, blockerSpot(this.lb2Rush, this.qbPos, PLAYER_RADIUS * 2), dt);
      return;
    }
    const edge = this.rushers[TE_SIDE_RUSHER];
    if (!edge || isFree(edge, this.playTime)) return;
    const toward = this.calledPlay.run ? { x: edge.pos.x - 5, y: edge.pos.y } : this.qbPos;
    const spot = blockerSpot(edge, toward, PLAYER_RADIUS * 2);
    const side = Math.sign(edge.pos.y - FIELD_WIDTH / 2) || 1; // the outside
    this.slideToward(dot, { x: spot.x - 0.3, y: spot.y + side * LINEMAN_RADIUS * 1.7 }, dt);
  }

  /** Moves a dot toward a spot at the helpers' slide speed (looks only). */
  private slideToward(dot: Phaser.GameObjects.Arc, to: Vec, dt: number) {
    const d = Math.hypot(to.x - dot.x, to.y - dot.y);
    const step = Math.min(d, feel.pocket.helpSlideSpeed * dt);
    if (d > 0) dot.setPosition(dot.x + ((to.x - dot.x) / d) * step, dot.y + ((to.y - dot.y) / d) * step);
  }

  /** The centre slides over to help on the block he's doubling (until that rusher gets free). */
  private stepCentre(r: { pos: Vec; held?: number; shedAt?: number } | undefined, toward: Vec, dt: number) {
    if (!r) return;
    const engaged = r.shedAt !== undefined ? !isFree(r as { pos: Vec; shedAt: number }, this.playTime) : (r.held ?? 0) > 0;
    if (!engaged) return;
    const spot = blockerSpot({ pos: r.pos, shedAt: 0 }, toward, PLAYER_RADIUS * 2);
    const side = Math.sign(FIELD_WIDTH / 2 - r.pos.y) || 1; // beside the main blocker, on the inside
    const target = { x: spot.x - 0.3, y: spot.y + side * LINEMAN_RADIUS * 1.7 };
    const c = this.blockerDots[CENTRE];
    const d = Math.hypot(target.x - c.x, target.y - c.y);
    const step = Math.min(d, feel.pocket.helpSlideSpeed * dt);
    if (d > 0) c.setPosition(c.x + ((target.x - c.x) / d) * step, c.y + ((target.y - c.y) / d) * step);
  }

  /** Our ball carrier's running, with his ratings (speed, agility, acceleration). */
  private carryParams(): CarryParams {
    return carryFor(this.carrierPlayer(), this.carrierRole(), this.baseCarryParams(), feel.ratings);
  }

  /** Who has the ball (QB on a scramble, else the receiver / RB who caught or took it). */
  private carrierPlayer() {
    if (!this.ourLineup) return null;
    return this.qbRun ? this.ourLineup.qb : this.targetIndex >= 0 ? this.ourLineup.skill[this.targetIndex] : null;
  }

  private carrierRole(): CarrierRole {
    return this.qbRun ? 'QB' : this.rbRun ? 'RB' : this.targetIndex === TE ? 'TE' : 'WR';
  }

  private baseCarryParams(): CarryParams {
    return {
      runSpeed: this.qbRun ? feel.scramble.qbRunSpeed : this.rbRun ? feel.runGame.rbRunSpeed : this.targetIndex === TE ? feel.running.teRunSpeed : feel.running.runSpeed,
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
    const them = this.theirLineup;
    const rated = (p: Pursuer, who: Player | undefined, role: TacklerRole) => pursuerFor(who, role, p, feel.ratings);
    this.chase = startChase(at, [
      ...this.receivers.map((r, i) =>
        rated(
          {
            pos: { ...r.coverage.pos },
            speed: coveredByLinebacker(i) ? feel.defense.lbPursuitSpeed : db,
            stunned: 0,
            // On a run the linebackers read it first, and the corners stay with their receivers a moment (pass first).
            // Underneath zone defenders read pass first (Z-a): a step later on a run.
            wait: this.calledPlay.run
              ? (i === RB ? (this.defCall === 'blitz' ? 0 : feel.runGame.lbReadTime) : i === TE ? feel.runGame.lbReadTime : feel.runGame.cbReadTime) + this.zoneRunRead(i)
              : 0,
            // LB2 blitzing on a scramble: still on our TE until he beats him.
            held: i === TE && this.lb2Rush && blocking ? Math.max(0, this.lb2Rush.shedAt - this.playTime) : 0,
          },
          them?.cover[i],
          coveredByLinebacker(i) ? 'LB' : 'CB',
        ),
      ),
      // Two-deep safeties read pass first on a run play (3h-c).
      rated({ pos: { ...this.safetyPos }, speed: db, stunned: 0, wait: this.calledPlay.run ? safetyRunRead(feel, this.shell) + this.zoneRunRead(5) : 0 }, them?.safety, 'S'),
      rated({ pos: { ...this.safety2Pos }, speed: db, stunned: 0, wait: this.calledPlay.run ? safetyRunRead(feel, this.shell) + this.zoneRunRead(6) : 0 }, them?.safety2, 'S'),
      ...this.rushers.map((r, i) =>
        rated({ pos: { ...r.pos }, speed: dl, stunned: 0, held: blocking ? Math.max(0, r.shedAt - this.playTime) : 0 }, them?.rush[i], 'DL'),
      ),
    ]);
    this.pursuerDots = [...this.cbDots, this.safety, this.safety2, ...this.rusherDots];
    // Everyone else stops his route and follows the play (the carrier's own entry is ignored).
    this.trailers = this.receivers.map((r, i) => ({ pos: { x: this.wrDots[i].x, y: this.wrDots[i].y }, speed: r.runner.speed, dir: { ...r.runner.dir } }));
    this.updateLabel();
  }

  private stepRun(dt: number) {
    // Until you steer him yourself, the RB on a run play follows his lane.
    const rb = this.receivers[RB];
    const run = !!this.calledPlay.run;
    const steer =
      run && !this.steered
        ? laneSteer(this.chase.carrier.pos, rb.path, feel.runGame.laneLookAheadYards, feel.runGame.laneFullSteerYards)
        : this.steerTouch
          ? this.steer
          : this.arrowSteer();
    const rng = getRngOrFallback();
    const drive = run ? feel.runGame.driveSpeed : 0;
    const step = stepChase(this.chase, steer, dt, this.chaseParams(this.carryParams(), 1, drive, true), () => rng.next());
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
        this.blockerDots[BLOCKER_OF[i - firstRusher]].setPosition(spot.x, spot.y);
      }
    });
    const helped = this.chase.pursuers[firstRusher + this.helped];
    if (helped) this.stepCentre(helped, { x: helped.pos.x - 5, y: helped.pos.y }, dt);
    this.cameraFocus = { x: c.x + feel.camera.leadYards, y: c.y };
    if (step.missed) this.floatText(c.x, c.y - 2, step.missed === 'juked' ? 'JUKED!' : 'BROKE IT!', '#7ec8e3');
    if (step.end) this.endRun(step.end, step.tackler);
  }

  private endRun(how: 'tackled' | 'out' | 'touchdown' | 'down', tackler?: Pursuer) {
    this.state = 'result';
    this.steerTouch = null;
    this.steer = 0;
    const c = this.chase.carrier.pos;
    const yards = Math.round((how === 'touchdown' ? GOAL_LINE_X : c.x) - this.match.ballX);
    const shake = (mult: number) => this.shakeScreen(mult);
    // Box score: a catch is a completion; a scramble stopped behind the line is a sack.
    if (this.qbRun) this.statPlay(how === 'tackled' && c.x < this.match.ballX ? { kind: 'sack', yards } : { kind: 'run', yards });
    else if (this.calledPlay.run) this.statPlay({ kind: 'run', yards });
    else this.statPlay({ kind: 'pass', result: 'complete', yards, touchdown: how === 'touchdown' });
    if (how === 'touchdown') {
      shake(feel.juice.touchdownShakeScale);
      if (this.carrierDot) this.popPlayer(this.carrierDot);
      this.showBanner('TOUCHDOWN!');
    } else if (how === 'tackled') {
      this.hitPauseLeft = feel.juice.hitPauseTime; // tiny freeze-frame, then shake
      shake(yards >= feel.juice.bigGainYards ? feel.juice.bigHitShakeScale : 1);
      // A scrambling QB brought down behind the line is a sack; a run stopped for no gain is stuffed.
      const sacked = this.qbRun && c.x < this.match.ballX;
      const rng = getRngOrFallback();
      const ratio = securityRatio(this.carrierPlayer(), this.carrierRole(), feel.ratings) * (tackler?.fumbleRatio ?? 1);
      if (rollFumble({ tacklerSpeed: tackler?.speed, sack: sacked, ratio, bigHitter: tackler?.bigHitter }, feel.fumble, () => rng.next())) {
        this.floatText(c.x, c.y - 2, `${yards >= 0 ? '+' : ''}${yards} YDS`, yards < 0 ? '#ff8a8a' : '#ffd166');
        this.ourFumble(c);
        this.scheduleReset();
        return;
      }
      this.showBanner(sacked ? 'SACKED' : this.calledPlay.run && yards <= 0 ? 'STUFFED!' : 'TACKLED');
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
    const loss = Math.round(this.qbPos.x - this.match.ballX);
    this.floatText(this.qbPos.x, this.qbPos.y - 2, `${loss} YDS`, '#ff8a8a');
    this.statPlay({ kind: 'sack', yards: loss });
    const rng = getRngOrFallback();
    if (rollFumble({ sack: true, ratio: securityRatio(this.ourLineup?.qb, 'QB', feel.ratings) }, feel.fumble, () => rng.next())) {
      this.ourFumble(this.qbPos);
    } else {
      this.showBanner('SACKED');
      this.recordPlay({ kind: 'spot', x: this.qbPos.x });
    }
    this.scheduleReset();
  }

  /** One of our snaps for the box score (2-point tries don't count). Call before the rules update the game. */
  private statPlay(p: OurPlay) {
    if (!this.match.tryPending) this.stats = recordOurPlay(this.stats, p);
  }

  /** Where our 11 / their 11 stand right now (for who falls on a loose ball). */
  private offenseSpots() {
    return [this.qb, ...this.wrDots, ...this.blockerDots].map((d) => ({ x: d.x, y: d.y }));
  }

  private defenseSpots() {
    return [...this.cbDots, this.safety, this.safety2, ...this.rusherDots].map((d) => ({ x: d.x, y: d.y }));
  }

  /**
   * We were tackled and the ball came out at `at`: whoever has more players around it is likelier to
   * fall on it. FUMBLE! stays the headline; the text under it says who has it.
   */
  private ourFumble(at: { x: number; y: number }) {
    const rng = getRngOrFallback();
    const kept = rollRecovery(at, this.offenseSpots(), this.defenseSpots(), feel.fumble, () => rng.next());
    const { state, event } = applyFumble(this.match, at.x, kept);
    this.finishPlay(state, event, !kept || (event !== null && event !== 'firstDown'));
    this.shakeScreen();
    this.showBanner('FUMBLE!');
    const after: Partial<Record<NonNullable<DriveEvent>, string>> = {
      firstDown: ' · FIRST DOWN',
      turnoverOnDowns: ' · TURNOVER ON DOWNS',
      safety: ' · SAFETY',
      fumbleTD: ' · TOUCHDOWN',
    };
    const text = (kept ? 'RECOVERED' : 'LOST') + ((event && after[event]) ?? '');
    this.floatText(at.x, Math.min(at.y + 6, FIELD_WIDTH - 2), text, kept && event !== 'safety' && event !== 'turnoverOnDowns' ? '#ffd166' : '#ff8a8a');
  }

  /**
   * Their returner (interception or punt return) was tackled: maybe he fumbles. Returns true if we
   * fell on it (the play is then over: our ball there). If they fall on it nothing changes.
   */
  private theirFumble(at: { x: number; y: number }, tacklerSpeed: number | undefined, ours: { x: number; y: number }[], theirs: { x: number; y: number }[]) {
    if (this.match.tryPending) return false; // a 2-point try is over either way
    const rng = getRngOrFallback();
    if (!rollFumble({ tacklerSpeed }, feel.fumble, () => rng.next())) return false;
    this.shakeScreen();
    if (!rollRecovery(at, theirs, ours, feel.fumble, () => rng.next())) {
      this.floatText(at.x, Math.min(at.y + 6, FIELD_WIDTH - 2), 'FUMBLE! THEY KEEP IT', '#ff8a8a');
      return false;
    }
    const { state, event } = applyTakeaway(this.match, at.x);
    this.finishPlay(state, event, true);
    this.showBanner('FUMBLE!');
    const text = event === 'touchdown' ? 'RECOVERED · TOUCHDOWN!' : `OUR BALL · ${spotText(state.ballX)}`;
    this.floatText(Math.min(Math.max(at.x, 6), TOTAL_LENGTH - 6), Math.min(at.y + 6, FIELD_WIDTH - 2), text, '#ffd166');
    return true;
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
    const step = this.nextStep;
    this.nextStep = null;
    if (step) {
      step();
      return;
    }
    const ev = this.pendingBreak;
    this.pendingBreak = null;
    if (ev) {
      this.showBreak(ev);
      return;
    }
    const finish = this.finishBreak;
    this.finishBreak = null;
    finish?.();
    if (this.otOursDone) {
      this.otOursDone = false;
      this.overtimeCpu();
      return;
    }
    // Our possession is over (score, punt, turnover, second-half kickoff): their drive comes first.
    if (this.match.oppStartX !== null) {
      this.runOppDrive(this.match.oppStartX);
      return;
    }
    this.resetPlay();
  }

  /** The game right now, for the simulator: our ball on the play calling screen (down, spot, any try to take, overtime). */
  private simStateNow(): SimGameState {
    const m = this.match;
    const c = this.clock;
    return {
      score: [m.us, m.them],
      clock: c,
      timeouts: [c.timeouts, oppTimeoutsLeft(c, feel.clock)],
      offense: 0,
      startT: m.ballX,
      ...(m.tryPending ? { tryPending: true } : { down: m.down, firstDownT: m.firstDownX }),
      receives: 0, // we had the ball first; the CPU gets it to start the second half
      otFirst: 0, // in overtime we always go first
      otFirstDone: this.otOursDone,
    };
  }

  /** What the SIM button offers right now (3g-B / 3g-C). In overtime or on a try: only the whole game. */
  private simOptions() {
    const simple = !!this.clock.ot || this.match.tryPending;
    return [
      ...(simple ? [] : [{ id: 'drive', label: 'SIM THIS DRIVE', note: 'THEN BACK TO YOU' }]),
      ...(simple ? [] : [{ id: 'quarter', label: `SIM TO END OF Q${this.clock.quarter}`, note: 'STOPS AT 0:00' }]),
      { id: 'game', label: 'SIM TO END OF GAME', note: 'YOUR COACH CALLS THE PLAYS' },
    ];
  }

  /**
   * SIM (3g): carry the game on with the drive sim (our coach is neutral: the same rules as the
   * CPU's) to the end of the game, to 0:00 of this quarter, or for this possession. Every simmed drive
   * goes in the box score. A whole game ends on the end screen; otherwise a recap, then play goes on
   * from wherever the sim stopped (our ball, their drive mid-series, or overtime).
   */
  private runSim(stop: SimStop, from: SimGameState = this.simStateNow()) {
    const l = this.league;
    if (!l || l.userTeamId === null || this.opponentId === null) return;
    const result = simulateFrom(from, { mods: matchupMods(simTeam(l, l.userTeamId), simTeam(l, this.opponentId), feel), rules: feel.oppDrive, clock: feel.clock }, getRngOrFallback(), stop);
    let stats = this.stats;
    for (const e of result.log) {
      if (e.drive) stats = e.side === 0 ? recordOurSimDrive(stats, e.drive) : recordTheirDrive(stats, e.drive);
      stats = addPoints(stats, e.period, e.side === 0 ? e.points : 0, e.side === 1 ? e.points : 0);
    }
    this.stats = stats;
    this.match = { ...this.match, us: result.score[0], them: result.score[1], tryPending: false, oppStartX: null };
    this.nextClock = null;
    this.finishBreak = null;
    this.pendingBreak = null;
    const next = result.next;
    this.clock = next ? { ...next.clock, timeouts: next.timeouts[0], oppTimeouts: next.timeouts[1] } : result.clock;
    this.updateScoreboard();
    if (result.over) {
      this.showFinal();
      return;
    }
    this.state = 'oppDrive'; // nothing on the field reacts while the recap is up
    this.updateLabel();
    const title =
      result.toOvertime
        ? 'END OF REGULATION'
        : result.event === 'halftime'
          ? 'HALFTIME'
          : stop === 'quarter' && result.event === 'endQuarter'
            ? `END OF Q${this.clock.quarter - 1}`
            : 'DRIVE SIMMED';
    let nextText = 'OVERTIME NEXT';
    let carryOn = () => this.startOvertime(1);
    if (next && next.offense === 0) {
      const x = next.startT;
      const firstDownX = next.firstDownT ?? Math.min(x + YARDS_FOR_FIRST_DOWN, OPP_GOAL_X);
      const down = Math.max(1, Math.min(4, next.down ?? 1)) as GameState['down'];
      this.match = { ...this.match, ballX: x, down, firstDownX, tryPending: false, oppStartX: null };
      nextText = `YOUR BALL · ${downText(this.match)} · ${spotText(x)}`;
      carryOn = () => this.resetPlay();
    } else if (next) {
      const startX = TOTAL_LENGTH - next.startT;
      const series = next.down !== undefined && next.firstDownT !== undefined ? { down: next.down, firstDownX: TOTAL_LENGTH - next.firstDownT } : undefined;
      nextText = `${this.theirAbbr()} BALL · ${spotText(startX)}`;
      carryOn = () => this.runOppDrive(startX, series);
    }
    this.updateScoreboard();
    const ours = this.ourAbbr();
    const theirs = this.theirAbbr();
    const rows: RecapRow[] = result.log.map((e) => {
      const mine = e.side === 0;
      if (!e.drive) {
        const good = !!e.try?.good;
        return { abbr: mine ? ours : theirs, result: `${e.try?.kind === 'twoPoint' ? '2-PT TRY' : 'EXTRA POINT'} ${good ? 'GOOD' : 'NO GOOD'}`, detail: '', tone: good === mine ? 'good' : 'bad' };
      }
      const d = e.drive;
      const text = SIM_RESULT_TEXT[d.result] + (d.result === 'touchdown' && d.extraPointGood === false ? ' (NO XP)' : '');
      const scored = d.points > 0;
      const lost = d.result === 'interception' || d.result === 'fumble' || d.result === 'downs';
      const tone: RecapRow['tone'] = scored || lost ? ((scored ? mine : !mine) ? 'good' : 'bad') : '';
      const t = Math.round(d.seconds);
      return { abbr: mine ? ours : theirs, result: text, detail: `${d.plays} PL · ${d.yards} YDS · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, tone };
    });
    openSimRecap({
      title,
      rows,
      score: `${ours} ${this.match.us} - ${this.match.them} ${theirs}`,
      next: nextText,
      onContinue: carryOn,
      // SIM NEXT QUARTER: carry straight on from where it stopped.
      ...(stop === 'quarter' && next ? { onSimNext: () => this.runSim('quarter', next) } : {}),
    });
  }

  /** Their offense's stars vs our defense's, for the drive summary. */
  private driveMatchup() {
    const l = this.league;
    if (!this.stars || !l || l.userTeamId === null || this.opponentId === null) return undefined;
    return { offense: this.stars[this.opponentId].offense, defense: this.stars[l.userTeamId].defense };
  }

  /** Their offense (and kicker / punter) vs our defense: the nudges on a CPU drive's dice (3g-A). */
  private cpuDriveMods() {
    const l = this.league;
    if (!l || l.userTeamId === null || this.opponentId === null) return NEUTRAL_MODS;
    return matchupMods(simTeam(l, l.userTeamId), simTeam(l, this.opponentId), feel)[1];
  }

  /**
   * A simulated CPU drive: dice-sim it, take its time off the clock, then show the summary.
   * CONTINUE moves on: any clock break (END OF Q1 / HALFTIME / FINAL), then our play.
   */
  private runOppDrive(startX: number, series?: { down: number; firstDownX: number }) {
    this.state = 'oppDrive';
    const c = this.clock;
    const drive = simulateOppDrive(
      startX,
      {
        quarter: c.quarter,
        timeLeft: c.timeLeft,
        quarterLength: feel.clock.quarterLength,
        us: this.match.us,
        them: this.match.them,
        offenseTimeouts: oppTimeoutsLeft(c, feel.clock), // the CPU may use its own timeouts (never yours)
        // Carrying on a drive a quarter sim stopped at 0:00 (3g-C).
        ...(series ? { startDown: series.down, firstDownAtX: series.firstDownX } : {}),
      },
      feel.oppDrive,
      getRngOrFallback(),
      this.cpuDriveMods(),
    );
    const lastQuarter = c.quarter === 4;
    const used = { ...c, oppTimeouts: oppTimeoutsLeft(c, feel.clock) - drive.timeoutsUsed.offense };
    const r = runOff(used, drive.seconds, feel.clock);
    this.setClock(r.clock, r.event);
    this.pendingBreak = r.event;
    const after = applyOppDrive(this.match, drive);
    this.stats = addPoints(recordTheirDrive(this.stats, drive), r.clock.quarter, after.us - this.match.us, after.them - this.match.them);
    this.match = after;
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
    openDriveSummary({ drive, us: this.match.us, them: this.match.them, ourAbbr: this.ourAbbr(), theirAbbr: this.theirAbbr(), lastQuarter, matchup: this.driveMatchup(), onContinue: next });
  }

  /** END OF Q1 / HALFTIME / FINAL / warning banner, then on to the next play (SKIP works too). */
  private showBreak(ev: Exclude<ClockEvent, null>) {
    if (ev === 'final') {
      if (this.match.us === this.match.them) this.startOvertime(1);
      else this.showFinal();
      return;
    }
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
    this.updateScoreboard();
    this.updateLabel();
    this.resetTimer = this.time.delayedCall((hold + feel.pacing.betweenPlaysTime) * 1000, () => this.afterPlay());
  }

  /** Points go to this period in the box score: 1-4, then 5+ for overtime. */
  private statPeriod() {
    return this.clock.ot ? 4 + this.clock.ot : this.clock.quarter;
  }

  /** A banner, then `next` (when it's done, or on SKIP). */
  private bannerThen(text: string, next: () => void) {
    this.state = 'result';
    this.showBanner(text, feel.pacing.breakBannerTime);
    this.updateScoreboard();
    this.updateLabel();
    this.nextStep = next;
    this.resetTimer = this.time.delayedCall((feel.pacing.breakBannerTime + feel.pacing.betweenPlaysTime) * 1000, () => this.afterPlay());
  }

  /** Overtime period `period`: untimed, we go first from their 25 (or a 2-point try in the shootout). */
  private startOvertime(period: number) {
    this.clock = { ...this.clock, timeLeft: 0, running: false, ot: period };
    this.nextClock = null;
    this.finishBreak = null;
    this.match = overtimeStart(this.match, period);
    this.otOursDone = false;
    this.bannerThen(overtimeBanner(period), () => this.resetPlay());
  }

  /** Our overtime possession is over: the CPU's turn (a drive from our 25, or a 2-point try). */
  private overtimeCpu() {
    const period = this.clock.ot ?? 1;
    this.match = { ...this.match, oppStartX: null, tryPending: false };
    // They already lead (pick six, safety): no need for their possession.
    if (this.match.them > this.match.us) {
      this.showFinal();
      return;
    }
    const rng = getRngOrFallback();
    if (period >= SHOOTOUT_PERIOD) {
      const good = rng.chance(feel.oppDrive.twoPointChance);
      const pts = good ? 2 : 0;
      this.stats = addPoints(this.stats, this.statPeriod(), 0, pts);
      this.match = { ...this.match, them: this.match.them + pts };
      this.bannerThen(`${this.theirAbbr()} 2-PT: ${good ? 'GOOD' : 'NO GOOD'}`, () => this.overtimeNext());
      return;
    }
    this.state = 'oppDrive';
    const m = this.match;
    const sit = { quarter: 5, timeLeft: 1e6, quarterLength: feel.clock.quarterLength, us: m.us, them: m.them, overtime: true };
    const drive = simulateOppDrive(OWN_GOAL_LINE_X + 25, sit, feel.oppDrive, rng, this.cpuDriveMods());
    this.stats = addPoints(recordTheirDrive(this.stats, drive), this.statPeriod(), 0, drive.points);
    this.match = { ...m, them: m.them + drive.points };
    this.updateScoreboard();
    this.updateLabel();
    let done = false;
    openDriveSummary({
      drive,
      us: this.match.us,
      them: this.match.them,
      ourAbbr: this.ourAbbr(),
      theirAbbr: this.theirAbbr(),
      lastQuarter: false,
      overtime: true,
      matchup: this.driveMatchup(),
      onContinue: () => {
        if (done) return;
        done = true;
        closeDriveSummary();
        this.overtimeNext();
      },
    });
  }

  /** Both teams have had the ball this period: game over, or the next overtime. */
  private overtimeNext() {
    if (afterBothPossessions(this.match) === 'over') this.showFinal();
    else this.startOvertime((this.clock.ot ?? 1) + 1);
  }

  /** Game over: the end-of-game screen (score, stats); PLAY AGAIN starts a fresh game. */
  private showFinal() {
    this.otOursDone = false;
    this.nextStep = null;
    this.state = 'gameOver';
    this.clearBanner();
    this.nextClock = null;
    this.finishBreak = null;
    this.updateScoreboard();
    this.updateLabel();
    openEndGame({
      us: this.match.us,
      them: this.match.them,
      stats: this.stats,
      ourAbbr: this.ourAbbr(),
      theirAbbr: this.theirAbbr(),
      ...this.teamColors(),
      onPlayAgain: () => this.startNewGame(),
    });
    // The game is over: nothing to continue next time.
    if (this.autosave) void saveGameInProgress(null);
  }

  /**
   * The save has loaded: make the league if it's new (from the save's seed), ask the user to pick
   * a team if he hasn't yet, then offer to continue an unfinished game.
   */
  private onSaveLoaded(save: SaveData) {
    const league = save.league ?? generateLeague(save.seed);
    this.league = league;
    const ready = () => {
      this.newOpponent();
      // The play calling screen opened before the league existed: redraw it so TEAM works.
      if (this.state === 'calling') this.openCall();
      this.offerResume(save.game);
    };
    if (league.userTeamId !== null) {
      ready();
      return;
    }
    this.chooseTeam(league, (id) => {
      league.userTeamId = id;
      void setLeague(league);
      ready();
    });
  }

  /**
   * Throws away the game in progress (if any) and starts a fresh one against a new opponent:
   * PLAY AGAIN on the end screen, and NEW GAME / CHANGE TEAM in the ⚙ panel.
   */
  private startNewGame(opponentId?: number) {
    closePlayCall();
    closeDriveSummary();
    closeSimRecap();
    closeEndGame();
    closeTeamScreen();
    closeResumeGame();
    this.kickMeter?.classList.remove('show');
    this.match = newGame();
    this.clock = newClock(feel.clock);
    this.stats = newGameStats();
    this.otOursDone = false;
    this.nextStep = null;
    this.pendingBreak = null;
    this.finishBreak = null;
    this.nextClock = null;
    this.playIndex = 0;
    this.autosave = true;
    if (opponentId !== undefined) {
      this.opponentId = opponentId;
      this.applyTeams();
    } else this.newOpponent();
    void saveGameInProgress(null);
    this.updateScoreboard();
    this.resetPlay();
  }

  /** ⚙ CHANGE TEAM: pick a team again, then a fresh game with it. */
  private changeTeam() {
    const league = this.league;
    if (!league) return;
    this.chooseTeam(league, (id) => {
      league.userTeamId = id;
      void setLeague(league);
      this.startNewGame();
    });
  }

  /** ⚙ CHOOSE OPPONENT: pick who to play, then a fresh game against them (CANCEL keeps the current game). */
  private chooseOpponent() {
    const league = this.league;
    if (!league || league.userTeamId === null) return;
    const before = this.state;
    this.chooseTeam(league, (id) => this.startNewGame(id), {
      ownTeamId: league.userTeamId,
      onCancel: () => {
        if (before === 'calling') this.openCall();
      },
    });
  }

  /** The CHOOSE YOUR TEAM screen for this league; `onPick` gets the team id. `opponent` = choosing who to play instead. */
  private chooseTeam(league: League, onPick: (id: number) => void, opponent?: { ownTeamId: number; onCancel: () => void }) {
    // Stars by rank: the top fifth of the league gets 5, the bottom fifth 1.
    const ratings = league.teams.map((t) => ({ id: t.id, r: teamRatings(league, t.id) }));
    const stars = teamStars(league);
    openChooseTeam({
      opponent,
      conferences: CONFERENCES,
      divisions: DIVISIONS,
      teams: league.teams.map((t) => {
        const r = ratings[t.id].r;
        return {
          id: t.id,
          city: t.city,
          nickname: t.nickname,
          abbr: t.abbr,
          color: t.colors[0],
          conference: t.conference,
          division: t.division,
          offense: r.offense,
          defense: r.defense,
          stars: stars[t.id].overall,
        };
      }),
      onPick,
    });
  }

  /** A random opponent for a new game, and both teams' colours on the field. */
  private newOpponent() {
    if (!this.league || this.league.userTeamId === null) return;
    this.opponentId = pickOpponent(this.league, getRngOrFallback());
    this.applyTeams();
  }

  /** Field colours and scoreboard names for the two teams playing. */
  private applyTeams() {
    const l = this.league;
    if (!l || l.userTeamId === null || this.opponentId === null) return;
    const k = kitColors(l.teams[l.userTeamId], l.teams[this.opponentId]);
    const ours = hexToNumber(k.ours);
    const theirs = hexToNumber(k.theirs);
    [this.qb, ...this.wrDots, ...this.blockerDots].forEach((d) => d.setFillStyle(ours));
    [...this.cbDots, this.safety, this.safety2, ...this.rusherDots].forEach((d) => d.setFillStyle(theirs));
    this.ourLineup = offenseLineup(l, l.userTeamId);
    this.theirLineup = defenseLineup(l, this.opponentId);
    this.ourKickers = kickingUnit(l, l.userTeamId);
    this.stars = teamStars(l);
    this.placeNameLabels();
    this.updateScoreboard();
  }

  /** Our players' last names, small, under each of them before the snap (hidden once the ball is live). */
  private placeNameLabels() {
    const lu = this.ourLineup;
    if (!lu) return;
    if (!this.nameLabels.length) {
      this.nameLabels = Array.from({ length: SKILL_COUNT }, () =>
        this.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '48px', fontStyle: 'bold', color: '#f4efe1', stroke: '#14202b', strokeThickness: 8 })
          .setOrigin(0.5, 0)
          .setScale(feel.ratings.nameSize / 48)
          .setDepth(2.5),
      );
    }
    const dots = this.wrDots;
    const players = lu.skill;
    const show = this.state === 'presnap' || this.state === 'calling';
    this.nameLabels.forEach((t, i) => {
      // The slot's name goes to his left: the line is right below him (3h-a).
      const left = i === SLOT;
      t.setText(players[i].lastName.toUpperCase())
        .setScale(feel.ratings.nameSize / 48)
        .setOrigin(left ? 1 : 0.5, left ? 0.5 : 0)
        .setPosition(left ? dots[i].x - PLAYER_RADIUS - 0.3 : dots[i].x, left ? dots[i].y : dots[i].y + PLAYER_RADIUS + 0.2)
        .setVisible(show && feel.ratings.nameSize > 0 && displayPrefs().names);
    });
  }

  /** Names and matchup markers for the play-call diagram, as the ⚙ Display switches say. */
  private diagramPeople() {
    const prefs = displayPrefs();
    const m = this.diagramMatchups();
    return {
      names: prefs.names ? this.diagramNames() : null,
      // Without names their defenders show as CB / LB / S (the diagram's fallback labels).
      matchups: m ? { ...m, ...(prefs.names ? {} : { cover: [], safety: '' }), arrows: prefs.arrows } : null,
    };
  }

  /**
   * Their defenders' names and who has the edge in each matchup, for the play-call diagram.
   * No arrows when ratings are switched off (everyone is a 10 then).
   */
  private diagramMatchups(): DiagramDefense | null {
    const us = this.ourLineup;
    const them = this.theirLineup;
    if (!us || !them) return null;
    const on = !!feel.ratings.enabled;
    // A blocker has the edge when he's at least 2 points better than his rusher (same as the receivers).
    const line = (run: boolean) => blockerEdges(us.line, them.rush, run, feel.ratings).map((e) => (on ? edgeSign(e) : 0));
    return {
      cover: them.cover.map((p) => p.lastName),
      safety: them.safety.lastName,
      safety2: them.safety2.lastName,
      edge: us.skill.map((p, i) => (on ? matchupEdge(p, them.cover[i]) : 0)),
      line: { pass: line(false), run: line(true) },
    };
  }

  /** Last names for the play-call diagram (formation order), or null before the teams are known. */
  private diagramNames(): { qb: string; skill: string[] } | null {
    const lu = this.ourLineup;
    return lu ? { qb: lu.qb.lastName, skill: lu.skill.map((p) => p.lastName) } : null;
  }

  /** TEAM: the roster screen over the play calling screen (which stays as it was underneath). */
  private openTeam() {
    const l = this.league;
    if (!l || l.userTeamId === null) return;
    const t = l.teams[l.userTeamId];
    openTeamScreen({
      team: { abbr: t.abbr, city: t.city, nickname: t.nickname, color: t.colors[0] },
      roster: rosterRows(l, t.id),
      practice: practiceRows(l, t.id),
      onClose: () => {},
    });
  }

  /** Both teams' main colours (for logos / colour dots on the HTML screens). */
  private teamColors(): { ourColor?: string; theirColor?: string } {
    const l = this.league;
    if (!l || l.userTeamId === null || this.opponentId === null) return {};
    return { ourColor: l.teams[l.userTeamId].colors[0], theirColor: l.teams[this.opponentId].colors[0] };
  }

  private ourAbbr(): string {
    const l = this.league;
    return l && l.userTeamId !== null ? l.teams[l.userTeamId].abbr : 'YOU';
  }

  private theirAbbr(): string {
    return this.league && this.opponentId !== null ? this.league.teams[this.opponentId].abbr : 'CPU';
  }

  /** On launch: an unfinished game in the save = the CONTINUE / NEW GAME panel. */
  private offerResume(raw: unknown) {
    const saved = sanitizeSavedGame(raw, PLAYS.length);
    if (!saved || isFreshGame(saved, feel.clock.quarterLength)) {
      this.autosave = true;
      return;
    }
    const c = saved.clock;
    // Games saved before the league existed (or against a team that's now ours) get a random opponent.
    const l = this.league;
    const opp = saved.opponentId;
    const savedOpp = l && opp !== undefined && opp < l.teams.length && opp !== l.userTeamId ? opp : this.opponentId;
    const oppAbbr = l && savedOpp !== null ? l.teams[savedOpp].abbr : 'CPU';
    openResumeGame({
      score: `${this.ourAbbr()} ${saved.match.us} - ${saved.match.them} ${oppAbbr}`,
      situation: `${clockText(c)} · ${downText(saved.match)} · ${spotText(saved.match.ballX)}`,
      onContinue: () => {
        this.autosave = true;
        this.opponentId = savedOpp;
        this.applyTeams();
        this.loadGame(saved);
      },
      onNewGame: () => {
        this.autosave = true;
        void saveGameInProgress(null);
      },
    });
  }

  /** Picks a saved game up at the play calling screen (it was saved there, between plays). */
  private loadGame(g: SavedGame) {
    closePlayCall();
    closeDriveSummary();
    closeSimRecap();
    closeEndGame();
    this.match = g.match;
    this.clock = g.clock;
    this.stats = g.stats;
    this.playIndex = g.playIndex;
    this.otOursDone = false;
    this.nextStep = null;
    this.pendingBreak = null;
    this.finishBreak = null;
    this.nextClock = null;
    this.resetPlay();
  }

  /**
   * Autosave (each time the play calling screen opens after a play). Skipped while a clock break is
   * still to come (a try at 0:00 before the half): the last save stays, one play earlier.
   */
  private autosaveGame() {
    if (!this.autosave || this.nextClock || this.pendingBreak || this.finishBreak || this.nextStep) return;
    if (this.match.oppStartX !== null || this.state === 'gameOver') return;
    const game: SavedGame = { match: this.match, clock: this.clock, stats: this.stats, playIndex: this.playIndex };
    if (this.opponentId !== null) game.opponentId = this.opponentId;
    void saveGameInProgress(isFreshGame(game, feel.clock.quarterLength) ? null : game);
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
    if (call) {
      this.defCall = this.rollDefCall(rng.next()); // once per snap (reopening PLAYS keeps it)
      this.lb2Roll = rng.next();
      this.shell = feel.defCalls.enabled ? pickShell(this.defSituation(), feel, rng.next()) : 'twoDeep';
      if (isZoneCall(this.defCall)) this.shell = ZONE_SHELL[this.defCall]; // Cover 3: one deep (S2 rotates down); Cover 2: two deep halves
      // Disguise (D-a: only from the gear panel's Force disguise for now): line up in one look, play another.
      const dz = forcedDisguise();
      this.shown = null;
      if (dz) {
        const looks = disguiseLooks(dz, this.shell);
        this.defCall = looks.real.call;
        this.shell = looks.real.shell;
        this.shown = looks.shown;
      }
    }
    const wrStarts = this.form.skill.map((s) => s.pos);
    const align = lookAlignment(this.shownLook(), feel, this.match.ballX, wrStarts);
    this.rotation = this.shown ? { shown: align, real: lookAlignment({ call: this.defCall, shell: this.shell }, feel, this.match.ballX, wrStarts) } : null;
    this.receivers = this.form.skill.map((wr, i) => {
      const path = routePath(wr.pos, play.routes[i], wr.towardMiddle);
      // Cornerbacks line up off their receiver; the linebacker in the middle, a few yards deep.
      const cbStart = align.cover[i];
      // Each corner's speed is rolled per snap (the linebackers' aren't).
      const speed = coveredByLinebacker(i) ? 1 : rollCornerSpeed(1, feel.defense.cbSpeedVariance, rng.next());
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
    this.tweens.killTweensOf([this.qb, ...this.wrDots, ...this.cbDots, this.safety, this.safety2, this.ball, this.shadow]);
    this.safetyPos = { ...align.safeties[0] };
    this.safety2Pos = { ...align.safeties[1] };
    this.safety.setPosition(this.safetyPos.x, this.safetyPos.y).setAlpha(1).setScale(1);
    this.safety2.setPosition(this.safety2Pos.x, this.safety2Pos.y).setAlpha(1).setScale(1);
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
    // ...and each block holds for as long as our blocker wins his matchup (3e-b).
    // The centre (3h-a) helps whoever is about to get free first.
    const shed = play.run ? feel.runGame : feel.pocket;
    const hole = play.run ? pointOfAttack(this.form.rush.map((r) => r.y), pathYAt(this.receivers[RB].path, this.match.ballX)) : undefined;
    // The TE (3h-b): on a run he helps on the edge on his side; in to block on a pass, the whole line
    // holds longer with him, unless LB2 blitzes (decided now, no tell before the snap), then he picks LB2 up.
    const te = this.ourLineup?.skill[TE];
    const edgeMan = this.theirLineup?.rush[TE_SIDE_RUSHER];
    const teHelp = play.run ? { rusher: TE_SIDE_RUSHER, time: teHelpFor(te, edgeMan, true, feel.runGame.teHelpTime, feel.ratings) } : undefined;
    const sheds = lineShedTimes(this.ourLineup?.line, this.theirLineup?.rush, !!play.run, shed, () => rng.next(), feel.ratings, hole, teHelp);
    this.helped = sheds.helped;
    this.lb2Job = play.run ? 'cover' : lb2Job(!!play.routes[TE]?.block, this.lb2Roll, lb2BlitzChance(this.defSituation(), feel));
    if (this.lb2Job === 'drop') {
      const extra = teHelpFor(te, edgeMan, false, feel.pocket.teProtectTime, feel.ratings);
      sheds.shedAt = sheds.shedAt.map((t) => t + extra);
    }
    this.rushers = this.form.rush.map((pos, i) => ({ pos: { ...pos }, shedAt: sheds.shedAt[i] }));
    const pk = feel.pocket;
    this.lb2Rush =
      this.lb2Job === 'blitz'
        ? {
            pos: { ...this.receivers[TE].coverage.pos },
            shedAt: shedTimeFor(te, this.theirLineup?.cover[TE], false, { shedTime: pk.tePickupTime, shedTimeVariance: pk.shedTimeVariance }, rng.next() * 2 - 1, () => rng.next(), feel.ratings),
          }
        : null;
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
    this.placeNameLabels();
    this.cameraFocus = { x: qbStart.x + 12, y: FORMATION_VIEW_Y };
    this.updateLabel();
    this.updateScoreboard();
    if (call) {
      this.autosaveGame();
      this.openCall(false);
    }
  }

  /** The clock is running between plays and we're on the field (result banner or lined up), not calling a play. */
  private betweenPlaysClock(): boolean {
    return this.clock.running && !this.clock.ot && !this.match.tryPending && (this.state === 'result' || this.state === 'presnap');
  }

  /** Their defensive call for the coming snap, weighted by the situation and their aggression. */
  private rollDefCall(roll: number): DefCallId {
    const forced = forcedDefCall(); // ⚙ Force defense (testing)
    if (forced) return forced;
    if (!feel.defCalls.enabled) return 'man';
    return pickDefCall(this.defSituation(), feel, roll);
  }

  /** This snap's zone jobs ([3 corners, 2 LBs, 2 safeties]), or null in man coverage. */
  private zoneJobs(): ZoneJob[] | null {
    return isZoneCall(this.defCall) ? zoneJobs(this.defCall, feel, this.match.ballX) : null;
  }

  /** Extra run read for defender i (0-4 cover, 5-6 safeties) when he plays an underneath zone. */
  private zoneRunRead(i: number): number {
    const j = this.zoneJobs()?.[i];
    return j && j.kind === 'under' ? feel.zone.underRunReadTime : 0;
  }

  /** The situation their coach reads for his calls (down, distance, field, clock, score, aggression). */
  private defSituation(): DefSituation {
    const g = this.match;
    return {
      down: g.down,
      toGo: Math.max(1, Math.round((g.tryPending ? OPP_GOAL_X : g.firstDownX) - g.ballX)),
      ballX: g.ballX,
      quarter: this.clock.quarter,
      timeLeft: this.clock.timeLeft,
      lead: g.them - g.us,
      aggression: teamAggression(this.opponentId),
    };
  }

  /** Everyone rushing the QB: the rushers, plus the linebacker on a blitz (never blocked). */
  private rushThreats() {
    const all: Rusher[] = this.lb2Rush ? [...this.rushers, this.lb2Rush] : [...this.rushers];
    if (this.defCall === 'blitz') all.push({ pos: this.receivers[RB].coverage.pos, shedAt: 0 });
    return all;
  }

  /**
   * Shows the play calling screen; EXECUTE lines up the chosen play, CANCEL keeps the current one.
   * `atLine` = opened with PLAYS before the snap: the diagram shows how their defense lines up
   * (left out = same as last time, e.g. when the screen is redrawn).
   */
  private openCall(atLine?: boolean) {
    if (atLine !== undefined) this.callAtLine = atLine;
    this.state = 'calling';
    this.updateLabel();
    const fgRange = inFieldGoalRange(this.match.ballX, this.kickRules());
    openPlayCall({
      match: this.match,
      clock: clockText(this.clock),
      opponent: this.stars && this.opponentId !== null ? { abbr: this.theirAbbr(), stars: this.stars[this.opponentId].overall } : null,
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
        ? (this.clock.ot ?? 0) >= SHOOTOUT_PERIOD
          ? null // shootout: 2-point tries only
          : 'KICK XP'
        : fgRange
          ? `${this.match.down === 4 ? 'FG' : 'FIELD GOAL'} (${fieldGoalDistance(this.match.ballX)} YD)` // short on 4th: PUNT needs the room
          : null,
      onKick: () => this.startKick(),
      // 4th down: PUNT, and the coach's tip (advice only).
      canPunt: this.match.down === 4 && !this.match.tryPending && !this.clock.ot, // no punting in overtime
      onPunt: () => this.startKick(true),
      tip: coachTip({ match: this.match, quarter: this.clock.quarter, timeLeft: this.clock.timeLeft, fgRange, overtime: !!this.clock.ot }),
      onTeam: this.league && this.league.userTeamId !== null ? () => this.openTeam() : null,
      sim:
        this.league && this.league.userTeamId !== null && this.opponentId !== null
          ? { options: this.simOptions(), onSim: (id) => this.runSim(id as SimStop) }
          : null,
      ...this.diagramPeople(),
      defenseRead: this.callAtLine ? this.defenseRead() : null,
    });
  }

  /** The look they line up in: a disguise's shown look, else what they play. */
  private shownLook(): Look {
    return this.shown ?? { call: this.defCall, shell: this.shell };
  }

  /**
   * What the defense shows at the line this snap. D-a: on a disguised snap that's the SHOWN look
   * (as if our QB were fooled); D-b adds his read.
   */
  private defenseRead() {
    const { call, shell } = this.shownLook();
    return {
      call,
      name: DEF_CALL_NAMES[call],
      tip: DEF_CALL_TIPS[call],
      shell,
      // Cover 3 plays one deep: the robber spot is just where S2 starts before he rotates down.
      shellName: isZoneCall(call) ? (call === 'cover2' ? 'TWO DEEP' : 'ONE DEEP') : SHELL_NAMES[shell],
      shellTip: isZoneCall(call) ? (call === 'cover2' ? 'Two deep halves, five under' : 'Three deep, four under') : SHELL_TIPS[shell],
    };
  }

  /** The LOOKS LIKE line on the field: before the snap only (not on kicks or while calling plays). */
  private updateReadText() {
    const show = this.state === 'presnap';
    this.readText.setVisible(show);
    if (!show) return;
    const r = this.defenseRead();
    this.readText.setText(`LOOKS LIKE: ${r.name} · ${r.shellName}
${r.tip.toUpperCase()}`);
    const cam = this.cameras.main;
    this.readText.setScale(1 / cam.zoom).setOrigin(0.5, 0);
    this.placeOnScreen(this.readText, cam.width / 2, 8 + this.scoreboard.height + 4);
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
    const text = `${this.ourAbbr()} ${g.us} - ${g.them} ${this.theirAbbr()}  ${clockText(this.clock)}  ${downText(g)} · ${spotText(g.ballX)}`;
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
    this.updateReadText();
    this.label.setVisible(this.state !== 'calling'); // the play calling screen covers the field
    if (this.state === 'calling') return;
    if (this.state === 'presnap') {
      const run = this.clock.running ? ' (clock running)' : '';
      const tryText = this.match.tryPending ? '2-PT TRY: ' : '';
      const qb = this.ourLineup ? ` · QB ${this.ourLineup.qb.lastName}` : '';
      this.label.setText(`${tryText}${PLAYS[this.playIndex].name}${qb} · TAP to snap${run} · ⚙ = feel`);
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
      else this.label.setText(`${this.qbRun ? 'QB RUN' : 'RUN'}! Drag/↑↓/WS = steer · flick/tap = juke · flick →/D = ${this.qbRun ? 'slide' : 'dive'}`);
      return;
    }
    if (this.state === 'live' && this.calledPlay.run) {
      this.label.setText(`${this.calledPlay.name}: handing off… hold a thumb (or ↑↓) to steer`);
      return;
    }
    if (this.state === 'return') {
      this.label.setText('Interception return');
      return;
    }
    if (this.state === 'oppDrive') {
      this.label.setText(`${this.theirAbbr()} drive`);
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

  /** A normal pass or a bullet (flatter and faster, see feel.bullet). A big arm gets it there sooner. */
  private buildThrow(from: Vec, to: Vec, bullet: boolean) {
    const speed = this.qbArm().speed;
    return bullet
      ? makeThrow({ ...from }, to, feel.throw, feel.bullet.arcHeightRatio, feel.bullet.flightTimeRatio / speed)
      : makeThrow({ ...from }, to, feel.throw, feel.throw.arcHeightRatio, 1 / speed);
  }

  /** Our QB's arm (1 / 1 = an average arm, or no league yet). */
  private qbArm() {
    return arm(this.ourLineup?.qb, feel.ratings);
  }

  /** How far a throw to `aimed` can miss right now (his accuracy for that length, pressure, composure). */
  private missRadiusFor(aimed: Vec): number {
    const yards = Math.hypot(aimed.x - this.qbPos.x, aimed.y - this.qbPos.y);
    return missRadius(this.ourLineup?.qb, yards, this.underPressure, feel.throw, feel.ratings);
  }

  /** The miss oval around the aim point: a soft patch, wide across the throw, short along it. */
  private drawMissArea(aimed: Vec, bullet: boolean) {
    const radius = this.missRadiusFor(aimed);
    if (radius < 0.05) return;
    const len = Math.hypot(aimed.x - this.qbPos.x, aimed.y - this.qbPos.y) || 1;
    const ux = (aimed.x - this.qbPos.x) / len;
    const uy = (aimed.y - this.qbPos.y) / len;
    const along = radius * feel.ratings.scatterDepthRatio;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const al = Math.cos(a) * along;
      const ac = Math.sin(a) * radius;
      pts.push({ x: aimed.x + ux * al - uy * ac, y: aimed.y + uy * al + ux * ac });
    }
    const g = this.aimG;
    const color = this.underPressure ? 0xff6b6b : bullet ? COLORS.bullet : COLORS.aim;
    g.fillStyle(color, this.underPressure ? 0.55 : 0.42);
    g.fillPoints(pts, true);
    g.lineStyle(0.16, this.underPressure ? 0xffd0d0 : 0xffffff, 0.85);
    g.strokePoints(pts, true);
  }

  private drawAimPreview(target: Vec, bullet: boolean) {
    const th = this.buildThrow(this.qbPos, target, bullet);
    const g = this.aimG;
    g.clear();
    g.fillStyle(bullet ? COLORS.bullet : COLORS.aim, 0.9);
    const pts = arcPoints(th, Math.max(6, Math.round(Math.hypot(target.x - this.qbPos.x, target.y - this.qbPos.y) / 1.5)));
    for (const pt of pts.slice(1)) g.fillCircle(pt.x, pt.y - pt.h * feel.ball.heightDrawRatio, 0.22);
    this.drawMissArea(target, bullet);
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
