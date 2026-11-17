// selftest.js — самопроверка частей виджета, не зависящих от браузера: цикл, эффекты, ввод, сценарии.
// Запуск: node selftest.js  (отрисовку и HUD проверяют глазами в браузере)
import { ChameleonEngine } from './core/chameleonEngine.js';
import { GameConfig } from './core/gameConfig.js';
import { Random } from './core/random.js';
import { MIN_DELTA_E, STATE } from './core/constants.js';
import { deltaE } from './core/colorMath.js';
import { FixedStepLoop, STEP_MS } from './js/loop.js';
import { EffectsSystem, Particle, Shockwave, Marker, burstColors } from './js/effects.js';
import { KeyboardInput } from './js/input.js';
import { createScenarios } from './js/scenarios.js';

let passed = 0;
let failed = 0;
const section = (title) => console.log(`\n== ${title} ==`);
function check(name, condition) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}`); }
}

// ---------- 1. Фиксированный шаг ----------
section('1. Игровой цикл: фиксированный шаг и накопитель');
{
  let n = 0;
  const loop = new FixedStepLoop(() => n++);
  loop.advance(STEP_MS * 3 + 1);
  check('за 3 шага времени + 1 мс — ровно 3 шага', n === 3);
  check('остаток накопителя меньше одного шага', loop.remainder < 1);
  n = 0;
  for (let i = 0; i < 60; i++) loop.advance(1000 / 60);        // монитор 60 Гц, 1 секунда
  const at60 = n;
  n = 0;
  const loop2 = new FixedStepLoop(() => n++);
  for (let i = 0; i < 144; i++) loop2.advance(1000 / 144);     // монитор 144 Гц, 1 секунда
  check(`за секунду шагов одинаково при 60 и 144 Гц (${at60} и ${n})`, Math.abs(at60 - n) <= 1 && at60 >= 59);
  n = 0;
  const loop3 = new FixedStepLoop(() => n++);
  loop3.advance(5000);
  check('после «сворачивания» вкладки на 5 с шагов не больше 100 мс / шаг', n <= Math.ceil(100 / STEP_MS));
  n = 0;
  const loop4 = new FixedStepLoop(() => n++);
  for (let i = 0; i < 60; i++) loop4.advance(1000 / 60, 0.5);
  check('масштаб времени 0.5 вдвое уменьшает число шагов', n >= 29 && n <= 31);
  loop4.advance(-50);
  check('отрицательное время игнорируется', loop4.remainder >= 0);
}

// ---------- 2. Эффекты ----------
section('2. Модель эффектов: прозрачность и жизненный цикл');
{
  const p = new Particle(0, 0, 3, 0, 4, [255, 0, 0], 40);
  const a0 = p.alpha;
  p.step();
  check('alpha частицы = 1 в начале', a0 === 1);
  check('alpha убывает с каждым шагом', p.alpha < a0);
  const r0 = p.radius;
  for (let i = 0; i < 30; i++) p.step();
  check('радиус частицы уменьшается', p.radius < r0);
  check('частица тормозит (трение)', Math.abs(p.vx) < 3);
  for (let i = 0; i < 20; i++) p.step();
  check('по окончании жизни alive = false и alpha = 0', !p.alive && p.alpha === 0);

  const w = new Shockwave(0, 0, [255, 0, 0], 100, 10);
  check('волна: alpha ≈ 1 в центре', w.alpha > 0.9);
  for (let i = 0; i < 5; i++) w.step();
  check('волна: alpha = 1 − r/maxRadius', Math.abs(w.alpha - (1 - w.radius / 100)) < 1e-12);
  for (let i = 0; i < 10; i++) w.step();
  check('волна исчезает на maxRadius', !w.alive && w.alpha === 0);

  const fx = new EffectsSystem(new Random(1));
  fx.burst(100, 100, [[1, 2, 3]], 40);
  fx.shockwave(100, 100, [1, 2, 3]);
  fx.floatText(100, 100, '+10', [1, 2, 3]);
  const target = { x: 50, y: 80, radius: 20 };
  fx.marker('МИМО', [1, 2, 3], () => target);
  check('создано 40 частиц + волна + текст + маркер', fx.count === 43);
  const m = new Marker('x', [0, 0, 0], () => target);
  check('маркер над сущностью (выше её верхнего края)', m.position.y < target.y - target.radius);
  target.x = 500;
  check('маркер следует за движущейся сущностью', m.position.x === 500);
  for (let i = 0; i < 200; i++) fx.step();
  check('через 200 шагов все эффекты удалены системой', fx.count === 0);
  fx.burst(0, 0, [[1, 1, 1]], 5);
  fx.clear();
  check('clear() убирает всё', fx.count === 0);
  const colors = burstColors([10, 10, 10], [10, 10, 10]);
  check('на тёмном фоне среди цветов взрыва есть светлый', colors.some((c) => c[0] > 200));
  check('на светлом фоне среди цветов взрыва есть тёмный', burstColors([200, 200, 200], [230, 230, 230]).some((c) => c[0] < 50));
}

// ---------- 3. Ввод ----------
section('3. Ввод: массив-флаги');
{
  const listeners = {};
  const target = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {} };
  const input = new KeyboardInput(target);
  input.attach();
  let prevented = 0;
  const key = (type, code) => listeners[type]({ code, preventDefault: () => { prevented++; } });
  key('keydown', 'KeyD');
  check('зажатая клавиша: right = true', input.read().right === true);
  key('keydown', 'KeyD'); // автоповтор ОС
  check('автоповтор keydown не ломает флаг', input.read().right === true);
  key('keyup', 'KeyD');
  check('после keyup right = false', input.read().right === false);
  key('keydown', 'ArrowLeft');
  check('стрелки работают как A/D', input.read().left === true);
  key('keyup', 'ArrowLeft');
  key('keydown', 'KeyF');
  key('keyup', 'KeyF'); // тап короче одного шага
  check('тап короче шага не теряется (wasPressed)', input.wasPressed('KeyF') === true);
  check('одно нажатие — одно срабатывание', input.wasPressed('KeyF') === false);
  key('keydown', 'KeyF'); key('keydown', 'KeyF'); key('keydown', 'KeyF'); // удержание с автоповтором
  check('удержание с автоповтором даёт ровно одно срабатывание', input.wasPressed('KeyF') && !input.wasPressed('KeyF'));
  key('keyup', 'KeyF');
  prevented = 0;
  key('keydown', 'Space'); key('keydown', 'KeyW'); key('keydown', 'KeyP');
  check('preventDefault для Space и WASD, но не для P', prevented === 2);
  key('keydown', 'ShiftLeft');
  check('Shift: fast = true', input.read().fast === true);
  input.release();
  const s = input.read();
  check('release() (потеря фокуса) снимает все флаги', !s.up && !s.down && !s.left && !s.right && !s.fast);
}

// ---------- 4. Сценарии ----------
section('4. Сценарии: реестр и работа с моделью без Canvas');
{
  const config = new GameConfig();
  const widget = {
    config, engine: new ChameleonEngine(config, new Random(7)), effects: new EffectsSystem(new Random(3)),
    simNow: 1000, paused: false, timeScale: 1, spotlight: { enabled: false, radius: 150 },
    revealUntil: 0, autoplay: false, notes: [], noteScenario(name, args) { this.notes.push([name, args]); },
  };
  const sc = createScenarios(widget);
  const required = ['start', 'restart', 'pause', 'freeze', 'addLife', 'explode', 'shockwave', 'teleport', 'recolor',
    'maxCamouflage', 'setLevel', 'reveal', 'timeScale', 'spotlight', 'autoplay'];
  check('в реестре все 15 сценариев', required.every((n) => typeof sc[n] === 'function') && sc.names.length === required.length);
  check('у каждого сценария есть описание', sc.names.every((n) => sc.descriptions[n].length > 5));

  sc.start();
  check('start(): MENU → PLAY', widget.engine.state === STATE.PLAY);
  check('вызов сценария записывается в журнал виджета', widget.notes.at(-1)[0] === 'start');

  const before = widget.effects.count;
  sc.explode();
  check('explode(): создал частицы и волну', widget.effects.count > before + 40);
  sc.explode(10, 10, 5);
  check('explode(x, y, count): count учитывается', widget.effects.particles.length >= 5);
  sc.explode('мусор', NaN, 'abc');
  check('мусорные аргументы из консоли не ломают сценарий', widget.effects.count > 0);

  widget.simNow = 2000;
  check('freeze(): заморозка включена', sc.freeze() === true && widget.engine.isFrozen);
  check('повторная freeze() до кулдауна отклонена', sc.freeze() === false);

  sc.pause();
  check('pause(): переключает паузу', widget.paused === true);
  sc.pause();
  check('pause() второй раз — снимает', widget.paused === false);

  sc.setLevel(8);
  const e = widget.engine;
  check('setLevel(8): уровень 8', e.level === 8);
  check('setLevel(8): радиус как после 35 попаданий (floor на каждом шаге, не меньше 8)', e.button.radius >= 8 && e.button.radius < 12);
  check('setLevel(8): скорость = 2 + 0.4·35', Math.abs(e.button.speed - 16) < 1e-9);
  check('setLevel(99) ограничен максимальным уровнем', (sc.setLevel(99), e.level) === e.cfg.maxLevel);
  check('setLevel(1): радиус снова 60', (sc.setLevel(1), e.button.radius) === 60);

  sc.maxCamouflage();
  const dE = deltaE(e.background, e.button.color);
  check(`maxCamouflage(): dE на пороге (${dE.toFixed(1)} ≥ ${MIN_DELTA_E})`, dE >= MIN_DELTA_E && dE < MIN_DELTA_E + 8);
  check('maxCamouflage(): K ≈ 0.98, но меньше 1', e.camouflage > 0.97 && e.camouflage < 1);
  let ok = true;
  for (let i = 0; i < 300; i++) { sc.recolor(); if (deltaE(e.background, e.button.color) < MIN_DELTA_E) ok = false; }
  check('recolor(): 300 раз подряд кнопка различима (dE ≥ порога)', ok);

  sc.timeScale(0.3);
  check('timeScale(0.3)', widget.timeScale === 0.3);
  check('timeScale ограничен диапазоном 0.1–3', (sc.timeScale(100), widget.timeScale) === 3 && (sc.timeScale(0), widget.timeScale) === 0.1);
  sc.spotlight();
  check('spotlight(): включается переключением', widget.spotlight.enabled === true);
  sc.spotlight(false, 200);
  check('spotlight(false, 200): выключен, радиус 200', widget.spotlight.enabled === false && widget.spotlight.radius === 200);
  sc.reveal(500);
  check('reveal(500): подсветка до simNow + 500', widget.revealUntil === widget.simNow + 500);
  sc.autoplay();
  check('autoplay(): включается', widget.autoplay === true);

  const oldEngine = widget.engine;
  sc.restart();
  check('restart(): создано новое ядро и игра идёт', widget.engine !== oldEngine && widget.engine.state === STATE.PLAY);
  check('restart(): эффекты очищены', widget.effects.count === 0);
  const lives = widget.engine.lives;
  sc.addLife();
  check('addLife(): +1 жизнь', widget.engine.lives === lives + 1);
}

console.log(`\nИтого: ${passed + failed} проверок, пройдено ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
