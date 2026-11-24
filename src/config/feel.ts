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
    /**
     * 0..1: while aiming a pass, how far the camera slides up/down toward the aim point (so the far
     * sideline comes into view when you aim at a receiver near it). 0 = stays put.
     */
    aimFollowY: 0.8,
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
    /** The centre's help (3h-a): the rusher about to get free first is held this much longer. */
    helpTime: 0.6,
    /**
     * Tight end in to block (3h-b): with an extra man the whole line holds this much longer (scaled by
     * his matchup with the edge on his side)... unless LB2 blitzes, then he picks LB2 up, holding him about this long.
     */
    teProtectTime: 0.3,
    tePickupTime: 1.6,
    /** How fast the centre slides over to help, yards per second (looks only). */
    helpSlideSpeed: 4,
    /** Rusher speed while blocked / once free, yards per second. */
    rushBlockedSpeed: 1,
    rushFreeSpeed: 6,
    /** A rusher this close to the QB = sack. */
    sackReachYards: 1.2,
    /** A rusher this close shows the red pressure warning. */
    pressureYards: 3.5,
    /** How far the QB drops back after the snap, and how long it takes. */
    dropbackYards: 2.2,
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
    /**
     * Safety looks (3h-c), picked by their coach each snap. ONE DEEP + ROBBER: S1 plays the deep
     * middle with the safety* values above; S2 (the robber) sits this deep in the middle and jumps
     * throws there. TWO DEEP: each safety over his half, `twoDeepHalfYards` off the middle, this deep,
     * reading / breaking on the ball with these.
     */
    robberDepthYards: 10,
    robberBallReactionTime: 0.25,
    robberBallSpeedRatio: 0.75,
    twoDeepDepthYards: 18,
    twoDeepHalfYards: 8,
    twoDeepBallReactionTime: 0.7,
    twoDeepBallSpeedRatio: 0.5,
    /**
     * ...but a ball coming down IN FRONT of a two-deep safety (shorter than where he stands: he's facing
     * it, nothing to turn around for) he reads after this long and drives on at this share of his speed.
     * Else an early deep shot at ~13 yd landed in front of him before he moved (caught ~85%).
     */
    twoDeepFrontReactionTime: 0.65,
    twoDeepFrontSpeedRatio: 0.6,
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
    /** Second linebacker (3h-b): lines up this far below the middle, over our tight end... */
    lb2OffsetYards: 4.5,
    /** ...and on a pass drops only this deep at first (LB1's deeper drop leaves the RB room; LB2 has the flat). */
    lb2PassDropYards: 5,
    /** ...then covers the TE from only this far over the top (LB1's 3-yd cushion left every drag and seam free). */
    lb2CushionYards: 1,
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
    /**
     * Our tight end stays in to block (3h-b): LB2 blitzes with his usual blitz share x this (capped),
     * else he drops to a hook zone this deep and this far toward the top from the middle (the two-receiver side).
     */
    lb2BlitzScale: 1.8,
    lb2BlitzMax: 0.65,
    lb2ZoneDepthYards: 6,
    lb2ZoneTopYards: 1,
    /**
     * Safety look weights (3h-c): two deep vs one deep + robber. 3rd / 4th and long and protecting a
     * late lead = more two deep; short yardage and the red zone = more robber.
     */
    weightTwoDeep: 1,
    weightRobber: 1,
    longTwoDeepBonus: 1,
    shortRobberBonus: 1,
    redZoneRobberBonus: 1,
    preventTwoDeepBonus: 2,
    /** Base weight of each call (how often it's picked in an ordinary situation). */
    weightMan: 4,
    weightPress: 2,
    weightOff: 2,
    weightBlitz: 2,
    /** Zone calls (Z-c): about a third of ordinary snaps between them. */
    weightCover3: 2.5,
    weightCover2: 2.5,
    /** 3rd / 4th and this many yards or more = long yardage: off man (and the zones) get this extra weight. */
    longYards: 7,
    longOffBonus: 4,
    longCover2Bonus: 2,
    longCover3Bonus: 1,
    /** This many yards or fewer to go = short yardage: press and blitz each get this extra weight, zones x this. */
    shortYards: 2,
    shortAggressiveBonus: 2,
    shortZoneRatio: 0.3,
    /** Inside our opponent's 20 (no room to play off): extra press weight, zones x this. */
    redZonePressBonus: 2,
    redZoneZoneRatio: 0.7,
    /** Defending a lead in the last 2 minutes of Q4: extra off-man (and zone) weight. */
    preventOffBonus: 4,
    preventCover2Bonus: 2,
    preventCover3Bonus: 1,
    /**
     * Disguises (D-a): a defender who lines up somewhere else than his real call puts him plays his
     * real job from the snap, but aims off by the gap between the two spots, shrinking to nothing over
     * this long (the rotation). So he's a step late, and a disguise never gets both looks at once.
     */
    disguiseRotateTime: 0.35,
    /** ...and a defender who rotates more than `disguiseGapYards` reads the throw this much later all play (his eyes were on his rotation). */
    disguiseReadDelay: 0.2,
    disguiseGapYards: 3,
    /**
     * D-b: their coach disguises this share of the snaps a disguise fits (average aggression), x (0.6 +
     * 0.8 x aggression); less in short yardage and the red zone (no time / room to rotate). Disguises
     * fit Cover 3, Cover 2, man (fake blitz; with a robber also shown as Cover 2) and a blitz (hidden),
     * not press / off, so 0.27 = about 1 snap in 5 overall.
     */
    disguiseChance: 0.27,
    disguiseShortRatio: 0.4,
    disguiseRedZoneRatio: 0.5,
    /** 0/1 switch: 0 = always normal man (as before 3d2). */
    enabled: 1,
  },
  /** Zone calls (Z-a): where each zone defender sets up and how far his area reaches (src/sim/zone.ts). */
  zone: {
    /** Cover 3: the middle deep third is this far either side of the middle; the outside thirds are the rest. */
    thirdEdgeYards: 9,
    /** Deep-third corners set up this deep, this far from the middle (centre of their third). */
    deepThirdDepthYards: 15,
    deepThirdSpotYards: 15,
    /** ...and line up this far off their receiver before the snap (backed off: the Cover 3 tell). */
    cover3CushionYards: 7,
    /** Deep defenders stay this much deeper than the deepest receiver in their lane. */
    deepCushionYards: 1,
    /** Underneath landmarks: this deep; hooks this far from the middle, curl / flat this far. */
    underDepthYards: 5,
    hookYards: 3,
    curlFlatYards: 11,
    /** An underneath defender carries a receiver at most this far past his landmark, then lets the deep man have him. */
    underCarryYards: 5,
    /** Cover 2 (Z-b): the outside corners line up this far off and this far OUTSIDE their receiver (the tell vs two-deep man)... */
    cover2CushionYards: 3,
    cover2ShadeYards: 2,
    /** ...and squat in the flat: this deep, this far from the middle; their area reaches in to this far from the middle. */
    c2FlatDepthYards: 5,
    c2FlatYards: 15,
    c2FlatInsideYards: 9,
    /** The slot corner (top) and LB2 (bottom) take the curls this far from the middle; LB1 the hook this far (top side). */
    c2CurlYards: 5,
    c2HookYards: 0.5,
    /** Each half safety follows the deepest receiver on his half only this share of the way across (he stays between the middle and the sideline: the hole shot). */
    c2HalfFollow: 0.2,
    /** A receiver this far outside a lane still counts as in it (handoffs at the edges). */
    laneOverlapYards: 1.5,
    /** Underneath defenders shade toward a receiver in their area but stay within this of their landmark. */
    underReachYards: 3.5,
    /** When the ball is thrown only the defenders whose area it lands in break on it: lanes count this much wider... */
    breakMarginYards: 1,
    /** ...underneath defenders take balls up to this far past their landmark, deep ones balls up to this far in front of theirs. */
    underBreakDepthYards: 6,
    deepBreakYards: 4,
    /** Cover 2 halves break on balls in their half up to this far in front of their landmark (else 11-14 yd was nobody's: under 11 the corners, past 14 the halves). */
    c2DeepBreakYards: 5,
    /**
     * Cover 2 flat corners SINK: they never come up for a receiver short of their landmark; one who runs
     * past it they carry up to `c2SinkCarryYards` past it (at most `c2SinkReachYards` off it), aiming
     * `c2SinkLeadYards` ahead of him (they react late, so this keeps them about level). They break on balls
     * in their area up to `c2SinkBreakYards` past the landmark and contest them at full strength (they're
     * playing the receiver). Else a ball thrown early to ~13 yd down the sideline was nobody's (caught ~87%).
     */
    c2SinkCarryYards: 9,
    c2SinkReachYards: 7,
    c2SinkLeadYards: 3,
    c2SinkBreakYards: 9,
    /** Zone defenders read the throw and turn on it this long after it leaves the QB's hand (man help defenders: cbHelpBallReactionTime): deep ones (bailing)... */
    deepBallReactionTime: 0.45,
    /** ...underneath ones (eyes on the QB) quicker. */
    underBallReactionTime: 0.1,
    /** On a run, underneath zone defenders read pass first: they're this much later to come up after the handoff than in man. */
    underRunReadTime: 0.35,
    /** ...deep ones give ground at this share of their speed (bailing), and outside thirds keep this much outside leverage. */
    deepSpeedRatio: 0.92,
    deepLeverageYards: 1,
  },
  /**
   * In-game adjustments (A-a): their coach's scouting memory of this game (src/sim/scouting.ts) and
   * how it shifts his calls.
   */
  adjust: {
    /** Before each new snap is noted, the old counts fade to this share (recent snaps count most). */
    memoryFade: 0.8,
    /** A pass thrown less than this past the line is short; this far or more is deep. */
    shortAirYards: 8,
    deepAirYards: 15,
    /** He's fully sure of a habit after this many (faded) snaps. */
    sureSnaps: 4,
    /** Habits start past these shares (runs of all snaps; short / deep of the passes). An ordinary mix leans on nothing. */
    runShareFrom: 0.5,
    shortShareFrom: 0.6,
    deepShareFrom: 0.3,
    /** A lean this strong (0..1) is worth a hint on the strip (if our QB reads it). */
    hintFrom: 0.5,
    /**
     * Extra call weight at a full lean, x (0.5 + the coach's adjust speed): runs -> blitz, press and the
     * robber look; quick short passes -> press and Cover 2 (corners sitting in the flats; a blitz leaves the
     * RB open, measured); deep shots -> off man, Cover 2 and two deep.
     */
    runBlitzBonus: 5,
    runPressBonus: 2,
    runRobberBonus: 4,
    shortPressBonus: 2,
    shortCover2Bonus: 4,
    deepOffBonus: 3,
    deepCover2Bonus: 3,
    deepTwoDeepBonus: 2,
    /**
     * A-b, sitting on a play: once a play's faded count reaches `keyFrom` (less `keyFastSpeedUp` for the
     * fastest-adjusting coach) and one target on it (not the RB: an LB sitting on the flat measured no
     * better) has `keyTargetFrom` faded throws, the defender on that target leans toward where those throws
     * land (relative to the line), reads the throw x `jumpReactionRatio` and contests at full strength.
     * Measured (avg QB, man / robber / Cover 3): that throw -24 to -32 points (TE drag -43, go -12); other
     * targets on the same play unchanged.
     */
    keyFrom: 2.4,
    keyFastSpeedUp: 0.8,
    keyTargetFrom: 1.5,
    jumpReactionRatio: 1,
    /** ...but he only goes this share of the way from where his job puts him toward that spot (1 = right on it). */
    jumpBlend: 0.5,
    /**
     * A-c, the hot receiver: a WR or the TE with `hotCatches` catches or `hotYards` yards this game (a
     * fast coach sooner: up to `hotFastCatches` / `hotFastYards` fewer) who is also our most-targeted
     * receiver gets bracketed on man calls: S2 shadows him over the top (`bracketCushionYards` deeper,
     * never shallower than `bracketMinDepthYards` past the line, reading and breaking like a deep half
     * safety; his corner has him underneath; he lines up there too); S1 keeps his own job, so the far
     * half (two deep) or the middle (robber gone) opens up.
     */
    hotCatches: 3,
    hotYards: 40,
    hotFastCatches: 1,
    hotFastYards: 15,
    bracketCushionYards: 4,
    bracketMinDepthYards: 12,
    /** ...and with that help deep, his corner plays him tight underneath: reaction x this, turns x this, cushion at most this. */
    bracketReactionRatio: 0.5,
    bracketTurnScale: 1.4,
    bracketCushionMax: 2,
  },
  /**
   * Formations (F-b): the TRIPS check. Against Trips in man coverage the corner on the empty side
   * stays home in a flat zone (this deep, this far from the middle; his area reaches in to
   * `tripsCornerInsideYards`), and S2 comes down on the inside slot (lines up this deep, covers him
   * from this far over the top, a man defender: full strength only on throws to him); S1 keeps the
   * snap's look (two deep: over the Trips half, so the TE side opens deep). Without it the backside corner
   * followed the inside slot across and the Toss to the empty side went +38%.
   */
  formations: {
    tripsCornerDepthYards: 4,
    tripsCornerFlatYards: 12,
    tripsCornerInsideYards: 3,
    tripsSafetyDepthYards: 7,
    tripsSafetyCushionYards: 2,
    /**
     * F-c2, the SPREAD check (man calls): S2 comes down on the split-out TE (same depth / cushion as the
     * Trips safety), and LB2, with nobody to cover, drops into his hook zone or blitzes. His blitz
     * chance is the usual one (`lb2BlitzChance`) x this, and with no TE to pick him up he is free after
     * this long (the RB / centre get a piece of him first).
     */
    spreadBlitzScale: 0.6,
    spreadBlitzFreeTime: 0.6,
    /**
     * SPREAD on a run: the bottom slot receiver blocks his corner (who starts right next to the Toss lane)
     * for this long after the handoff: pushed back, can't tackle (like a held rusher). Without it the Toss
     * from SPREAD averaged ~1.0 yd vs 2.3 from NORMAL; with it ~1.7 (longer blocks change nothing: then LB2,
     * with no TE to block him, makes the tackle).
     */
    spreadSlotBlockTime: 0.8,
  },
  /** Run plays (Dive, Toss): the handoff, run blocking and the running back. */
  runGame: {
    /** Running back's speed with the ball (later: his speed rating). */
    rbRunSpeed: 7,
    /** Average time our blockers hold a defender on a run, and the random +/- on it (big = more stuffed runs). */
    shedTime: 1,
    shedTimeVariance: 0.7,
    /** The centre's help on a run (3h-a): the defender about to get free first is held this much longer. */
    helpTime: 0.4,
    /** On a run the tight end helps on the edge rusher on his side: that block holds this much longer. */
    teHelpTime: 0.05,
    /** How fast our blockers push held defenders back, yards per second. */
    driveSpeed: 1.2,
    /** Linebacker pauses this long after the handoff to read the run. */
    lbReadTime: 0.4,
    /** Cornerbacks stay with their receiver this long after the handoff before reading the run (pass first). */
    cbReadTime: 0.3,
    /** Two-deep safeties (3h-c) are pass-first too: they wait this long after the handoff (the robber doesn't). */
    twoDeepRunReadTime: 0.4,
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
    /** Tight end with the ball (3h-b): a little quicker than a linebacker (6.8), slower than a receiver. */
    teRunSpeed: 7.0,
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
    /** Tight end's route speed, as a share of a receiver's (3h-b: bigger, a step slower). */
    teSpeedRatio: 0.94,
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
    /** Two scores down in Q4 (by this many or more): more passes, deeper shots. */
    riskMargin: 9,
    /** ...doublings of the big-pass odds and of the interception odds while taking risks. */
    riskBigPlaySteps: 0.6,
    riskPickSteps: 0.6,
  },
  clock: {
    /** Game seconds per quarter (user's choice: 2 minutes; 3 since 2026-11-23 so scores look like football: ~17 drives a game instead of ~12). */
    quarterLength: 180,
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
    /**
     * D-b: an average starting QB reads a disguise before the snap this often; every this many points of
     * 0.5 vision + 0.5 decisions above the average starter doubles the odds (below halves them).
     */
    qbReadChance: 0.5,
    qbReadDoublingPoints: 2.2,
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
    runLinePerPoint: 0.04,
    /** Trait "Mauler": his run blocks hold this much longer. */
    maulerRunScale: 1.15,
    /** Trait "Tries to jump the snap": chance per snap he gets off early, and how much sooner (seconds) he's free of his block. */
    jumpSnapChance: 0.2,
    jumpSnapGain: 0.4,
    /** Kickers (3f), against the average starting K / P. Field goal range, yards per kick-power point. */
    kickRangePerPoint: 1.4,
    /** Green zone width per kick-accuracy point (field goals and extra points). */
    kickGreenPerPoint: 0.07,
    /** Pressure kick (Q4 last 2 min in a one-score game, or OT): the meter is this much faster for an average kicker... */
    pressureMeterSpeedUp: 0.3,
    /** ...halved per this many points of composure + concentration above average (doubled below). */
    pressureHalvingPoints: 5,
    /** Punter: yards in the air per kick-power point. */
    puntYardsPerPoint: 1.5,
    /** Punt green zone width per kick-accuracy point (fewer shanks). */
    puntGreenPerPoint: 0.05,
    /**
     * Simulated drives (3g-A): unit matchups nudge the CPU drive dice, against the average starters.
     * Every unit edge is scaled by simEdgeScale (the units add up over a whole game), then capped at simEdgeCap points (so upsets stay possible).
     */
    simEdgeScale: 0.33, // 0.4 with 2-minute quarters; more drives = the better team wins more often
    simEdgeCap: 2.5,
    /** Completions: doublings of the catch odds per point of passing edge (QB accuracy + receivers vs coverage). */
    simCompletionOddsPerPoint: 0.16,
    /** Yards per catch / per run: share per point of passing / running edge. */
    simPassYardsPerPoint: 0.07,
    simRunYardsPerPoint: 0.11,
    /** Big plays: doublings of the odds per point of edge. */
    simBigPlayOddsPerPoint: 0.15,
    /** Interceptions: halvings of the odds per point of QB decisions over the defenders' ball skills. */
    simPickOddsPerPoint: 0.12,
    /** Sacks: halvings of the odds per point of pass-blocking edge. */
    simSackOddsPerPoint: 0.15,
    /** Field goals: doublings of the make odds per point of kick accuracy. */
    simKickOddsPerPoint: 0.15,
    /** Share of the punter's extra distance that survives the return. */
    simPuntNetShare: 0.7,
    /** Simulated drives (3h-d): the TE counts as a receiver at this share of a WR (LB2 covering him likewise next to the corners)... */
    simTeWeight: 0.5,
    /** ...and as this share of the run blocking (the line the rest). */
    simTeBlockShare: 0.15,
    /**
     * Home field (4b): the home team's passing, running and pass blocking get this many rating points
     * of edge in the drive sim (sims, CPU drives in your games, SIM), the away team's lose as many.
     * Tuned so the home team wins ~55% of games between two equal teams, like real football.
     */
    simHomeEdge: 0.22, // measured: 0 = 50%, 0.2 = 54-55%, 0.5 = 62%, 1 = 75% home wins
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
