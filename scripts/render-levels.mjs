// Renders levels (default 1-20) to PNG files for visual comparison.
//   node scripts/render-levels.mjs <outDir> [from] [to]
import { chromium } from 'playwright-core';
const out = process.argv[2] || '.';
const from = Number(process.argv[3] || 1);
const to = Number(process.argv[4] || 20);
const browser = await chromium.launch({ executablePath: process.env.PYRODIA_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto('http://localhost:4173/?debug=1', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('.debug-panel')?.remove());
for (let id = from; id <= to; id++) {
  await page.evaluate((id) => {
    const { game, LEVELS } = window.pyrodia;
    game.startRun(LEVELS.findIndex((l) => l.id === id));
    document.querySelector('.debug-panel')?.remove();
    document.querySelector('.hint')?.remove();
  }, id);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/mine-${String(id).padStart(2, '0')}.png` });
}
await browser.close();
