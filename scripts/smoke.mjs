import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';

function findChromium() { return process.env.PYRODIA_CHROMIUM || '/opt/pw-browsers/chromium';
  const base = '/opt/pw-browsers';
  if (existsSync(`${base}/chromium`) && !readdirSync(base).includes('chromium/')) {
    try { const st = readdirSync(`${base}/chromium`); if (st.includes('chrome-linux')) return `${base}/chromium/chrome-linux/chrome`; } catch { return `${base}/chromium`; }
  }
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium')) {
      const p = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
      const p2 = `${base}/${d}/chrome-linux64/chrome`;
      if (existsSync(p2)) return p2;
    }
  }
  return `${base}/chromium`;
}

const out = process.argv[2];
const url = process.argv[3] || 'http://localhost:4173/?debug=1';
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/01-title.png` });

// Title -> play
await page.click('button.btn:has-text("PLAY")');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/02-level1-ready.png` });

// Tap the flame to start, then let it fall (no slide) -> death
const src = await page.evaluate(() => {
  const { game, renderer } = window.pyrodia;
  const l = renderer.layout;
  const s = game.session.parsed.start;
  return { x: l.originX + (s.x + 0.5) * l.tileSize, y: l.originY + (s.y + 0.5) * l.tileSize };
});
await page.mouse.click(src.x, src.y);
await page.waitForTimeout(6500);
await page.screenshot({ path: `${out}/03-splash.png` });
const stateAfterDeath = await page.evaluate(() => ({ state: window.pyrodia.game.state, lives: window.pyrodia.game.lives.count }));
console.log('after death', stateAfterDeath);
await page.waitForTimeout(2200);

// Now level restarted: rotate tile (2,2) once and win
const cell = await page.evaluate(() => {
  const { game, renderer } = window.pyrodia;
  const l = renderer.layout;
  return { x: l.originX + 2.5 * l.tileSize, y: l.originY + 2.5 * l.tileSize, state: game.state };
});
console.log('restart', cell.state);
await page.mouse.click(cell.x, cell.y);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/04-rotated.png` });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/05-complete.png` });
const result = await page.evaluate(() => {
  const { game, progress } = window.pyrodia;
  return { state: game.state, score: game.score, stars: game.lastBreakdown?.stars, embers: progress.embers, rec: progress.record(1) };
});
console.log('after win', JSON.stringify(result));

// Next level and level select
await page.click('button.btn:has-text("NEXT LEVEL")');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/06-level2.png` });
await page.keyboard.press('p');
await page.waitForTimeout(300);
await page.click('button.btn:has-text("LEVELS")');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/07-levels.png` });

// mobile portrait
await page.setViewportSize({ width: 390, height: 844 });
await page.click('.level-btn:not(.locked) >> nth=1');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/08-mobile.png` });

// the warp tutorial and a late level for visuals
await page.setViewportSize({ width: 1100, height: 700 });
await page.evaluate(() => window.pyrodia.game.startRun(6));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/10-level7-warps.png` });
await page.evaluate(() => window.pyrodia.game.startRun(8));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/11-level9-classic.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.pyrodia.game.startRun(11));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/12-level12-mobile.png` });
await page.setViewportSize({ width: 1100, height: 700 });
await page.evaluate(() => window.pyrodia.game.startRun(84));
await page.waitForTimeout(800);
await page.setViewportSize({ width: 1100, height: 700 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/09-level85.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
