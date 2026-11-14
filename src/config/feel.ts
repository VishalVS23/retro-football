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
    /** How far the camera looks ahead of the ball, in yards. */
    leadYards: 4,
    /** 0..1, how quickly the camera catches up each frame (higher = snappier). */
    followLerp: 0.12,
  },
  pocket: {
    /** Time from snap until the QB is sacked if he hasn't thrown. */
    sackTime: 3.0,
    /** When the "pressure is coming" warning appears. */
    pressureCueTime: 2.0,
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
  },
  catching: {
    /** How close the ball must land to a receiver to be catchable. */
    catchRadiusYards: 1.5,
    /** How far receivers will adjust toward a badly-placed ball. */
    receiverAdjustYards: 2,
  },
  pacing: {
    /** How long result banners (INCOMPLETE, SACKED...) stay up. */
    bannerTime: 0.9,
    /** Dead ball to next play ready. */
    betweenPlaysTime: 1.2,
  },
  juice: {
    hitPauseTime: 0.06,
    screenShakeTime: 0.15,
    screenShakeIntensity: 0.006,
    /** Debug: how long the touch-test ring stays visible. */
    tapRingTime: 0.4,
  },
};

export type Feel = typeof feel;
