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
    /** His top speed as a fraction of the receiver's, on average... */
    cbSpeedRatio: 0.97,
    /** ...give or take up to this share, rolled per corner per snap (a small wobble on top of his speed rating, so a mismatch isn't a sure thing). */
    cbSpeedVariance: 0.05,
    /** How long after the throw before he breaks on the ball. */
    cbBallReactionTime: 0.2,
    /** Same, for a corner whose own man ISN'T the target (he was watching his man, so he's later to help). */
    cbHelpBallReactionTime: 0.5,
    /** Momentum: how fast a defender in coverage can change speed or direction (yd/s²). Lower = cuts and well-timed throws beat him more. */
    cbTurnAcceleration: 17,
    /** How much a corner guesses where his man is going (0-1): high = tight on straight routes but fooled by cuts. */
    cbAnticipation: 0.8,
    /** Fraction of his speed when he has to turn to break on the ball (lower = harder to contest); running the ball's way he keeps full speed. */
    cbBallSpeedRatio: 0.6,
    /** Closest a defender gets to the receiver's body when breaking on the ball (can't run through him). */
    cbBodyGapYards: 0.8,
    /**
     * Defender behind the receiver (further from the QB) contests at this fraction of his strength:
     * the receiver shields the ball with his body. Lower = stop routes (Hitch, Curl) easier.
     */
    shieldedContestRatio: 0.5,
    /** A defender covering someone else (passing through, or the linebacker) contests at this fraction of his strength. */
    helpContestRatio: 0.5,
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
    /** The safety stays at least this far deeper than the deepest receiver... */
    safetyCushionYards: 3,
    /** ...backing up at this fraction of his speed to do it. */
    safetyBailRatio: 0.85,
    /** How long after the throw before the safety breaks on the ball. */
    safetyBallReactionTime: 0.25,
    /** Breaking on the ball he runs at this fraction of his speed (corners turning around get cbBallSpeedRatio; he's facing the play, so faster: no sure late dig). */
    safetyBallSpeedRatio: 0.75,
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
    /** On a pass he holds that drop only this long after the snap, then reads the RB and covers him tight (no free checkdown). */
    lbPassDropTime: 0.75,
    /** ...and then sits this far over the RB (settled, so he can tackle the catch instead of overrunning it). */
    lbCushionYards: 3,
  },
  /** Defensive calls (3d2): the CPU defense picks press man / off man / LB blitz / normal man each snap. */
  defCalls: {
    /** Press man: corners line up this close and close the rest quickly... */
    pressCushionYards: 1,
    pressCloseTime: 0.4,
    /** ...and react to their man this much faster (fraction of the normal reaction delay). */
    pressReactionRatio: 0.4,
    /** ...and turn this much quicker (x their momentum), so they sit on short routes. */
    pressTurnScale: 1.5,
    /** ...but a pressed corner who gets turned around runs at this fraction of his speed (beatable deep). */
    pressSpeedRatio: 0.94,
    /** Off man: corners line up this far off and give ground slowly. */
    offCushionYards: 8,
    offCloseTime: 2,
    /** ...and never let it close below this, so they stay on top of deep routes. */
    offFloorYards: 0.6,
    /** LB blitz: he lines up this close to the line, waits this long after the snap, then runs at the QB this fast (yd/s). */
    blitzStartYards: 2,
    blitzDelay: 0.45,
    blitzSpeed: 5.5,
    /** Base weight of each call (how often it's picked in an ordinary situation). */
    weightMan: 4,
    weightPress: 2,
    weightOff: 2,
    weightBlitz: 2,
    /** 3rd / 4th and this many yards or more = long yardage: off man gets this extra weight. */
    longYards: 7,
    longOffBonus: 4,
    /** This many yards or fewer to go = short yardage: press and blitz each get this extra weight. */
    shortYards: 2,
    shortAggressiveBonus: 2,
    /** Inside our opponent's 20 (no room to play off): extra press weight. */
    redZonePressBonus: 2,
    /** Defending a lead in the last 2 minutes of Q4: extra off-man weight. */
    preventOffBonus: 4,
    /** 0/1 switch: 0 = always normal man (as before 3d2). */
    enabled: 1,
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
    /** Cornerbacks stay with their receiver this long after the handoff before reading the run (pass first). */
    cbReadTime: 0.3,
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
    /**
     * Sideways speed while you hold up or down. Moving is normalized: sideways speed comes out of
     * forward speed, so a diagonal is never faster than running straight.
     */
    steerSpeed: 5,
    /** How snappy up/down is: 0 = instant (starts and stops the moment you press / let go); higher = eases in. */
    steerResponse: 0,
    /** Dead zone: drag your thumb up or down more than this fraction of the screen height to move. */
    steerDeadZoneRatio: 0.03,
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
    /** They read which way the runner is going from his last this-many seconds (twitching can't fool them). */
    pursuitReadWindow: 0.3,
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
  /**
   * Fumbles: only a tackle can knock the ball loose (dives, slides and going out of bounds never
   * fumble). Later: ball security rating and weather scale these.
   */
  fumble: {
    /** Chance a normal tackle knocks the ball out. */
    chance: 0.02,
    /** Chance on a big hit (tackler at least bigHitSpeed fast: defensive backs, gunners). */
    bigHitChance: 0.04,
    bigHitSpeed: 7.5,
    /** Chance a sack is a strip sack. */
    stripSackChance: 0.08,
    /** Players this close to the loose ball can fall on it (more of yours nearby = better odds). */
    recoverRadiusYards: 5,
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
  /** Field goals and extra points: the one-tap kick meter (later: kicker ratings). */
  kicking: {
    /** Longest field goal a perfect tap makes; FIELD GOAL is offered within this many yards. */
    maxRangeYards: 55,
    /** Kicks this short (extra points are 19 yd) get the easiest meter. */
    nearYards: 20,
    /** Green zone half-width, as a fraction of half the bar: short kick, max-range kick. */
    nearGreen: 0.4,
    farGreen: 0.1,
    /** Seconds for the marker to cross the bar once: short kick, max-range kick. */
    nearSweepTime: 1.1,
    farSweepTime: 0.55,
    /** Range lost by a tap at the very end of the bar (so long kicks need a centred tap). */
    powerLossRatio: 0.15,
    /** Ball flight time: short kick, max-range kick. */
    nearFlightTime: 0.9,
    farFlightTime: 1.5,
    /** Peak height of the kick, yards. */
    arcHeightYards: 7,
    /** Game seconds a field goal takes off the clock (extra points are untimed). */
    clockRunoff: 5,
  },
  punting: {
    /** Green zone half-width (fraction of half the bar); outside it = SHANK. */
    green: 0.45,
    /** Seconds for the marker to cross the bar once. */
    sweepTime: 0.85,
    /** Yards in the air: centred tap, tap at the edge of the green. */
    centreYards: 60,
    edgeYards: 46,
    /** Sideways drift of a good punt tapped at the edge of the green, yards. */
    spreadYards: 6,
    /** Shank: yards in the air just outside the green / at the end of the bar. */
    shankMaxYards: 30,
    shankMinYards: 20,
    /** Sideways slice of the worst shank, yards (half that just outside the green). */
    shankSliceYards: 22,
    /** Roll after landing, yards: good punt, shank. */
    rollYards: 5,
    shankRollYards: 2,
    /** Hang time (seconds in the air) of a full punt; shorter punts hang a bit less. */
    hangTime: 2.8,
    /** Peak height of a full punt, yards. */
    arcHeightYards: 14,
    /** Rolling speed after landing, yards per second. */
    rollSpeed: 7,
    /** Game seconds a punt takes off the clock. */
    clockRunoff: 6,
  },
  puntReturn: {
    /** Their returner waits this far past the punter (where a good punt comes down). */
    returnerDepthYards: 57,
    /** His speed while getting under the ball, yards per second. */
    returnerSpeed: 6,
    /** He can catch it if he's this close to where it comes down; otherwise it bounces. */
    catchReachYards: 1.5,
    /** Inside his own 10 he lets it bounce (hoping for a touchback). */
    letBounceYards: 10,
    /** Our nearest cover man this close when it comes down = FAIR CATCH; further off it gets less likely, never past fairCatchMaxYards. */
    fairCatchYards: 12,
    fairCatchMaxYards: 20,
    /** Chance he drops a punt he tries to return (we recover). */
    muffChance: 0.04,
    /** Return running speed (later: his speed rating) and seconds to get up to it after the catch. */
    returnSpeed: 7.6,
    returnStartTime: 0.4,
    /** He dodges a chaser this close in front of him. */
    evadeLookYards: 8,
    /** Coverage speeds: gunners (our two wide receivers), other cover men, linemen, the punter. */
    gunnerSpeed: 10,
    coverSpeed: 7.2,
    lineSpeed: 5.5,
    punterSpeed: 5,
    /** Seconds after the kick before everyone but the gunners starts running downfield. */
    coverReleaseTime: 0.3,
    /** Each cover man is slowed by up to this share at random each punt (held up by blockers). */
    coverSpeedVariance: 0.2,
    /** Cover men keep this share of their side-to-side spacing (0 = all run at the ball). */
    laneSpreadRatio: 0.4,
    /** Their blockers: speed heading for a cover man, reach, chance to hold him up, and for how long. */
    blockerSpeed: 6,
    blockReachYards: 1.2,
    blockChance: 0.4,
    blockHoldTime: 1.3,
    /** A blocker only goes after cover men no more than this far past him (toward the returner side). */
    blockLookYards: 4,
    /** After their try, blockers jog after the returner at this speed, staying this far off him. */
    returnTeamJogSpeed: 4,
    returnTeamGapYards: 6,
  },
  oppDrive: {
    /** 1 = average CPU offense; higher gains more yards every play (Stage 3: their ratings). */
    strength: 1,
    /** Share of their plays that are runs. */
    runShare: 0.45,
    /** Ordinary run: from a loss of runLossYards up to a gain of runMaxYards; a breakaway (bigRunChance) adds a big chunk. */
    runLossYards: 1,
    runMaxYards: 8,
    bigRunChance: 0.04,
    /** Pass attempts: incomplete, sacked, else a catch for passMinYards..passMaxYards; big plays add a chunk. */
    incompleteChance: 0.35,
    sackChance: 0.06,
    sackMinYards: 5,
    sackMaxYards: 9,
    passMinYards: 3,
    passMaxYards: 16,
    bigPassChance: 0.09,
    /** Extra yards on a breakaway run or big pass play. */
    bigPlayMinYards: 10,
    bigPlayMaxYards: 40,
    /** Their turnovers: a pick per pass attempt, a lost fumble per run or catch. */
    interceptionChance: 0.02,
    fumbleChance: 0.008,
    /** Game seconds per play: tackled in bounds (clock runs through the huddle) / incomplete. */
    playSeconds: 8,
    incompleteSeconds: 4,
    /** Their kicker: longest try, sure-thing distance and make chances (sure / at max range). */
    fgRangeYards: 52,
    fgSureYards: 30,
    fgSureChance: 0.95,
    fgLongChance: 0.6,
    extraPointChance: 0.95,
    /** Their 2-point tries (overtime only). */
    twoPointChance: 0.45,
    /** Their net punt, yards (after coverage and our return). */
    puntNetMinYards: 34,
    puntNetMaxYards: 46,
    /** Hurry-up when behind with this many seconds or fewer left in Q4 (two-minute drill: halfHurryTime in Q2): quicker plays, mostly passes. */
    hurryTime: 60,
    halfHurryTime: 30,
    hurryPlaySeconds: 6,
    hurryRunShare: 0.15,
    /** Ahead in Q4: they run the clock down (slower plays, mostly runs). */
    milkPlaySeconds: 11,
    milkRunShare: 0.55,
    /** End of the half/game with this many seconds or fewer left and in range: they kick the field goal now. */
    lastSnapSeconds: 8,
    /** Ahead in Q4: they take a knee once the kneel-downs left (this long each) can run out the clock. */
    kneelSeconds: 12,
    /** End of Q2 with this many seconds or fewer left and further than halfKneelYards from our goal: they kneel out the half. */
    halfKneelTime: 20,
    halfKneelYards: 60,
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
  /**
   * Player ratings on the field (Stage 3d+, src/sim/ratings.ts). A rating of 10 = the plain values
   * above; the per-point amounts below move them for better / worse players.
   */
  ratings: {
    /** 1 = ratings count, 0 = everyone plays as an average (10) player, to compare. */
    enabled: 1,
    /** Height of the players' names on the field before the snap, in yards (0 = no names). */
    nameSize: 1.3,
    /** QB throwing power: ball speed and max distance per point above / below 10 (0.025 = a 20 throws 25% faster and further). */
    armSpeedPerPoint: 0.04,
    armRangePerPoint: 0.04,
    /** QB accuracy: the ball lands inside a circle around the aim point. Radius at accuracy 10, unpressured: base + per yard thrown. */
    scatterBaseYards: 0.15,
    scatterPerYard: 0.035,
    /** Every this many accuracy points above 10 halves the circle (below doubles it). */
    accuracyHalvingPoints: 4,
    /** Under pressure the circle grows by this share at composure 10... */
    pressureScatter: 0.8,
    /** ...and every this many composure points above 10 halves that (below doubles it). */
    composureHalvingPoints: 8,
    /** The miss area is an oval: this fraction as long along the throw as across it (misses go wide more than long / short). */
    scatterDepthRatio: 0.4,
    /** Off-target balls are harder to catch: a miss up to this far from the aim point costs nothing... */
    offTargetFreeYards: 0.45,
    /** ...beyond it the receiver's catch chance drops, by this share at a miss as big as the catch zone (a lunging grab). */
    offTargetCatchLoss: 0.5,
    /** Receivers vs defenders (3d-c). Top speed per speed point, acceleration per acceleration point. */
    speedPerPoint: 0.008,
    accelerationPerPoint: 0.01,
    /** Route running: speed kept through a cut, added per point (routes.cutSpeedRatio at 10). */
    cutPerPoint: 0.02,
    /** Hands: every this many points above 10 halves a receiver's drops (below doubles them). */
    handsHalvingPoints: 5,
    /** Man coverage: every this many points above 10 halves a defender's reaction delay to his man's moves. */
    coverReactionHalvingPoints: 8,
    /** Man coverage: how quickly a defender stops and turns (momentum) per point, so a fast corner doesn't overrun stop routes. */
    coverTurnPerPoint: 0.05,
    /** Ball skills: a defender's breakup / interception chances per point. */
    ballSkillsPerPoint: 0.05,
    /** Safety: every this many points of zone coverage + anticipation above 10 halves his read on the throw. */
    safetyReadHalvingPoints: 8,
    /** Trait "Gambles on interceptions": pick chance x this, and he guesses more (anticipation + the bonus). */
    gambleInterceptBoost: 1.4,
    gambleAnticipationBonus: 0.12,
    /** Trait "Wins contested catches": defenders' breakup chance on his balls x this. */
    contestedBreakupRatio: 0.7,
    /**
     * Ball carriers vs tacklers (3e-a). These count against the AVERAGE STARTER at that role (not 10),
     * so an average runner vs average tacklers plays like today. Top speed per speed point (carriers and chasers).
     */
    runSpeedPerPoint: 0.012,
    /** Juke burst (sideways speed) per agility point. */
    jukeBurstPerPoint: 0.03,
    /** Every this many acceleration points halves the time back to full speed after a juke. */
    jukeRecoverHalvingPoints: 6,
    /** Every this many points of agility edge (runner vs tackler's agility + anticipation) doubles the odds a juke fools him. */
    elusiveOddsPoints: 6,
    /** Every this many points of strength-vs-tackling edge doubles the odds of breaking a tackle. */
    powerOddsPoints: 6,
    /** Trait "Fights for extra yards": broken-tackle odds x this. */
    extraYardsOdds: 1.4,
    /** Every this many ball-security points above average halves a carrier's fumbles (below doubles them). */
    securityHalvingPoints: 5,
    /** Trait "Goes for the strip": fumble chance on his tackles x this. */
    stripFumbleBoost: 1.5,
    /** The line (3e-b): a pass block holds this much longer per point of blocking edge (vs the average starters), shorter per point of deficit. */
    passLinePerPoint: 0.06,
    /** Same for run blocks. */
    runLinePerPoint: 0.06,
    /** Trait "Mauler": his run blocks hold this much longer. */
    maulerRunScale: 1.15,
    /** Trait "Tries to jump the snap": chance per snap he gets off early, and how much sooner (seconds) he's free of his block. */
    jumpSnapChance: 0.2,
    jumpSnapGain: 0.4,
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
    /** Juke: puffs of turf (radius in yards) that grow by this much and fade over this long, and how much he leans into the cut. */
    jukePuffSize: 0.55,
    jukePuffGrow: 2.2,
    jukePuffTime: 0.35,
    jukeLean: 0.25,
  },
};

export type Feel = typeof feel;
