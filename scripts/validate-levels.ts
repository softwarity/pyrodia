/**
 * Validates every level in the game.
 *   npm run levels:validate
 */
import { LEVELS } from '../src/level/levels';
import { parseLevel } from '../src/level/LevelParser';
import { validateGrid } from '../src/puzzle/Validator';
import { FUEL_CONFIG } from '../src/player/Fuel';

let failed = 0;
for (const def of LEVELS) {
  try {
    const parsed = parseLevel(def);
    const result = validateGrid(parsed.grid, {
      flameSpeed: def.flameSpeed,
      fuel: {
        initial: def.initialFuel ?? FUEL_CONFIG.defaultInitialFuel,
        max: def.maxFuel ?? FUEL_CONFIG.defaultMaxFuel,
        perTile: def.fuelPerTile ?? FUEL_CONFIG.defaultFuelPerTile,
        pickups: def.pickups ?? [],
      },
    });
    const sol = result.solution;
    const status = result.ok ? 'OK ' : 'ERR';
    console.log(
      `${status} #${String(def.id).padStart(3)} ${def.name.padEnd(18)} ${def.width}x${def.height} speed ${def.flameSpeed} ` +
        `path ${sol?.path.length ?? '-'} clicks ${sol?.totalClicks ?? '-'} react ${result.reactionTime.toFixed(1)}s pickups ${def.pickups?.length ?? 0}` +
        (result.warnings.length ? `  warn: ${result.warnings.join('; ')}` : ''),
    );
    if (!result.ok) {
      failed++;
      for (const e of result.errors) console.log(`      - ${e}`);
    }
  } catch (err) {
    failed++;
    console.log(`ERR #${def.id}: ${(err as Error).message}`);
  }
}
console.log(failed ? `\n${failed} level(s) failed validation` : `\nAll ${LEVELS.length} levels are valid`);
process.exit(failed ? 1 : 0);
