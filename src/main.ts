import './style.css';
import { AudioManager } from './audio/AudioManager';
import { WebAudioBackend } from './audio/WebAudioBackend';
import { Game } from './game/Game';
import { PointerInput } from './input/PointerInput';
import { LEVELS } from './level/levels';
import { LocalStorageAdapter } from './persistence/Storage';
import { Progress } from './player/Progress';
import { CanvasRenderer } from './render/CanvasRenderer';
import { DebugPanel } from './ui/DebugPanel';
import { UI } from './ui/UI';

const DEBUG_ENABLED = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const storage = new LocalStorageAdapter();
const progress = new Progress(storage);
const audio = new AudioManager(new WebAudioBackend());
audio.setEnabled(progress.settings.sound);

const game = new Game(LEVELS, progress, audio);
const renderer = new CanvasRenderer(canvas);
const ui = new UI(uiRoot, game);
const debugPanel = DEBUG_ENABLED ? new DebugPanel(uiRoot, game, renderer) : null;

// ----- wiring: game events -> audio / effects ----------------------------------

game.events.on('levelLoaded', () => {
  const s = game.session;
  if (!s) return;
  renderer.particles.clear();
  s.events.on('slide', () => audio.slideTile());
  s.events.on('slideDenied', ({ reason }) => {
    if (reason !== 'void') audio.slideDenied();
  });
  s.events.on('started', () => audio.ready());
  s.events.on('enterTile', () => audio.flameMove());
  s.events.on('bounce', () => audio.flameBounce());
  s.events.on('danger', () => {
    audio.flameDanger();
    renderer.flash('#ff3030', 0.12);
  });
  s.events.on('fall', () => audio.flameDeath());
  s.events.on('pickup', ({ x, y, kind }) => {
    audio.fuelCollected();
    renderer.particles.burst(x + 0.5, y + 0.5, kind === 'ember' ? 30 : 14, kind === 'ember' ? ['#ffe36a', '#fff7c2'] : ['#ffb02e', '#ff7a1a', '#ffd54a'], 1.6, 0.07, -1, 0.7);
  });
  s.events.on('lowFuel', () => {
    audio.lowFuel();
    renderer.flash('#ff8a2e', 0.1);
  });
  s.events.on('boost', () => {
    audio.boost();
    renderer.flash('#ffe36a', 0.15);
  });
  s.events.on('death', ({ cause, wx, wy }) => {
    if (cause === 'water') {
      renderer.splash(wx, wy);
      audio.waterSplash();
    } else if (cause === 'fuel') {
      audio.flameDeath();
      renderer.particles.burst(wx, wy, 20, ['rgba(170,170,180,0.8)', 'rgba(120,120,130,0.6)'], 0.6, 0.14, -1.0, 1.2);
      renderer.flash('#444a60', 0.25);
    } else {
      audio.flameDeath();
      renderer.flash('#ff6030', 0.4);
      renderer.triggerShake(0.6);
    }
  });
  s.events.on('won', () => {
    renderer.celebrate(s.flame.x, s.flame.y);
    audio.levelComplete();
  });
});
game.events.on('gameOver', () => audio.gameOver());
game.events.on('levelComplete', ({ breakdown }) => {
  if (breakdown.stars === 3) audio.perfectLevel();
});

// ----- input --------------------------------------------------------------------

new PointerInput(canvas, {
  onTap(x, y) {
    audio.unlock();
    if (game.state !== 'PLAYING' || !game.session) return;
    const cell = renderer.cellAt(x, y, game.session);
    if (!cell) return;
    game.slideAt(cell.x, cell.y);
  },
  onSwipe(x, y, dx, dy) {
    audio.unlock();
    if (game.state !== 'PLAYING' || !game.session) return;
    const cell = renderer.cellAt(x, y, game.session);
    if (!cell) return;
    const tile = game.session.grid.tryGet(cell.x, cell.y);
    if (tile && tile.kind === 'empty') {
      // swiping on the hole pulls the tile from the opposite side into it
      game.slideAt(cell.x - dx, cell.y - dy);
      return;
    }
    const target = game.session.grid.slideTarget(cell.x, cell.y);
    if (target && target.x - cell.x === dx && target.y - cell.y === dy) game.slideAt(cell.x, cell.y);
    else game.slideAt(cell.x, cell.y);
  },
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (game.state === 'PLAYING' || game.state === 'PAUSED') game.togglePause();
  } else if ((e.key === 'r' || e.key === 'R') && game.state === 'PLAYING') {
    game.restartLevel();
  } else if ((e.key === 'd' || e.key === 'D') && debugPanel) {
    debugPanel.toggle();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'PLAYING') game.pause();
});

// ----- resize ------------------------------------------------------------------

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ----- main loop ------------------------------------------------------------------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.render(game, dt);
  ui.update(dt);
  debugPanel?.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose for debugging in the console
if (DEBUG_ENABLED) {
  (window as unknown as { pyrodia: unknown }).pyrodia = { game, renderer, progress, LEVELS };
}
