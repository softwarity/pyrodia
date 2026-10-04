import type { Game } from '../game/Game';
import { difficultyFor } from '../level/difficulty';
import { gridToRows } from '../level/LevelParser';
import { generateLevel } from '../puzzle/Generator';
import { solve } from '../puzzle/Solver';
import type { CanvasRenderer } from '../render/CanvasRenderer';

/**
 * Developer tools. Only mounted when debug mode is enabled (dev build or
 * `?debug=1`). Never shipped visible in production.
 */
export class DebugPanel {
  readonly el: HTMLElement;
  private info: HTMLElement;
  private speed = 1;
  visible = true;

  constructor(
    root: HTMLElement,
    private game: Game,
    private renderer: CanvasRenderer,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'debug-panel';
    this.el.innerHTML = '<h3>DEBUG</h3>';
    const grid = document.createElement('div');
    grid.className = 'grid';
    const btn = (label: string, fn: (b: HTMLButtonElement) => void, toggle = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        fn(b);
        if (toggle) b.classList.toggle('on');
      });
      grid.appendChild(b);
      return b;
    };
    btn('‹ prev', () => this.inPlay(() => game.previousLevel()));
    btn('next ›', () => this.inPlay(() => game.nextLevel()));
    btn('restart', () => this.inPlay(() => game.restartLevel()));
    btn('start flame', () => game.session?.start());
    btn('pause', () => game.togglePause());
    btn('win level', () => this.inPlay(() => game.session && game.session.events.emit('won', { timeRemaining: game.session.timeRemaining })));
    btn('kill flame', () => this.inPlay(() => game.session && game.session.events.emit('death', { cause: 'water', wx: 0, wy: 0 })));
    btn('solution', () => {
      renderer.debug.showSolution = !renderer.debug.showSolution;
      this.refreshSolution();
    }, true);
    btn('connections', () => (renderer.debug.showConnections = !renderer.debug.showConnections), true);
    btn('full path', () => (renderer.debug.showPath = !renderer.debug.showPath), true);
    btn('unlock all', (b) => {
      game.progress.setUnlockAll(!game.progress.unlockAll);
      b.classList.toggle('on', game.progress.unlockAll);
    });
    btn('+30 fuel', () => game.session?.flame.fuel.add(30));
    btn('fuel = 10', () => {
      const f = game.session?.flame.fuel;
      if (f) f.burn(f.current - 10);
    });
    btn('reset lives', () => {
      game.lives.reset();
      game.events.emit('livesChanged', { lives: game.lives.count });
    });
    btn('+10 embers', () => {
      game.progress.addEmbers(10);
      game.events.emit('embersChanged', { embers: game.progress.embers });
    });
    btn('regenerate', () => this.regenerate());
    btn('reset progress', () => {
      game.progress.reset();
      game.toTitle();
    });
    btn('dump level', () => {
      if (!game.session) return;
      const def = { ...game.session.def, rows: gridToRows(game.session.parsed.solvedGrid) };
      console.log(JSON.stringify(def, null, 2));
      this.info.textContent = 'level JSON dumped to console';
    });
    this.el.appendChild(grid);

    const speedLabel = document.createElement('label');
    speedLabel.innerHTML = `<span>speed ×<b>1.0</b></span>`;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0.1';
    range.max = '4';
    range.step = '0.1';
    range.value = '1';
    range.addEventListener('input', () => {
      this.speed = parseFloat(range.value);
      speedLabel.querySelector('b')!.textContent = this.speed.toFixed(1);
      game.session?.setSpeedMultiplier(this.speed);
    });
    speedLabel.appendChild(range);
    this.el.appendChild(speedLabel);

    this.info = document.createElement('div');
    this.info.className = 'info';
    this.el.appendChild(this.info);
    root.appendChild(this.el);

    game.events.on('levelLoaded', () => {
      game.session?.setSpeedMultiplier(this.speed);
      this.refreshSolution();
      game.session?.events.on('slide', () => this.refreshSolution());
    });
  }

  private inPlay(fn: () => void): void {
    if (this.game.state === 'TITLE' || this.game.state === 'LEVEL_SELECT' || this.game.state === 'OPTIONS') this.game.startRun(this.game.levelIndex);
    fn();
  }

  private refreshSolution(): void {
    const s = this.game.session;
    if (!s) return;
    if (this.renderer.debug.showSolution) {
      const st = s.parsed.start;
      // shortest solution from the *current* board; fall back to the known reverse scramble
      const found = solve(s.grid, st.x, st.y, st.dir, { maxDepth: Math.max(6, s.knownSolution.length + 2), budget: 60_000 });
      this.renderer.debug.solution = found ? found.moves : s.knownSolution;
    } else {
      this.renderer.debug.solution = null;
    }
  }

  private regenerate(): void {
    const cur = this.game.currentLevel;
    const prof = difficultyFor(Math.max(13, cur.id));
    const seed = Math.floor(Math.random() * 1e9);
    try {
      const g = generateLevel({ width: cur.width, height: cur.height, difficulty: prof.difficulty, seed, flameSpeed: cur.flameSpeed });
      this.game.loadCustomLevel({
        ...cur,
        name: `${cur.name} (gen ${seed})`,
        rows: gridToRows(g.solvedGrid),
        scramble: g.scramble,
        pickups: g.pickups,
        initialFuel: g.initialFuel,
        maxFuel: g.maxFuel,
        fuelPerTile: g.fuelPerTile,
        seed,
      });
      this.info.textContent = `generated seed ${seed}, route ${g.routeLength}, scramble ${g.scramble}`;
    } catch (e) {
      this.info.textContent = `generation failed: ${(e as Error).message}`;
    }
  }

  update(): void {
    const s = this.game.session;
    if (!s) {
      this.info.textContent = `state ${this.game.state}`;
      return;
    }
    const f = s.flame;
    this.info.textContent = `state ${this.game.state} · ${s.phase}\nflame (${f.x},${f.y}) ${f.status} p=${f.progress.toFixed(2)}\nfuel ${f.fuel.current.toFixed(1)}/${f.fuel.max} pickups ${s.collected.size}/${s.pickupsTotal}\nt=${s.timeRemaining.toFixed(1)} slides=${s.slides} boosts=${s.boostsUsed}`;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }
}
