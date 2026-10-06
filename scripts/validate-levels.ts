/**
 * Validates every level in the game.
 *   npm run levels:validate
 */
import { LEVELS } from '../src/level/levels';
import { validateLevel } from '../src/level/validateLevel';

let failed = 0;
for (const def of LEVELS) {
  try {
    const result = validateLevel(def);
    const status = result.ok ? 'OK ' : 'ERR';
    const kind = def.win === 'cover' ? 'cover' : `route ${result.route.length} slides ${result.movesNeeded} (scramble ${def.scramble.length})`;
    console.log(
      `${status} #${String(def.id).padStart(3)} ${def.name.padEnd(16)} ${def.width}x${def.height} speed ${def.flameSpeed} ${kind} ` +
        `react ${result.reactionTime.toFixed(1)}s pickups ${def.pickups?.length ?? 0}` +
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
