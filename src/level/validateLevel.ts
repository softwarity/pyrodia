import { FUEL_CONFIG } from '../player/Fuel';
import { validateGrid, type ValidationResult } from '../puzzle/Validator';
import type { LevelDef } from './LevelDef';
import { parseLevel } from './LevelParser';

/** Validate one level definition with the right rules for its win mode. */
export function validateLevel(def: LevelDef, budget?: number): ValidationResult {
  const parsed = parseLevel(def);
  if (def.win === 'cover') {
    const s = parsed.start;
    return validateGrid(parsed.grid, {
      flameSpeed: def.flameSpeed,
      mode: 'cover',
      start: { x: s.x, y: s.y, entry: s.enterFrom ?? s.dir },
    });
  }
  return validateGrid(parsed.grid, {
    flameSpeed: def.flameSpeed,
    knownSolution: parsed.solution,
    budget,
    fuel: {
      initial: def.initialFuel ?? FUEL_CONFIG.defaultInitialFuel,
      max: def.maxFuel ?? FUEL_CONFIG.defaultMaxFuel,
      perTile: def.fuelPerTile ?? FUEL_CONFIG.defaultFuelPerTile,
    },
  });
}
