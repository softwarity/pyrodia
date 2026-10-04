import type { Game } from '../game/Game';
import type { GameState } from '../game/GameStates';
import type { LevelDef } from '../level/LevelDef';
import { EMBER_USES } from '../player/Embers';
import { formatScore, type ScoreBreakdown } from '../player/Scoring';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${className}`.trim(), label);
  b.addEventListener('click', onClick);
  return b;
}

function flamesHtml(stars: number): string {
  let s = '';
  for (let i = 0; i < 3; i++) s += `<span class="${i < stars ? '' : 'off'}">🔥</span>`;
  return s;
}

/**
 * DOM based menus and overlays. Listens to the Game and renders the right
 * screen for its state. Gameplay itself is drawn on the canvas.
 */
export class UI {
  private root: HTMLElement;
  private current: HTMLElement | null = null;
  private ingame: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private bannerTimer = 0;
  private lastComplete: { level: LevelDef; breakdown: ScoreBreakdown; runScore: number; newHighScore: boolean; isLast: boolean } | null = null;
  private lastGameOver: { score: number; highScore: boolean; levelId: number } | null = null;

  constructor(
    root: HTMLElement,
    private game: Game,
  ) {
    this.root = root;
    game.events.on('stateChanged', ({ to }) => this.show(to));
    game.events.on('levelLoaded', ({ level }) => this.onLevelLoaded(level));
    game.events.on('levelComplete', (p) => (this.lastComplete = p));
    game.events.on('gameOver', (p) => (this.lastGameOver = p));
    game.events.on('death', ({ cause, livesLeft }) => {
      const title = cause === 'water' ? 'SPLASH!' : cause === 'fuel' ? 'BURNED OUT' : "TIME'S UP";
      const why = cause === 'water' ? 'the flame fell into the water' : cause === 'fuel' ? 'the flame ran out of fuel' : 'the clock ran out';
      this.banner(title, `${why} · lives ${livesLeft + 1} → ${livesLeft}`, true, 2.2);
    });
    game.events.on('boostRefused', ({ cost }) => this.banner('NOT ENOUGH EMBERS', `this boost costs ${cost} embers`, true, 1.2));
    game.events.on('embersChanged', () => this.refreshBoostButtons());
    this.show(game.state);
  }

  update(dt: number): void {
    if (this.bannerEl && this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerEl.remove();
        this.bannerEl = null;
      }
    }
    const s = this.game.session;
    if (this.ingame && s) {
      const ready = this.ingame.querySelector<HTMLElement>('.ready');
      if (ready) ready.style.display = s.phase === 'ready' && this.game.state === 'PLAYING' ? '' : 'none';
    }
  }

  private refreshBoostButtons(): void {
    if (!this.ingame) return;
    this.ingame.querySelectorAll<HTMLButtonElement>('.boost-btn').forEach((b) => {
      const cost = Number(b.dataset.cost ?? 0);
      b.disabled = this.game.embers < cost;
    });
  }

  private click(): void {
    this.game.audio.unlock();
    this.game.audio.buttonClick();
  }

  private setScreen(screen: HTMLElement | null): void {
    this.current?.remove();
    this.current = screen;
    if (screen) this.root.appendChild(screen);
  }

  private show(state: GameState): void {
    switch (state) {
      case 'TITLE':
        this.ingame?.remove();
        this.ingame = null;
        this.setScreen(this.titleScreen());
        break;
      case 'LEVEL_SELECT':
        this.ingame?.remove();
        this.ingame = null;
        this.setScreen(this.levelSelectScreen());
        break;
      case 'OPTIONS':
        this.setScreen(this.optionsScreen());
        break;
      case 'PLAYING':
        this.setScreen(null);
        this.ensureIngame();
        break;
      case 'PAUSED':
        this.setScreen(this.pauseScreen());
        break;
      case 'DEATH':
        this.setScreen(this.deathScreen());
        break;
      case 'LEVEL_COMPLETE':
        this.setScreen(this.levelCompleteScreen());
        break;
      case 'GAME_OVER':
        this.setScreen(this.gameOverScreen());
        break;
    }
  }

  // ----- screens -----------------------------------------------------------------

  private titleScreen(): HTMLElement {
    const s = el('div', 'screen');
    s.appendChild(el('div', 'title-flame', '<span class="f1"></span><span class="f2"></span><span class="f3"></span>'));
    s.appendChild(el('h1', 'logo', 'PYRODIA'));
    s.appendChild(el('p', 'tagline', 'The fire must survive'));
    s.appendChild(el('p', 'subtitle', "A Pyro's Journey"));
    s.appendChild(el('p', 'tagline motto', "Think fast. Feed the fire. Don't get wet."));
    const menu = el('div', 'menu');
    const furthest = this.game.progress.furthestUnlocked;
    menu.appendChild(
      button(furthest > 1 ? `PLAY · LEVEL ${Math.min(furthest, this.game.levels.length)}` : 'PLAY', '', () => {
        this.click();
        this.game.continueRun();
      }),
    );
    menu.appendChild(
      button('LEVELS', 'secondary', () => {
        this.click();
        this.game.toLevelSelect();
      }),
    );
    menu.appendChild(
      button('OPTIONS', 'secondary', () => {
        this.click();
        this.game.toOptions();
      }),
    );
    s.appendChild(menu);
    s.appendChild(el('div', 'hiscore', `HIGH SCORE <b>${formatScore(this.game.progress.highScore)}</b> &nbsp;·&nbsp; EMBERS <b>${this.game.progress.embers}</b>`));
    return s;
  }

  private levelSelectScreen(): HTMLElement {
    const s = el('div', 'screen');
    const header = el('div', 'levels-header');
    header.appendChild(
      button('‹ BACK', 'secondary small', () => {
        this.click();
        this.game.toTitle();
      }),
    );
    header.appendChild(el('h2', '', 'LEVELS'));
    header.appendChild(el('div', 'hiscore', `🔥 <b>${this.game.progress.totalStars} / ${this.game.levels.length * 3}</b>`));
    s.appendChild(header);
    const grid = el('div', 'levels-grid');
    const furthest = this.game.progress.furthestUnlocked;
    this.game.levels.forEach((lvl, idx) => {
      const rec = this.game.progress.record(lvl.id);
      const unlocked = this.game.progress.isUnlocked(lvl.id);
      const b = el('button', `level-btn ${unlocked ? '' : 'locked'} ${rec?.completed ? 'done' : ''} ${lvl.id === furthest ? 'current' : ''}`);
      b.appendChild(el('span', 'num', String(lvl.id).padStart(2, '0')));
      b.appendChild(el('span', 'flames', unlocked ? flamesHtml(rec?.stars ?? 0) : '🔒'));
      b.title = `${lvl.name} · ${lvl.width}x${lvl.height}`;
      if (unlocked) {
        b.addEventListener('click', () => {
          this.click();
          this.game.startRun(idx);
        });
      } else {
        b.disabled = true;
      }
      grid.appendChild(b);
    });
    s.appendChild(grid);
    return s;
  }

  private optionsScreen(): HTMLElement {
    const s = el('div', 'screen');
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', '', 'OPTIONS'));
    const settings = this.game.progress.settings;
    const toggleRow = (label: string, value: boolean, onChange: (v: boolean) => void) => {
      const row = el('div', 'option-row');
      row.appendChild(el('span', '', label));
      const t = el('button', `toggle ${value ? 'on' : ''}`);
      t.setAttribute('aria-label', label);
      t.addEventListener('click', () => {
        const v = !t.classList.contains('on');
        t.classList.toggle('on', v);
        onChange(v);
        this.click();
      });
      row.appendChild(t);
      panel.appendChild(row);
    };
    toggleRow('Sound effects', settings.sound, (v) => {
      this.game.progress.updateSettings({ sound: v });
      this.game.audio.setEnabled(v);
    });
    toggleRow('Show hints', settings.showHints, (v) => this.game.progress.updateSettings({ showHints: v }));
    panel.appendChild(el('div', 'hiscore', `TOTAL BEST <b>${formatScore(this.game.progress.totalBestScore)}</b>`));
    const resetBtn = button('RESET PROGRESS', 'danger small', () => {
      if (resetBtn.dataset.confirm === '1') {
        this.game.progress.reset();
        this.click();
        this.show('OPTIONS');
      } else {
        resetBtn.dataset.confirm = '1';
        resetBtn.textContent = 'TAP AGAIN TO CONFIRM';
      }
    });
    panel.appendChild(resetBtn);
    panel.appendChild(
      button('‹ BACK', 'secondary', () => {
        this.click();
        this.game.toTitle();
      }),
    );
    s.appendChild(panel);
    s.appendChild(el('p', 'tagline', 'Tap a tile next to the hole to slide it in · or swipe it towards the hole'));
    return s;
  }

  private pauseScreen(): HTMLElement {
    const s = el('div', 'screen overlay');
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', '', 'PAUSED'));
    panel.appendChild(
      button('RESUME', '', () => {
        this.click();
        this.game.resume();
      }),
    );
    panel.appendChild(
      button('RESTART LEVEL', 'secondary', () => {
        this.click();
        this.game.restartLevel();
      }),
    );
    const row = el('div', 'row');
    row.appendChild(
      button('LEVELS', 'secondary small', () => {
        this.click();
        this.game.toLevelSelect();
      }),
    );
    row.appendChild(
      button('TITLE', 'secondary small', () => {
        this.click();
        this.game.toTitle();
      }),
    );
    panel.appendChild(row);
    s.appendChild(panel);
    return s;
  }

  private deathScreen(): HTMLElement {
    // Transparent: the canvas shows the splash. Tap anywhere to skip the delay.
    const s = el('div', 'screen transparent');
    const tap = el('div', 'tap-hint', this.game.lives.isEmpty ? '' : 'TAP TO CONTINUE');
    s.appendChild(tap);
    s.style.pointerEvents = 'auto';
    s.addEventListener('pointerdown', () => this.game.afterDeath());
    return s;
  }

  private levelCompleteScreen(): HTMLElement {
    const s = el('div', 'screen overlay');
    const panel = el('div', 'panel');
    const data = this.lastComplete;
    panel.appendChild(el('h2', 'good', 'LEVEL COMPLETE'));
    if (data) {
      panel.appendChild(el('div', 'stars', flamesHtml(data.breakdown.stars)));
      const label = data.breakdown.stars === 3 ? 'PERFECT' : data.breakdown.stars === 2 ? 'EXCELLENT' : 'COMPLETED';
      panel.appendChild(el('div', 'tagline', label));
      const b = data.breakdown;
      const objectives = el('div', 'objectives');
      objectives.innerHTML = b.objectives.map((o) => `<span class="${o.met ? 'met' : 'missed'}">${o.met ? '✓' : '✗'} ${o.label.toUpperCase()}</span>`).join('');
      panel.appendChild(objectives);
      panel.appendChild(
        el(
          'div',
          'breakdown',
          `<span>Base score</span><b>${formatScore(b.base)}</b>` +
            `<span>Time bonus</span><b>+${formatScore(b.timeBonus)}</b>` +
            `<span>Fuel bonus</span><b>+${formatScore(b.fuelBonus)}</b>` +
            `<span>Life bonus</span><b>+${formatScore(b.lifeBonus)}</b>` +
            `<span>New fuel pickups</span><b>+${formatScore(b.pickupBonus)}</b>` +
            `<span>Perfect bonus</span><b>+${formatScore(b.perfectBonus)}</b>` +
            `<span class="total">Level score</span><b class="total">${formatScore(b.total)}</b>` +
            `<span>Run score</span><b>${formatScore(data.runScore)}${data.newHighScore ? ' ★ NEW HIGH' : ''}</b>` +
            `<span>Embers earned</span><b>+${b.embersEarned + (this.game.session?.embersCollected ?? 0)} ✦</b>`,
        ),
      );
    }
    panel.appendChild(
      button(data?.isLast ? 'ALL LEVELS DONE · LEVELS' : 'NEXT LEVEL ›', '', () => {
        this.click();
        this.game.nextLevel();
      }),
    );
    const row = el('div', 'row');
    row.appendChild(
      button('REPLAY', 'secondary small', () => {
        this.click();
        this.game.loadLevel(this.game.levelIndex);
      }),
    );
    row.appendChild(
      button('LEVELS', 'secondary small', () => {
        this.click();
        this.game.toLevelSelect();
      }),
    );
    panel.appendChild(row);
    s.appendChild(panel);
    return s;
  }

  private gameOverScreen(): HTMLElement {
    const s = el('div', 'screen overlay');
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', 'bad', 'GAME OVER'));
    panel.appendChild(el('p', 'tagline', 'the fire went out'));
    const d = this.lastGameOver;
    panel.appendChild(
      el(
        'div',
        'breakdown',
        `<span>Score</span><b>${formatScore(d?.score ?? 0)}${d?.highScore ? ' ★ NEW HIGH' : ''}</b>` +
          `<span>Level reached</span><b>${d?.levelId ?? this.game.currentLevel.id}</b>` +
          `<span>High score</span><b>${formatScore(this.game.progress.highScore)}</b>`,
      ),
    );
    panel.appendChild(
      button('CONTINUE', '', () => {
        this.click();
        this.game.continueAfterGameOver();
      }),
    );
    const row = el('div', 'row');
    row.appendChild(
      button('NEW GAME', 'secondary small', () => {
        this.click();
        this.game.startRun(0);
      }),
    );
    row.appendChild(
      button('LEVELS', 'secondary small', () => {
        this.click();
        this.game.toLevelSelect();
      }),
    );
    panel.appendChild(row);
    s.appendChild(panel);
    return s;
  }

  // ----- in-game chrome ---------------------------------------------------------------

  private ensureIngame(): void {
    if (this.ingame) return;
    const g = el('div', 'ingame');
    const pause = el('button', 'pause-btn', '❙❙');
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', () => {
      this.click();
      this.game.pause();
    });
    g.appendChild(pause);
    const ready = el('div', 'banner ready', 'READY<small>slide the pipes · the flame never waits</small>');
    g.appendChild(ready);
    this.hintEl = el('div', 'hint');
    this.hintEl.style.display = 'none';
    g.appendChild(this.hintEl);
    const boosts = el('div', 'boosts');
    for (const use of EMBER_USES) {
      const b = el('button', 'boost-btn', `<b>${use.description}</b><small>${use.cost} ✦ embers</small>`);
      b.dataset.cost = String(use.cost);
      b.title = use.label;
      b.addEventListener('click', () => {
        this.click();
        this.game.useBoost(use.id);
      });
      boosts.appendChild(b);
    }
    g.appendChild(boosts);
    this.ingame = g;
    this.refreshBoostButtons();
    this.root.appendChild(g);
    this.onLevelLoaded(this.game.currentLevel);
  }

  private onLevelLoaded(level: LevelDef): void {
    if (!this.hintEl) return;
    const show = this.game.progress.settings.showHints && !!level.hint;
    this.hintEl.style.display = show ? '' : 'none';
    this.hintEl.textContent = level.hint ?? '';
  }

  banner(text: string, sub: string, bad: boolean, seconds: number): void {
    this.bannerEl?.remove();
    const b = el('div', `banner ${bad ? 'bad' : ''}`, `${text}<small>${sub}</small>`);
    this.root.appendChild(b);
    this.bannerEl = b;
    this.bannerTimer = seconds;
  }
}
