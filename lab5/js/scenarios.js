// js/scenarios.js — реестр вызываемых сценариев.
// Сценарий — именованная функция, которая меняет состояние или поведение виджета.
// Сценарии НЕ знают про Canvas и DOM: они работают только с моделью (ядро, эффекты, параметры симуляции),
// поэтому их можно вызывать из кнопок страницы, из консоли браузера и из других сценариев,
// а также проверять в Node без браузера (selftest.js).
import { ChameleonEngine } from '../core/chameleonEngine.js';
import { ensureVisible, makeColorPair } from '../core/colorMath.js';
import { burstColors } from './effects.js';

// Приведение аргумента к числу в диапазоне (из консоли можно передать что угодно)
const num = (value, fallback, low = -Infinity, high = Infinity) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
};

export function createScenarios(widget) {
  // Описание сценариев: имя → [описание, функция]. Из этой таблицы собираются и реестр, и help().
  const table = {
    // ----- Партия -----
    start: ['Начать партию (из меню или после победы/поражения)', () => widget.engine.startGame(widget.simNow)],

    restart: ['Новая партия в любой момент: ядро создаётся заново', () => {
      widget.engine = new ChameleonEngine(widget.config, widget.engine.random);
      widget.effects.clear();
      widget.paused = false;
      return widget.engine.startGame(widget.simNow);
    }],

    pause: ['Пауза / продолжить', () => {
      widget.paused = !widget.paused;
      return widget.paused;
    }],

    freeze: ['Заморозка кнопки на 3 с (кулдаун 10 с, считает ядро)', () => {
      const ok = widget.engine.useFreeze(widget.simNow);
      if (ok) widget.effects.marker('ЗАМОРОЗКА', [120, 210, 255], () => widget.engine.button, 60);
      return ok;
    }],

    addLife: ['Добавить жизнь (отладка)', () => {
      widget.engine.lives += 1;
      return widget.engine.lives;
    }],

    // ----- Эффекты -----
    explode: ['Взрыв частиц: explode(x, y, count). Без аргументов — на кнопке', (x, y, count) => {
      const b = widget.engine.button;
      const px = num(x, b.x, 0, 800);
      const py = num(y, b.y, 0, 600);
      widget.effects.burst(px, py, burstColors(b.color, widget.engine.background), num(count, 48, 1, 400));
      widget.effects.shockwave(px, py, [255, 200, 60]);
    }],

    shockwave: ['Ударная волна: shockwave(x, y, maxRadius)', (x, y, maxRadius) => {
      const b = widget.engine.button;
      widget.effects.shockwave(num(x, b.x, 0, 800), num(y, b.y, 0, 600), [255, 200, 60], num(maxRadius, 140, 10, 600));
    }],

    // ----- Мимикрия -----
    teleport: ['Телепорт кнопки в случайную точку', () => widget.engine.button.teleport()],

    recolor: ['Пересчитать цвета фона и кнопки для текущего уровня', () => {
      const e = widget.engine;
      [e.background, e.button.color] = makeColorPair(e.level, e.cfg, e.random);
      return e.camouflage;
    }],

    maxCamouflage: ['Максимальная маскировка: цвет кнопки на пороге видимости (dE = 12)', () => {
      const e = widget.engine;
      e.button.color = ensureVisible(e.background, [...e.background]);
      return e.camouflage;
    }],

    setLevel: ['Перейти на уровень n: радиус, скорость и цвета как после n−1 уровней', (n) => {
      const e = widget.engine;
      const level = Math.round(num(n, e.level, 1, e.cfg.maxLevel));
      e.level = level;
      e.hitsOnLevel = 0;
      // Радиус и скорость меняет само ядро: n−1 уровней × hitsPerLevel попаданий — ровно как в реальной партии
      e.button.radius = e.cfg.buttonStartRadius;
      e.button.speed = e.cfg.buttonStartSpeed;
      for (let i = 0; i < (level - 1) * e.cfg.hitsPerLevel; i++) e.button.onHit();
      e.button.teleport();
      [e.background, e.button.color] = makeColorPair(level, e.cfg, e.random);
      return level;
    }],

    reveal: ['Подсветить кнопку контуром на ms миллисекунд (подсказка)', (ms) => {
      widget.revealUntil = widget.simNow + num(ms, 2000, 100, 30000);
    }],

    // ----- Параметры симуляции -----
    timeScale: ['Масштаб времени симуляции: timeScale(0.3) — замедление, timeScale(1) — норма', (factor) => {
      widget.timeScale = num(factor, 1, 0.1, 3);
      return widget.timeScale;
    }],

    spotlight: ['Ограниченная видимость: spotlight(включить?, радиус)', (enabled, radius) => {
      const s = widget.spotlight;
      s.enabled = enabled === undefined ? !s.enabled : Boolean(enabled);
      s.radius = num(radius, s.radius, 40, 500);
      return s.enabled;
    }],

    autoplay: ['Бот кликает по центру кнопки каждые 15 шагов (вкл/выкл)', (enabled) => {
      widget.autoplay = enabled === undefined ? !widget.autoplay : Boolean(enabled);
      return widget.autoplay;
    }],
  };

  // Реестр: каждое обращение попадает в журнал ядра («чёрный ящик») и в HUD виджета
  const registry = {};
  for (const [name, [, fn]] of Object.entries(table)) {
    registry[name] = (...args) => {
      const result = fn(...args);
      widget.noteScenario(name, args);
      return result;
    };
  }

  const descriptions = Object.fromEntries(Object.entries(table).map(([name, [text]]) => [name, text]));

  // Справка для консоли: Chameleon.scenarios.help()
  registry.help = () => {
    const rows = Object.entries(descriptions).map(([name, description]) => ({ сценарий: name, описание: description }));
    console.table(rows);
    return Object.keys(descriptions);
  };

  registry.descriptions = descriptions;
  registry.names = Object.keys(descriptions);
  return registry;
}
