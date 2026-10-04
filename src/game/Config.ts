/** Global gameplay configuration. Everything tunable lives here. */
export const CONFIG = {
  /** Lives at the start of a run. */
  startingLives: 3,
  /** Seconds before the flame starts moving when a level begins (player can already rotate). */
  readyDelay: 1.5,
  /** Seconds the death screen stays before the level restarts. */
  deathDelay: 1.9,
  /** Fixed simulation step (seconds) for deterministic movement. */
  simStep: 1 / 120,
  /** Rotation animation duration in seconds (visual only). */
  rotateAnimDuration: 0.12,
  /** Max lookahead steps for the debug "show path" view. */
  debugPathSteps: 200,
  /** Approximate falling physics in tile units. */
  fall: { gravity: 9, launchSpeed: 1.2, maxDuration: 1.6 },
} as const;
