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

// Title -> play (level 1 = the classic "Twin Loops" board)
await page.click('button.btn:has-text("PLAY")');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/02-level1-ready.png` });
// Blodia level 1: countdown running, TURBO (Space) starts the flame, pipes get covered
const before = await page.evaluate(() => ({ phase: window.pyrodia.game.session.phase, cd: window.pyrodia.game.session.readyTimer }));
await page.keyboard.down(' ');
await page.waitForTimeout(150);
await page.keyboard.up(' ');
await page.waitForTimeout(2500);
const after = await page.evaluate(() => {
  const s = window.pyrodia.game.session;
  return { phase: s.phase, covered: s.coveredSegments.size, total: s.segmentsTotal };
});
console.log('blodia L1', JSON.stringify({ before, after }));
await page.screenshot({ path: `${out}/02b-level1-running.png` });
// Mechanics checks run on the one-slide tutorial board "First Slide"
await page.evaluate(() => {
  const { game, LEVELS } = window.pyrodia;
  game.startRun(LEVELS.findIndex((l) => l.name === 'First Slide'));
});
await page.waitForTimeout(300);

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
// hold the mouse on the hearth: speed x3 while pressed, back to normal on release
const hearth = await page.evaluate(() => {
  const { game, renderer } = window.pyrodia;
  const l = renderer.layout;
  const g = game.session.parsed.goals[0];
  return { x: l.originX + (g.x + 0.5) * l.tileSize, y: l.originY + (g.y + 0.5) * l.tileSize, base: game.session.def.flameSpeed };
});
await page.mouse.move(hearth.x, hearth.y);
await page.mouse.down();
await page.waitForTimeout(500);
const whileHeld = await page.evaluate(() => window.pyrodia.game.session.flame.speed);
await page.mouse.up();
await page.waitForTimeout(100);
const afterRelease = await page.evaluate(() => window.pyrodia.game.session.flame.speed);
console.log('hearth hold speed', { base: hearth.base, whileHeld, afterRelease });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/05-complete.png` });
const result = await page.evaluate(() => {
  const { game, progress } = window.pyrodia;
  return { state: game.state, score: game.score, stars: game.lastBreakdown?.stars, embers: progress.embers, rec: progress.record(game.currentLevel.id) };
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
await page.evaluate(() => {
  const { game, LEVELS } = window.pyrodia;
  game.startRun(LEVELS.findIndex((l) => l.name === 'Warp Zone'));
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/10-level7-warps.png` });
await page.evaluate(() => window.pyrodia.game.startRun(0));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/11-level1-classic.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.pyrodia.game.startRun(3));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/12-level12-mobile.png` });
await page.setViewportSize({ width: 1100, height: 700 });
await page.evaluate(() => window.pyrodia.game.startRun(84));
await page.waitForTimeout(800);
await page.setViewportSize({ width: 1100, height: 700 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/09-level85.png` });

// tiered solution hint on a hearth level: tap the hint button twice
await page.setViewportSize({ width: 1100, height: 700 });
await page.evaluate(() => {
  const { game, LEVELS } = window.pyrodia;
  game.startRun(LEVELS.findIndex((l) => l.name === 'Pressure'));
  document.querySelector('.debug-panel')?.remove();
});
await page.waitForTimeout(300);
await page.click('.hint-btn');
await page.waitForTimeout(200);
const hint1 = await page.evaluate(() => ({ tier: window.pyrodia.game.session.hintTier, shown: window.pyrodia.game.session.revealedMoves.length, label: document.querySelector('.hint-btn').textContent }));
await page.click('.hint-btn');
await page.waitForTimeout(300);
const hint2 = await page.evaluate(() => ({ tier: window.pyrodia.game.session.hintTier, shown: window.pyrodia.game.session.revealedMoves.length, total: window.pyrodia.game.session.hintTotal }));
console.log('hints', JSON.stringify({ hint1, hint2 }));
await page.screenshot({ path: `${out}/13-hint.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/14-hint-mobile.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
