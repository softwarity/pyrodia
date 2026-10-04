import { GENERATED_LEVELS } from './data/generated';
import { HANDMADE_LEVELS } from './data/handmade';
import type { LevelDef } from './LevelDef';

/** All levels, ordered by id. Hand-made tutorial levels first, then baked generated levels. */
export const LEVELS: LevelDef[] = [...HANDMADE_LEVELS, ...GENERATED_LEVELS].sort((a, b) => a.id - b.id);

export function getLevelById(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
