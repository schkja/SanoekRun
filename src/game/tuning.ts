/**
 * Tuning: every number that decides how the game feels.
 *
 * If the game feels too hard, too easy, too slow or too floaty, change these
 * first. Distances are in metres (world units), times in seconds.
 */

export const TUNING = {
  /** Width of the path. Three lanes fit across it. */
  pathWidth: 4.6,
  /** Distance from the centre lane to a side lane. */
  laneOffset: 1.45,
  /** How snappily the runner slides between lanes (higher = faster). */
  laneChangeRate: 16,

  /** Running speed at the start and the cap it ramps up to. */
  startSpeed: 11,
  maxSpeed: 24,
  /** Metres it takes to reach top speed. */
  speedRampDistance: 3200,

  gravity: 40,
  jumpSpeed: 13.5,
  /** Swiping down in mid-air slams you back to the ground this fast. */
  fastFallSpeed: 28,
  slideTime: 0.72,
  /** Collision heights of the runner standing and sliding. */
  standHeight: 1.7,
  runnerHalfWidth: 0.34,

  /** How far before the corner a turn swipe is accepted. */
  turnEarly: 4,
  /** A swipe this long before the corner is remembered and fires in time. */
  turnBuffer: 0.3,
  /** Turning within this distance of the corner's centre counts as "perfect". */
  perfectTurnWindow: 1.6,
  /** Dodging an obstacle when it's this close counts as a close call. */
  closeCallDistance: 3.4,

  chaser: {
    /** Normal distance behind you — out of sight behind the camera. */
    restGap: 17,
    /** Where it jumps to after you stumble. */
    stumbleGap: 3.6,
    /** Seconds it stays on your heels after a stumble. A second stumble in that time = caught. */
    dangerTime: 7,
    /** Where it starts at the beginning of a run, for a "run!" moment. */
    introGap: 4.2,
    introTime: 2.6,
  },
  /** Speed multiplier for a moment after stumbling. */
  stumbleSlowdown: 0.7,
  stumbleTime: 0.55,

  segment: {
    startLength: 75,
    minLength: 34,
    maxLength: 66,
    /** Obstacle-free run-up after each corner and before the next. */
    clearAfterTurn: 10,
    clearBeforeTurn: 8,
    /** Seconds of running between obstacles at the start and at full difficulty. */
    spacingEasy: 1.4,
    spacingHard: 0.7,
    gapLengthEasy: 2.8,
    gapLengthHard: 4.2,
  },
  /** Chance that a stretch of track has a power-up on it. */
  powerupChance: 0.4,
  powerup: {
    magnetTime: 10,
    doubleTime: 10,
    /** The shield lasts until it saves you once, or this long. */
    shieldTime: 20,
    magnetReach: 7,
  },
  /** Metres of track kept built ahead of the runner. */
  lookahead: 170,

  camera: {
    distance: 6.4,
    height: 3.5,
    lookAhead: 6,
    lookHeight: 1.1,
    /** How quickly the camera swings round a corner (higher = faster). */
    yawRate: 6,
    baseFov: 62,
    maxFov: 76,
  },

  score: {
    coin: 5,
    perfectTurn: 50,
    goodTurn: 10,
    closeCall: 25,
    maxMultiplier: 5,
  },
};

/** 0 at the start of a run, 1 at full difficulty. */
export function difficultyAt(distance: number): number {
  return Math.min(1, Math.max(0, distance / TUNING.speedRampDistance));
}

/** The running speed the game aims for at a given distance. */
export function speedAt(distance: number): number {
  const d = difficultyAt(distance);
  // Ease-out: speeds up quickly at first, then levels off.
  const eased = 1 - (1 - d) * (1 - d);
  return TUNING.startSpeed + (TUNING.maxSpeed - TUNING.startSpeed) * eased;
}
