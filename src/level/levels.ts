import { BLODIA_LEVELS } from './data/blodia';
import { GENERATED_LEVELS } from './data/generated';
import { HANDMADE_LEVELS } from './data/handmade';
import type { LevelDef } from './LevelDef';

/**
 * All levels, ordered by id: the Blodia boards (1-20, travel every pipe), the
 * PYRODIA tutorial (21-28, reach the hearth), then baked generated levels.
 */
export const LEVELS: LevelDef[] = [...BLODIA_LEVELS, ...HANDMADE_LEVELS, ...GENERATED_LEVELS].sort((a, b) => a.id - b.id);

export function getLevelById(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
