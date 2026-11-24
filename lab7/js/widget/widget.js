// js/widget/widget.js — виджет из ЛР 5: связывает ядро (core/, из ЛР 4), модель эффектов, ввод и отрисовку.
// Цикл requestAnimationFrame: время кадра → накопитель → N шагов логики → отрисовка → onFrame.
//
// Изменения по сравнению с ЛР 5 (чтобы встроить виджет в сайт):
//  1. Свой DOM-HUD убран: показатели рисует сайт (js/hud.js) по хуку hooks.onFrame.
//  2. Добавлены точки подключения hooks: onHit, onMiss, onFrame. Виджет ничего не знает про магазин и темы,
//     он только сообщает о событиях, а сайт реагирует на них.
//  3. На экранах «победа/поражение» перезапуск возможен касанием/кликом (на телефоне нет клавиши R).
import { ChameleonEngine } from '../core/chameleonEngine.js';
import { GameConfig } from '../core/gameConfig.js';
import { Random } from '../core/random.js';
import { STATE, WINDOW_HEIGHT, WINDOW_WIDTH } from '../core/constants.js';
import { EffectsSystem, burstColors, contrastColor } from './effects.js';
import { FixedStepLoop, STEP_MS } from './loop.js';
import { KeyboardInput } from './input.js';
import { Controls } from './controls.js';
import { Renderer, rgb } from './renderer.js';
import { createScenarios } from './scenarios.js';

export class Widget {
  // hooks: { onHit({ gain }), onMiss(), onFrame(widget) } — все необязательны
  constructor(canvas, config, random = new Random(), hooks = {}) {
    this.hooks = hooks;
    this.config = config;
    this.engine = new ChameleonEngine(config, random);
    this.effects = new EffectsSystem(new Random()); // отдельный источник случайности: эффекты не сбивают ход игры
    this.steps = 0;           // число сделанных шагов симуляции; на паузе не растёт
    this.paused = false;
    this.timeScale = 1;
    this.spotlight = { enabled: false, radius: 150 };
    this.revealUntil = 0;
    this.autoplay = false;
    this.lastState = this.engine.state;
    this.stateSince = 0;
    this.lastScenario = '—';
    this.cursor = { x: WINDOW_WIDTH / 2, y: WINDOW_HEIGHT / 2 };
    this.clicks = [];         // очередь кликов: обрабатываются в шаге симуляции, а не в обработчике события

    this.canvas = canvas;
    this.input = new KeyboardInput(window);
    this.renderer = new Renderer(canvas, this);
    this.loop = new FixedStepLoop(() => this.step());
    this.scenarios = createScenarios(this);
    this.controls = new Controls(this.input, this.scenarios); // всё управление: js/controls.js
    this.perf = { fps: 0, stepsPerSec: 0 };
    this.themeKey = '';
    this.lastTime = null;
    this.frames = 0;
    this.stepsCounted = 0;
    this.sinceReport = 0;
  }

  // Игровые часы, мс (целые): шаги × длина шага. На паузе стоят, при замедлении идут медленнее
  get simNow() {
    return Math.round(this.steps * STEP_MS);
  }

  // ---------- Запуск ----------
  start() {
    this.input.attach();
    this.#bindPointer();
    this.#bindScenarioButtons();
    requestAnimationFrame(this.#frame);
  }

  #frame = (now) => {
    if (this.lastTime === null) this.lastTime = now;
    const delta = now - this.lastTime;
    this.lastTime = now;

    this.stepsCounted += this.loop.advance(delta, this.timeScale); // логика: фиксированные шаги
    this.renderer.draw();                                          // отрисовка: каждый кадр браузера
    this.#applyTheme();
    this.#measure(delta);
    this.hooks.onFrame?.(this);
    requestAnimationFrame(this.#frame);
  };

  // FPS браузера и число шагов симуляции в секунду: при любом FPS шагов должно быть ~60
  #measure(delta) {
    this.frames += 1;
    this.sinceReport += delta;
    if (this.sinceReport >= 1000) {
      this.perf = { fps: Math.round((this.frames * 1000) / this.sinceReport), stepsPerSec: Math.round((this.stepsCounted * 1000) / this.sinceReport) };
      this.frames = 0;
      this.stepsCounted = 0;
      this.sinceReport = 0;
    }
  }

