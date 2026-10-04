/** Global gameplay configuration. Everything tunable lives here. */
export const CONFIG = {
  /** Lives at the start of a run. */
  startingLives: 3,
  /**
   * The level starts when the player makes the first move (or taps the flame),
   * Blodia style: study the board as long as you like, the clock starts with you.
   * Set a positive value to start automatically after that many seconds instead.
   */
  autoStartDelay: 0,
  /** Seconds the death screen stays before the level restarts. */
  deathDelay: 1.9,
  /** Fixed simulation step (seconds) for deterministic movement. */
  simStep: 1 / 120,
  /** Slide animation duration in seconds (visual only). */
  slideAnimDuration: 0.11,
  /** Max lookahead steps for the debug "show path" view. */
  debugPathSteps: 200,
  /** Approximate falling physics in tile units. */
  fall: { gravity: 9, launchSpeed: 1.2, maxDuration: 1.6 },
} as const;
