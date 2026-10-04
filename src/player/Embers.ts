/**
 * Embers: the persistent player resource. Uses are described as data so new
 * ones (revive, hints, modifiers, cosmetics) can be added without touching
 * the game loop.
 */
export type EmberUseId = 'fuel' | 'time';

export interface EmberUse {
  id: EmberUseId;
  label: string;
  cost: number;
  description: string;
  /** Fuel added (for 'fuel'). */
  fuel?: number;
  /** Seconds added (for 'time'). */
  seconds?: number;
}

export const EMBER_USES: EmberUse[] = [
  { id: 'fuel', label: 'EMERGENCY FUEL', cost: 3, description: '+30 fuel', fuel: 30 },
  { id: 'time', label: 'EMERGENCY TIME', cost: 3, description: '+5 seconds', seconds: 5 },
];

export function emberUse(id: EmberUseId): EmberUse {
  const u = EMBER_USES.find((x) => x.id === id);
  if (!u) throw new Error(`unknown ember use ${id}`);
  return u;
}
