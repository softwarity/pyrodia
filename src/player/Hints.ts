/**
 * Tiered solution hints. Each purchase reveals the next share of the moves
 * needed from the current board; the revealed moves are shown live on the
 * board and follow the player's play.
 *
 * Costs are 0 for the prototype. A credit system plugs in through `cost`
 * (and the Game's payment hook) without touching gameplay code.
 */
export const HINT_CONFIG = {
  /** Cumulative share of the solution revealed after each purchase. */
  tiers: [0.3, 0.6, 1] as const,
  /** Price of each tier (credits). Free for now. */
  cost: [0, 0, 0] as const,
  /** Solver limits used to (re)compute the solution live. */
  solverBudget: 80_000,
  extraDepth: 4,
};

export function hintTierCount(): number {
  return HINT_CONFIG.tiers.length;
}

/** Number of moves revealed in total once `tier` (1-based) has been bought for a solution of `total` moves. */
export function movesRevealed(tier: number, total: number): number {
  if (tier <= 0 || total <= 0) return 0;
  const share = HINT_CONFIG.tiers[Math.min(tier, HINT_CONFIG.tiers.length) - 1];
  return Math.min(total, Math.max(1, Math.ceil(share * total)));
}

export function hintCost(tier: number): number {
  return HINT_CONFIG.cost[Math.min(Math.max(tier, 1), HINT_CONFIG.cost.length) - 1] ?? 0;
}
