/**
 * FEEL SETTINGS: every number that controls how the game *feels* lives here.
 * Never hard-code these anywhere else. The feel tuning panel (stage 1, step 3)
 * will edit these live. Starting values come from "Feel notes" in CLAUDE.md.
 *
 * Times are in seconds, distances in yards unless the name says otherwise.
 */
export const feel = {
  camera: {
    /** Extra space shown above and below the field, in yards. */
    sidelineMarginYards: 3,
    /** 1 = whole field width fits the screen height; higher = closer in (camera follows up/down). */
    zoomScale: 1.5,
    /** How far the camera looks ahead of the ball, in yards. */
    leadYards: 4,
    /** 0..1, how quickly the camera catches up each frame (higher = snappier). */
    followLerp: 0.12,
  },
  pocket: {
    /**
     * Pass rush (replaces the old fixed 3s sack timer; defaults give a sack at ~3s).
     * Later scaled by pass rush vs offensive line ratings.
     */
    /** Average time our blockers hold a rusher before he breaks free. */
    shedTime: 2.2,
    /** Random +/- spread on that time, per rusher, per play. */
    shedTimeVariance: 0.3,
    /** Rusher speed while blocked / once free, yards per second. */
    rushBlockedSpeed: 1,
    rushFreeSpeed: 6,
    /** A rusher this close to the QB = sack. */
    sackReachYards: 1.2,
    /** A rusher this close shows the red pressure warning. */
    pressureYards: 3.5,
    /** How far the QB drops back after the snap, and how long it takes. */
    dropbackYards: 3,
    dropbackTime: 0.6,
  },
  defense: {
    /** Cornerback lines up this far downfield of the receiver... */
    cbCushionYards: 5,
    /** ...and closes that cushion over this many seconds after the snap. */
    cbCushionCloseTime: 1.5,
    /** How late he reacts to the receiver's moves (bigger = more open after cuts). */
    cbReactionTime: 0.25,
    /** His top speed as a fraction of the receiver's. */
    cbSpeedRatio: 0.95,
    /** How long after the throw before he breaks on the ball. */
    cbBallReactionTime: 0.2,
    /** Fraction of his speed when breaking on the ball (lower = harder for him to contest). */
    cbBallSpeedRatio: 0.6,
    /** A defender within this distance of the landing spot can contest the catch. */
    contestRadiusYards: 2.5,
    /** Breakup chance when he's right on the ball (less when further away). */
    breakupChance: 0.6,
    /** Interception chance when he's closer to the ball than the receiver. */
    interceptChance: 0.35,
    /** Chance he holds on when the ball is thrown straight to him (later: hands rating). */
    defenderCatchChance: 0.75,
    /** How deep the safety lines up behind the line of scrimmage. */
    safetyDepthYards: 15,
    /** How fast the safety drifts while reading the play (fraction of his speed). */
    safetyDriftRatio: 0.5,
  },
  running: {
    /** Ball carrier's forward speed after the catch (later: his speed rating). */
    runSpeed: 7.5,
    /** Fastest sideways speed when steering with your thumb. */
    steerSpeed: 5,
    /** How snappy steering is (higher = turns quicker). */
    steerResponse: 10,
    /** Dragging this fraction of the screen height = full steer. */
    steerDragRatio: 0.2,
    /** Juke: sideways burst speed, how long it lasts, and the wait before the next. */
    jukeSpeed: 9,
    jukeTime: 0.18,
    jukeCooldown: 0.6,
    /** A drag shorter than this (seconds) counts as a flick = juke. */
    jukeFlickTime: 0.25,
  },
  tackling: {
    /** A defender this close can try to tackle. */
    tackleReachYards: 1.1,
    /** Tiny window after the catch before anyone can tackle (time to react / juke). */
    catchGraceTime: 0.2,
    /** Chance the runner breaks a tackle attempt (later: strength, "fights for extra yards"). */
    brokenTackleChance: 0.15,
    /** Chance a defender completely misses if the runner is mid-juke. */
    jukeEvadeChance: 0.6,
    /** How long a defender who missed is out of the play. */
    stunTime: 0.7,
    /** How late defenders react to the runner's moves. */
    pursuitReactionTime: 0.2,
    /** How far ahead they aim when chasing (pursuit angle), in seconds. */
    pursuitLeadTime: 0.35,
    /** Chasing speeds: defensive backs (fast) and linemen (slower). */
    dbPursuitSpeed: 7.2,
    dlPursuitSpeed: 5.5,
  },
  routes: {
    /** Receiver top speed, yards per second (later scaled by his speed rating). */
    topSpeed: 8,
    /** How quickly he reaches top speed, yards per second per second. */
    acceleration: 16,
    /** Speed kept through a cut (1 = razor-sharp, lower = slower, rounder cuts). */
    cutSpeedRatio: 0.55,
  },
  throw: {
    /** Earliest the QB can release after the snap. */
    earliestRelease: 0.3,
    /** Ball flight time at the short/medium/deep reference distances. */
    flightTimeShort: 0.5,
    flightTimeMedium: 1.0,
    flightTimeDeep: 1.6,
    shortYards: 5,
    mediumYards: 12,
    deepYards: 25,
    /** Longest throw for an average arm. */
    maxDistanceYards: 40,
    /** Peak height of the arc, as a fraction of throw distance. */
    arcHeightRatio: 0.25,
    /** 0 = push (drag toward the target), 1 = slingshot (pull back away from it). */
    aimMode: 1,
    /** Dragging this fraction of the screen height = a max-distance throw. */
    aimDragForMaxRatio: 0.45,
    /** Wind-up before the ball leaves the QB's hand (anticipation squash). */
    windupTime: 0.08,
    /** How much the QB squashes during the wind-up. */
    windupSquashRatio: 0.3,
  },
  ball: {
    /** How far up the screen the ball is drawn per yard of height (shows the arc). */
    heightDrawRatio: 1,
    /** How much bigger the ball looks per yard of height. */
    growPerYard: 0.05,
    /** Ball radius on the ground, in yards. */
    radiusYards: 0.45,
    /** How far an incomplete pass skids after landing. */
    skidYards: 1.5,
  },
  catching: {
    /** How close the ball must land to a receiver to be catchable. */
    catchRadiusYards: 1.5,
    /** How far receivers will adjust toward a badly-placed ball. */
    receiverAdjustYards: 2,
    /** Chance an open receiver holds on to a catchable ball (later: hands, morale, form). */
    receiverCatchChance: 0.95,
    /** How fast receivers drift toward the ball, yards per second. */
    receiverAdjustSpeed: 6,
    /** Size the receiver pops to on a catch. */
    catchPopScale: 1.5,
    catchPopTime: 0.18,
  },
  pacing: {
    /** How long result banners (INCOMPLETE, SACKED...) stay up. */
    bannerTime: 0.9,
    /** Dead ball to next play ready. */
    betweenPlaysTime: 1.2,
    /** Banner pop-in and fade-out. */
    bannerPopTime: 0.12,
    bannerFadeTime: 0.15,
  },
  juice: {
    hitPauseTime: 0.06,
    screenShakeTime: 0.15,
    screenShakeIntensity: 0.006,
    /** Gains of at least this many yards shake the screen. */
    bigGainYards: 15,
    /** How long the "+12 YDS" popup floats. */
    yardsPopupTime: 0.9,
    /** How far the "+12 YDS" popup rises, in yards. */
    yardsPopupRise: 3,
    /** Screen shake multipliers for touchdowns and big hits (after long gains). */
    touchdownShakeScale: 2,
    bigHitShakeScale: 1.5,
  },
};

export type Feel = typeof feel;