  // ---------- Один шаг симуляции ----------
  step() {
    const e = this.engine;

    // 1. Горячие клавиши (P, F, R, Enter, пробел) — таблица в controls.js
    this.controls.hotkeys(e.state);
    if (this.paused) return;

    this.steps += 1;

    // 2. Движение прицела по зажатым клавишам (WASD / стрелки / Shift)
    this.controls.moveCursor(this.cursor);

    // 3. Клики: мышь (очередь) и пробел/Enter в игре — один клик за нажатие
    if (e.state === STATE.PLAY && this.controls.wantsShot()) this.clicks.push({ ...this.cursor });
    if (this.autoplay && e.state === STATE.PLAY && this.steps % 15 === 0) {
      this.clicks.push({ x: e.button.x, y: e.button.y });
    }
    for (const c of this.clicks.splice(0)) this.#handleClick(c.x, c.y);

    // 4. Ядро и модель эффектов делают шаг
    this.engine.update(this.simNow);
    this.effects.step();
    if (this.engine.state !== this.lastState) { // запоминаем момент смены состояния игры
      this.lastState = this.engine.state;
      this.stateSince = this.simNow;
    }
  }

  // Клик: ядро решает попал/промах, виджет запускает эффекты
  #handleClick(x, y) {
    const e = this.engine;
    if (e.state !== STATE.PLAY) {
      // Меню, победа, поражение: касание запускает новую партию (на телефоне нет клавиш Enter и R).
      // Короткая пауза после конца партии, чтобы случайный двойной тап не пропустил экран результата.
      if (e.state === STATE.MENU || this.simNow - this.stateSince > 700) this.scenarios.start();
      return;
    }
    const before = { x: e.button.x, y: e.button.y, color: [...e.button.color], score: e.score, level: e.level };
    const result = e.click(x, y, this.simNow);
    const fx = this.effects;
    if (result === 'hit') {
      this.hooks.onHit?.({ gain: e.score - before.score }); // сайт может сменить цвета (тема) до запуска эффектов
      const colors = burstColors(before.color, e.background); // фон уже пересчитан ядром
      fx.burst(before.x, before.y, colors, e.state === STATE.WIN ? 120 : 44);
      fx.shockwave(before.x, before.y, contrastColor(e.background), 120);
      fx.floatText(before.x, before.y - 20, `+${e.score - before.score}`, [255, 200, 60]);
      if (e.level > before.level) fx.marker(`УРОВЕНЬ ${e.level}`, [255, 200, 60], () => e.button, 70);
    } else if (result === 'miss') {
      this.hooks.onMiss?.();
      fx.shockwave(x, y, [230, 60, 60], 70);
      fx.marker(`МИМО! −1 жизнь`, [230, 60, 60], () => e.button, 55);
    }
  }

  // Цвета страницы: после каждого попадания ядро выдаёт новый фон — страница пересчитывается мгновенно
  #applyTheme() {
    const bg = this.engine.state === STATE.MENU ? [20, 24, 40] : this.engine.background;
    const key = bg.join(',');
    if (key === this.themeKey) return;
    this.themeKey = key;
    const root = document.documentElement.style;
    root.setProperty('--stage-bg', rgb(bg));
    const page = bg.map((c, i) => Math.round(c * 0.22 + [11, 13, 20][i] * 0.78)); // затемнённый фон, чтобы текст читался
    root.setProperty('--page-bg', rgb(page));
  }

  noteScenario(name, args) {
    this.lastScenario = `${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`;
    this.engine.log.add('SCENARIO', this.lastScenario, this.simNow);
  }

  // ---------- Указатель и кнопки страницы ----------
  #bindPointer() {
    const toGame = (ev) => {
      const box = this.canvas.getBoundingClientRect(); // с учётом масштаба canvas на странице
      return { x: ((ev.clientX - box.left) * WINDOW_WIDTH) / box.width, y: ((ev.clientY - box.top) * WINDOW_HEIGHT) / box.height };
    };
    this.canvas.addEventListener('pointermove', (ev) => Object.assign(this.cursor, toGame(ev)));
    this.canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const p = toGame(ev);
      Object.assign(this.cursor, p);
      if (!this.paused) this.clicks.push(p); // обработается в ближайшем шаге
    });
  }

  // Способ 1: кнопки с data-scenario="имя" (аргументы — JSON-массив в data-args)
  #bindScenarioButtons() {
    for (const btn of document.querySelectorAll('[data-scenario]')) {
      btn.addEventListener('click', () => {
        const args = btn.dataset.args ? JSON.parse(btn.dataset.args) : [];
        this.scenarios[btn.dataset.scenario](...args);
        btn.blur(); // иначе пробел на сфокусированной кнопке повторил бы сценарий
      });
    }
  }
}
