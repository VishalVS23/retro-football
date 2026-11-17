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
    zoomScale: 1.2,
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
    /** Closest a defender gets to the receiver's body when breaking on the ball (can't run through him). */
    cbBodyGapYards: 0.8,
    /**
     * Defender behind the receiver (further from the QB) contests at this fraction of his strength:
     * the receiver shields the ball with his body. Lower = stop routes (Hitch, Curl) easier.
     */
    shieldedContestRatio: 0.5,
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
    /** Linebacker: lines up this deep, in the middle, and covers the running back. */
    lbDepthYards: 5,
    /** On a run play he never comes closer to the line than this before the handoff (he waits for the play). */
    lbFloorYards: 5,
    /** On a pass play he drops back to at least this deep until the throw (so the RB checkdown has room). */
    lbPassDropYards: 8,
    /** His top speed in coverage as a fraction of a receiver's, and how late he reacts. */
    lbSpeedRatio: 0.85,
    lbReactionTime: 0.35,
    /** His chasing speed once someone has the ball. */
    lbPursuitSpeed: 6.8,
  },
  /** Run plays (Dive, Toss): the handoff, run blocking and the running back. */
  runGame: {
    /** Running back's speed with the ball (later: his speed rating). */
    rbRunSpeed: 7,
    /** Average time our blockers hold a defender on a run, and the random +/- on it (big = more stuffed runs). */
    shedTime: 1,
    shedTimeVariance: 0.7,
    /** How fast our blockers push held defenders back, yards per second. */
    driveSpeed: 1.2,
    /** Linebacker pauses this long after the handoff to read the run. */
    lbReadTime: 0.4,
    /** Until you steer, the RB follows his lane: aims this far ahead on it... */
    laneLookAheadYards: 2,
    /** ...and steers fully once he's this far off it. */
    laneFullSteerYards: 1.5,
    /** How long the pitch takes to reach the RB on a Toss (just the picture: he has it on arrival). */
    pitchFlightTime: 0.15,
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
    /** A juke costs speed: forward speed during it, as a fraction of full speed... */
    jukeForwardRatio: 0.8,
    /** ...and how long it takes to get back to full speed afterwards. */
    jukeRecoverTime: 0.2,
    /** A drag shorter than this (seconds) counts as a flick = juke. */
    jukeFlickTime: 0.25,
  },
  /** Going down on your own: flick FORWARD while running (D on a keyboard). */
  dive: {
    /** Dive length: minYards just after a juke, up to maxYards at full speed. */
    minYards: 1,
    maxYards: 3,
    /** How long the dive takes (nobody can tackle him during it). */
    time: 0.3,
    /** A scrambling QB slides feet-first instead: no extra yards, this long to go down. */
    qbSlideTime: 0.3,
  },
  /** Teammates without the ball once someone has it (after a catch, handoff or scramble). */
  teammates: {
    /** Seconds to pull up out of his route. */
    stopTime: 0.5,
    /** Then he jogs after the play at this speed... */
    jogSpeed: 4.5,
    jogAcceleration: 8,
    /** ...staying this far behind the ball carrier, and at most this far to the side. */
    trailYards: 3,
    maxSideYards: 8,
  },
  /** QB scramble: aim behind the QB and release to tuck the ball and run. */
  scramble: {
    /** Aiming within this many degrees of straight back counts as "run" (90 = anything behind him). */
    runAimAngle: 60,
    /** QB's running speed (slower than a receiver's runSpeed; later: his speed rating). */
    qbRunSpeed: 6.5,
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
    stunTime: 0.55,
    /** How late defenders react to the runner's moves. */
    pursuitReactionTime: 0.2,
    /** How far ahead they aim when chasing (pursuit angle), in seconds. */
    pursuitLeadTime: 0.35,
    /**
     * Chasing speeds: defensive backs and linemen. DBs are a bit faster than any ball carrier, so a
     * defender with an angle can still run you down; one you've fully beaten can't.
     */
    dbPursuitSpeed: 7.9,
    dlPursuitSpeed: 5.5,
  },
  /** Interception returns: the defender runs at our end zone and our players chase him (watch-only). */
  interception: {
    /** Returner's running speed (later: his speed rating). Below our receivers' chase speed. */
    returnSpeed: 6.2,
    /** Seconds to turn around and get up to full speed after the pick. */
    returnTurnTime: 0.6,
    /** He starts dodging a chaser this close in front of him. */
    evadeLookYards: 8,
    /** Chasing speeds: our receivers, the QB, our linemen. */
    wrChaseSpeed: 7.2,
    qbChaseSpeed: 5.5,
    olChaseSpeed: 5,
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
  /**
   * Bullet pass (tap with the other thumb while aiming): flat and fast, but shorter and harder
   * to catch. Later: arm strength speeds it up, receiver hands affect the drop chance.
   */
  bullet: {
    /** Flight time as a fraction of a normal pass over the same distance (lower = faster). */
    flightTimeRatio: 0.55,
    /** Peak height as a fraction of distance (normal pass: throw.arcHeightRatio). */
    arcHeightRatio: 0.06,
    /** Longest bullet; aiming further gets cut down to this. */
    maxDistanceYards: 25,
    /** Catch zone (normal pass: catching.catchRadiusYards). */
    catchRadiusYards: 1.1,
    /** Chance an open receiver holds on (normal pass: catching.receiverCatchChance). */
    catchChance: 0.88,
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
    /** END OF Q1 / HALFTIME / FINAL banners stay up longer than play banners. */
    breakBannerTime: 1.8,
  },
  clock: {
    /** Game seconds per quarter (user's choice: 2 minutes). */
    quarterLength: 120,
    /** Game seconds the huddle takes when the clock keeps running (tackle in bounds). */
    huddleRunoff: 5,
    /** Late-quarter warning in Q2 and Q4 (clock stops once at this time). */
    warningTime: 30,
    /** Our timeouts per half (whole number). */
    timeoutsPerHalf: 3,
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
