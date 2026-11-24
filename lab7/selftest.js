// selftest.js — самопроверка частей сайта, не зависящих от браузера.
//   • «Виджет» — цикл, эффекты, ввод, сценарии, управление (перенесены из ЛР 5, js/widget/);
//   • «Темы»   — утилиты, валидация, LocalStorage, CRUD-модель (перенесены из ЛР 6, js/themes/);
//   • «Сайт»   — экономика (баланс и апгрейды в LocalStorage), мост с ядром, логика HUD (новое в ЛР 7).
// Запуск: node selftest.js  (вёрстку и адаптивность проверяют глазами в браузере и в эмуляторе устройств)
import { ChameleonEngine } from './js/core/chameleonEngine.js';
import { GameConfig } from './js/core/gameConfig.js';
import { Random } from './js/core/random.js';
import { MIN_DELTA_E, STATE, FREEZE_COOLDOWN_MS, FREEZE_DURATION_MS } from './js/core/constants.js';
import { deltaE } from './js/core/colorMath.js';
import { FixedStepLoop, STEP_MS } from './js/widget/loop.js';
import { EffectsSystem, Particle, Shockwave, Marker, burstColors } from './js/widget/effects.js';
import { KeyboardInput } from './js/widget/input.js';
import { createScenarios } from './js/widget/scenarios.js';
import { Controls, CURSOR_SPEED } from './js/widget/controls.js';
import { escapeHtml, generateId, hexToRgb, normalizeHex, rgbToHex, safeHex, splitColorList, UUID_RE } from './js/themes/utils.js';
import { LIMITS, validateTheme } from './js/themes/validation.js';
import { STORAGE_KEY, ThemeStorage, normalizeTheme } from './js/themes/storage.js';
import { SAMPLE_THEMES, ThemeStore, filterThemes, suggestColors, themeStats } from './js/themes/store.js';
import { DEFAULT_UPGRADES, Economy, UPGRADES_KEY, WALLET_KEY, normalizeUpgrades, upgradeCost } from './js/economy.js';
import { MAX_MIN_RADIUS, MAX_START_RADIUS, applyTheme, buildConfig, pickColorForLevel, radiusBonus } from './js/gameBridge.js';
import { Hud, freezeView, highIsBad, lowIsBad, stateKey } from './js/hud.js';

let passed = 0;
let failed = 0;
const section = (title) => console.log(`\n== ${title} ==`);
function check(name, condition) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}`); }
}

// Заглушка localStorage: хранит только строки, как настоящий
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    data,
  };
}
const good = { name: 'Тест', background: '#2e4a2e', allowedColors: ['#335033', '#3a5a38'] };

// ---------- 1. Фиксированный шаг ----------
section('Виджет 1. Игровой цикл: фиксированный шаг и накопитель');
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
section('Виджет 2. Модель эффектов: прозрачность и жизненный цикл');
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
section('Виджет 3. Ввод: массив-флаги');
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
section('Виджет 4. Сценарии: реестр и работа с моделью без Canvas');
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

// ---------- 5. Управление ----------
section('Виджет 5. Controls: таблица горячих клавиш и движение прицела');
{
  const listeners = {};
  const target = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {} };
  const input = new KeyboardInput(target);
  input.attach();
  const key = (type, code) => listeners[type]({ code, preventDefault() {} });
  const calls = [];
  const scenarios = new Proxy({}, { get: (_, name) => () => calls.push(name) });
  const controls = new Controls(input, scenarios);

  key('keydown', 'KeyP'); key('keyup', 'KeyP');
  controls.hotkeys(STATE.PLAY);
  check('P → pause в любом состоянии', calls.at(-1) === 'pause');

  key('keydown', 'KeyF'); key('keyup', 'KeyF');
  controls.hotkeys(STATE.MENU);
  check('F в меню не срабатывает', !calls.includes('freeze'));
  key('keydown', 'KeyF'); key('keyup', 'KeyF');
  controls.hotkeys(STATE.PLAY);
  check('F в игре → freeze', calls.at(-1) === 'freeze');

  key('keydown', 'Enter'); key('keyup', 'Enter');
  controls.hotkeys(STATE.MENU);
  check('Enter в меню → start', calls.at(-1) === 'start');
  key('keydown', 'KeyR'); key('keyup', 'KeyR');
  controls.hotkeys(STATE.LOSE);
  check('R после поражения → start', calls.at(-1) === 'start');
  const n = calls.length;
  controls.hotkeys(STATE.LOSE);
  check('одно нажатие срабатывает один раз', calls.length === n);

  const cursor = { x: 400, y: 300 };
  key('keydown', 'KeyD');
  controls.moveCursor(cursor);
  check(`D: прицел вправо на ${CURSOR_SPEED} px/шаг`, cursor.x === 400 + CURSOR_SPEED);
  key('keydown', 'ShiftLeft');
  controls.moveCursor(cursor);
  check('Shift ускоряет вдвое', cursor.x === 400 + CURSOR_SPEED * 3);
  key('keyup', 'KeyD'); key('keyup', 'ShiftLeft');
  key('keydown', 'KeyW');
  for (let i = 0; i < 200; i++) controls.moveCursor(cursor);
  check('прицел не выходит в зону HUD (y ≥ 50)', cursor.y === 50);
  key('keyup', 'KeyW');
  key('keydown', 'Space'); key('keyup', 'Space');
  check('пробел → выстрел один раз', controls.wantsShot() === true && controls.wantsShot() === false);
}


// ---------- 1. Утилиты ----------
section('Темы 1. Утилиты: escapeHtml, UUID, HEX');
{
  const evil = '<img src=x onerror=alert(1)>';
  const safe = escapeHtml(evil);
  check('escapeHtml экранирует угловые скобки', !safe.includes('<') && !safe.includes('>'));
  check('escapeHtml: результат — «безопасный текст»', safe === '&lt;img src=x onerror=alert(1)&gt;');
  check('escapeHtml экранирует кавычки и &', escapeHtml(`"a" & 'b'`) === '&quot;a&quot; &amp; &#39;b&#39;');
  check('escapeHtml приводит числа к строке', escapeHtml(42) === '42');
  const id = generateId();
  check('generateId даёт UUID v4', UUID_RE.test(id) && id[14] === '4');
  check('generateId: 1000 идентификаторов уникальны', new Set(Array.from({ length: 1000 }, generateId)).size === 1000);
  check('normalizeHex: #ABC → #aabbcc', normalizeHex('#ABC') === '#aabbcc');
  check('normalizeHex: без # и с пробелами', normalizeHex('  336699 ') === '#336699');
  check('normalizeHex отклоняет мусор', normalizeHex('#12345') === null && normalizeHex('red') === null && normalizeHex(5) === null);
  check('hexToRgb / rgbToHex обратимы', rgbToHex(hexToRgb('#1a2b3c')) === '#1a2b3c');
  check('rgbToHex ограничивает диапазон 0..255', rgbToHex([300, -5, 12.4]) === '#ff000c');
  check('safeHex заменяет подделку на чёрный', safeHex('red;background:url(x)') === '#000000');
  check('splitColorList делит по запятым, пробелам, ;', splitColorList('#a, #b;#c  #d').length === 4);
}

// ---------- 2. Валидация ----------
section('Темы 2. Валидация темы');
{
  check('корректная тема проходит', validateTheme(good).valid);
  check('возвращается очищенное значение', validateTheme({ ...good, name: '  Тест   тема ' }).value.name === 'Тест тема');
  check('пустое название — ошибка', 'name' in validateTheme({ ...good, name: '   ' }).errors);
  check('слишком короткое название', 'name' in validateTheme({ ...good, name: 'a' }).errors);
  check(`название длиннее ${LIMITS.nameMax} символов`, 'name' in validateTheme({ ...good, name: 'x'.repeat(41) }).errors);
  check('некорректный фон', 'background' in validateTheme({ ...good, background: '#12' }).errors);
  check('пустой массив цветов', 'allowedColors' in validateTheme({ ...good, allowedColors: [] }).errors);
  check('некорректный цвет в списке', /Некорректный/.test(validateTheme({ ...good, allowedColors: ['#335033', 'zzz'] }).errors.allowedColors));
  check('повторяющиеся цвета', /повторяться/.test(validateTheme({ ...good, allowedColors: ['#335033', '#335033'] }).errors.allowedColors));
  check('повтор с другим регистром тоже ловится', 'allowedColors' in validateTheme({ ...good, allowedColors: ['#ABCDEF', '#abcdef'] }).errors);
  check(`больше ${LIMITS.colorsMax} цветов`, 'allowedColors' in validateTheme({ ...good, allowedColors: Array.from({ length: 13 }, (_, i) => `#${(i * 16 + 100).toString(16).padStart(2, '0')}0000`) }).errors);
  const same = validateTheme({ ...good, allowedColors: [good.background] });
  check('цвет, совпавший с фоном (ΔE < порога), отклоняется', /невидима/.test(same.errors.allowedColors));
  check('цвета можно передать строкой через запятую', validateTheme({ ...good, allowedColors: '#335033, #3a5a38' }).valid);
  check('уникальность названия без учёта регистра', 'name' in validateTheme({ ...good, name: 'ЛЕС' }, { existing: [{ id: '1', name: 'лес' }] }).errors);
  check('при редактировании своё же название допустимо', validateTheme({ ...good, name: 'Лес' }, { existing: [{ id: '1', name: 'Лес' }], selfId: '1' }).valid);
  check('несколько ошибок возвращаются сразу', Object.keys(validateTheme({ name: '', background: 'x', allowedColors: [] }).errors).length === 3);
}

// ---------- 3. LocalStorage-слой ----------
section('Темы 3. LocalStorage: сохранение, чтение, защита от мусора');
{
  const backend = fakeStorage();
  const st = new ThemeStorage(backend);
  check('на старте записи под ключом нет', st.hasData() === false);
  st.save([{ id: 'a', name: 'А', background: '#112233', allowedColors: ['#223344'], createdAt: '2026-01-01T00:00:00.000Z' }]);
  check('в localStorage лежит строка JSON под фиксированным ключом', typeof backend.data.get(STORAGE_KEY) === 'string' && STORAGE_KEY === 'chameleon_themes');
  check('чтение возвращает те же данные', st.load()[0].name === 'А' && st.load()[0].allowedColors[0] === '#223344');
  check('пустой массив «[]» считается данными (не пересоздаются примеры)', (st.save([]), st.hasData() && st.load().length === 0));

  const broken = new ThemeStorage(fakeStorage({ [STORAGE_KEY]: '{не json' }));
  check('битый JSON не роняет страницу', broken.load().length === 0 && /повреждены/.test(broken.error));
  const notArray = new ThemeStorage(fakeStorage({ [STORAGE_KEY]: '{"a":1}' }));
  check('JSON не массив — пустой список и сообщение', notArray.load().length === 0 && notArray.error !== null);
  check('запись без имени или с плохим фоном отбрасывается', normalizeTheme({ name: '', background: '#112233' }) === null && normalizeTheme({ name: 'x', background: 'red' }) === null);
  const migrated = normalizeTheme({ name: 'Старая', background: '#112233', allowedColors: ['#ABCDEF', 'мусор', '#abcdef'] });
  check('миграция: нет id/даты — выдаются; цвета очищаются от мусора и повторов', UUID_RE.test(migrated.id) && !Number.isNaN(Date.parse(migrated.createdAt)) && migrated.allowedColors.length === 1);

  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const fallback = new ThemeStorage(denied);
  fallback.save([{ x: 1 }]);
  check('localStorage недоступен — работаем в памяти и предупреждаем', !fallback.persistent && fallback.raw() === '[{"x":1}]' && fallback.error !== null);
}

// ---------- 4. CRUD-модель ----------
section('Темы 4. CRUD: Create / Read / Update / Delete + мгновенное сохранение');
{
  const backend = fakeStorage();
  const store = new ThemeStore(new ThemeStorage(backend));
  check('первый запуск: созданы примеры', store.list().length === SAMPLE_THEMES.length);
  check('все примеры проходят валидацию', SAMPLE_THEMES.every((t) => validateTheme(t).valid));
  const saved = () => JSON.parse(backend.data.get(STORAGE_KEY));

  const created = store.create(good);
  check('Create: тема добавлена с UUID и датой', created.ok && UUID_RE.test(created.theme.id) && created.theme.createdAt.length > 10);
  check('Create: сразу записано в localStorage', saved().some((t) => t.id === created.theme.id));
  const bad = store.create({ ...good, name: 'Другая', allowedColors: ['nope'] });
  check('Create: невалидная тема не добавляется и не сохраняется', !bad.ok && saved().length === store.list().length && !saved().some((t) => t.name === 'Другая'));
  check('Create: дубль названия отклонён', !store.create(good).ok);

  const id = created.theme.id;
  const upd = store.update(id, { ...good, name: 'Новое имя' });
  check('Update: имя изменено и сохранено', upd.ok && saved().find((t) => t.id === id).name === 'Новое имя');
  check('Update: id и дата создания не меняются', store.get(id).id === id && store.get(id).createdAt === created.theme.createdAt);
  check('Update: невалидные данные не портят запись', !store.update(id, { ...good, background: 'x' }).ok && store.get(id).background === good.background);
  check('Update: несуществующий id — ошибка', !store.update('нет-такого', good).ok);

  const before = store.list().length;
  check('Delete: возвращает true и убирает тему', store.remove(id) === true && store.list().length === before - 1);
  check('Delete: изменение сохранено', !saved().some((t) => t.id === id));
  check('Delete: повторное удаление — false', store.remove(id) === false);

  // «Перезагрузка страницы»: новый ThemeStore над теми же данными
  const reopened = new ThemeStore(new ThemeStorage(backend));
  check('после «перезагрузки» данные на месте', reopened.list().length === store.list().length && reopened.list()[0].name === store.list()[0].name);
  store.resetToSamples();
  check('resetToSamples возвращает примеры', store.list().length === SAMPLE_THEMES.length && saved().length === SAMPLE_THEMES.length);
}

// ---------- 5. Фильтр и оценка маскировки ----------
section('Темы 5. Фильтр, статистика маскировки, подбор цветов');
{
  const items = SAMPLE_THEMES.map((t, i) => ({ id: String(i), createdAt: '', ...t }));
  check('фильтр по умолчанию пропускает всё', filterThemes(items).length === items.length);
  check('поиск по названию без учёта регистра', filterThemes(items, { query: 'ЛЕС' }).length === 1);
  check('поиск по HEX-цвету', filterThemes(items, { query: '#12304a' }).length === 1);
  check('ползунок «цветов ≥ 4» оставляет только подходящие', filterThemes(items, { minColors: 4 }).every((t) => t.allowedColors.length >= 4) && filterThemes(items, { minColors: 4 }).length === 1);
  check('ползунок выше максимума — пусто', filterThemes(items, { minColors: 12 }).length === 0);
  check('поиск и ползунок работают вместе', filterThemes(items, { query: 'пустыня', minColors: 4 }).length === 0);
  const s = themeStats(items[0]);
  check('themeStats: ΔE мин ≥ порога, K в диапазоне (0, 1)', s.minDeltaE >= MIN_DELTA_E && s.maxK > 0 && s.maxK < 1);
  check('themeStats без цветов не падает', themeStats({ background: '#000000', allowedColors: [] }).minDeltaE === null);
  const suggested = suggestColors('#2e4a2e', 5);
  check('suggestColors: 5 разных цветов', suggested.length === 5 && new Set(suggested).size === 5);
  check('suggestColors: каждый цвет различим на фоне (ΔE ≥ порога)', suggested.every((c) => deltaE(hexToRgb('#2e4a2e'), hexToRgb(c)) >= MIN_DELTA_E));
  check('подобранные цвета проходят валидацию', validateTheme({ name: 'Авто', background: '#2e4a2e', allowedColors: suggested }).valid);
}


// ======================================================================
// Новое в ЛР 7
// ======================================================================

// ---------- Сайт 1. Экономика ----------
section('Сайт 1. Экономика: баланс и апгрейды в LocalStorage');
{
  const backend = fakeStorage();
  const eco = new Economy(backend);
  const saved = (key) => JSON.parse(backend.data.get(key));
  check('первый запуск: оба ключа записаны', backend.data.has(WALLET_KEY) && backend.data.has(UPGRADES_KEY));
  check('начальный баланс 0, два апгрейда', eco.balance === 0 && eco.upgrades.length === 2);
  check('earn(35) увеличивает баланс и сразу сохраняет', eco.earn(35) === 35 && saved(WALLET_KEY).balance === 35);
  check('earn учитывает общий заработок', saved(WALLET_KEY).totalEarned === 35);
  check('earn игнорирует отрицательные, NaN и мусор', eco.earn(-5) === 0 && eco.earn(NaN) === 0 && eco.earn('abc') === 0 && eco.balance === 35);
  check('дробные очки округляются вниз', (eco.earn(2.9), eco.balance === 37));

  check('цена радиуса: baseCost × growth^bought (50, 80, 128)', [0, 1, 2].map((b) => upgradeCost({ baseCost: 50, costGrowth: 1.6, bought: b })).join() === '50,80,128');
  const fail = eco.buy('radius');
  check('покупка без денег отклонена, баланс не тронут', !fail.ok && fail.reason === 'funds' && eco.balance === 37 && eco.level('radius') === 0);
  eco.earn(1000);
  const ok = eco.buy('radius');
  check('покупка списывает цену и повышает уровень', ok.ok && ok.cost === 50 && eco.balance === 987 && eco.level('radius') === 1);
  check('покупка сразу записана в оба ключа', saved(WALLET_KEY).balance === 987 && saved(UPGRADES_KEY)[0].level === 1 && saved(UPGRADES_KEY)[0].bought === 1);
  check('цена следующей покупки выросла', eco.cost('radius') === 80);
  check('canBuy отражает деньги и лимит', eco.canBuy('radius') && !eco.canBuy('нет-такого'));
  check('неизвестный апгрейд — ошибка unknown', eco.buy('xxx').reason === 'unknown');

  const max = DEFAULT_UPGRADES[0].maxLevel;
  eco.earn(1e9);
  for (let i = 1; i < max; i++) eco.buy('radius');
  check(`достигнут максимум ${max} уровней`, eco.level('radius') === max && eco.isMaxed('radius'));
  check('сверх максимума купить нельзя', eco.buy('radius').reason === 'max' && !eco.canBuy('radius'));

  check('заряд заморозки: без зарядов false', eco.useFreezeCharge() === false);
  eco.buy('freeze'); eco.buy('freeze');
  check('две покупки заморозки — два заряда', eco.level('freeze') === 2);
  const boughtBefore = eco.get('freeze').bought;
  check('useFreezeCharge тратит заряд', eco.useFreezeCharge() === true && eco.level('freeze') === 1);
  check('трата заряда не снижает цену следующей покупки', eco.get('freeze').bought === boughtBefore);
  check('трата заряда сохранена', saved(UPGRADES_KEY)[1].level === 1);

  eco.recordGame(120); eco.recordGame(80);
  check('recordGame: лучший счёт и число партий', eco.wallet.bestScore === 120 && eco.wallet.gamesPlayed === 2);

  const again = new Economy(backend);
  check('«перезагрузка»: баланс и уровни на месте', again.balance === eco.balance && again.level('radius') === max && again.level('freeze') === 1);

  const other = new Economy(backend);
  other.earn(10);
  eco.reload();
  check('reload() подхватывает изменения из другой вкладки', eco.balance === other.balance);

  eco.resetProgress();
  check('resetProgress возвращает значения по умолчанию', eco.balance === 0 && eco.level('radius') === 0 && saved(WALLET_KEY).balance === 0);
}

// ---------- Сайт 2. Настройки апгрейдов из LocalStorage ----------
section('Сайт 2. Настройки апгрейдов: чтение, правка, защита от мусора');
{
  const edited = JSON.parse(JSON.stringify(DEFAULT_UPGRADES));
  edited[0].baseCost = 10; edited[0].costGrowth = 2; edited[0].level = 2; edited[0].bought = 2;
  const eco = new Economy(fakeStorage({ [UPGRADES_KEY]: JSON.stringify(edited) }));
  check('настройки, изменённые в LocalStorage, учитываются (цена 10 × 2^2 = 40)', eco.cost('radius') === 40 && eco.level('radius') === 2);

  const bad = normalizeUpgrades([{ id: 'radius', baseCost: -5, costGrowth: 100, step: 999, maxLevel: 1000, level: 5000, name: '   ', description: 42 }]);
  check('отрицательная цена поднимается до 1', bad[0].baseCost === 1);
  check('рост цены ограничен (≤ 5)', bad[0].costGrowth === 5);
  check('шаг и максимум ограничены', bad[0].step === 20 && bad[0].maxLevel === 99);
  check('уровень не превышает максимум', bad[0].level === 99);
  check('пустое имя заменяется именем по умолчанию', bad[0].name === DEFAULT_UPGRADES[0].name && bad[0].description === DEFAULT_UPGRADES[0].description);
  const strings = normalizeUpgrades([{ id: 'radius', baseCost: 'много', level: 'три' }]);
  check('строки вместо чисел заменяются значениями по умолчанию', strings[0].baseCost === 50 && strings[0].level === 0);
  const old = normalizeUpgrades([{ id: 'radius', level: 3, bought: 3 }]);
  check('миграция: нового апгрейда не было в старых данных — он добавлен', old.length === 2 && old[1].id === 'freeze' && old[0].level === 3);
  check('неизвестные апгрейды отбрасываются', normalizeUpgrades([{ id: 'hack', baseCost: 1 }]).length === 2);
  check('не массив — настройки по умолчанию', normalizeUpgrades('x').length === 2 && normalizeUpgrades(null)[0].baseCost === 50);

  const broken = new Economy(fakeStorage({ [WALLET_KEY]: '{не json', [UPGRADES_KEY]: '[1,2' }));
  check('битый JSON: значения по умолчанию и сообщение об ошибке', broken.balance === 0 && broken.level('radius') === 0 && /повреждены/.test(broken.error));
  const huge = new Economy(fakeStorage({ [WALLET_KEY]: JSON.stringify({ balance: -100 }) }));
  check('отрицательный баланс невозможен', huge.balance === 0);

  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const mem = new Economy(denied);
  mem.earn(70);
  check('LocalStorage недоступен: работа в памяти + предупреждение', !mem.persistent && mem.balance === 70 && mem.error !== null);
}

// ---------- Сайт 3. Мост с ядром ----------
section('Сайт 3. Мост с ядром: апгрейд радиуса и тема');
{
  const base = new GameConfig();
  const up = (level, step = 5) => ({ ...DEFAULT_UPGRADES[0], level, step });
  check('radiusBonus: +step к старту, +step/2 к минимуму за уровень', JSON.stringify(radiusBonus(up(3))) === '{"start":15,"min":6}');
  const cfg = buildConfig(base, up(3));
  check('buildConfig: радиус 60 + 5×3 = 75, минимум 8 + 2×3 = 14', cfg.buttonStartRadius === 75 && cfg.buttonMinRadius === 14);
  check('buildConfig: остальные настройки не меняются', cfg.hitsPerLevel === base.hitsPerLevel && cfg.startLives === base.startLives && cfg.buttonShrinkFactor === base.buttonShrinkFactor && cfg.maxMultiplier === base.maxMultiplier);
  check('buildConfig: исходная конфигурация не изменена, новая неизменяема', base.buttonStartRadius === 60 && Object.isFrozen(cfg));
  check('уровень 0 — те же значения, что в базе', buildConfig(base, up(0)).buttonStartRadius === base.buttonStartRadius);
  const huge = buildConfig(base, up(99, 20));
  check(`радиус ограничен (${MAX_START_RADIUS}) и минимум (${MAX_MIN_RADIUS})`, huge.buttonStartRadius === MAX_START_RADIUS && huge.buttonMinRadius === MAX_MIN_RADIUS);

  const engine = new ChameleonEngine(buildConfig(base, up(2)), new Random(5));
  engine.startGame(0);
  check('ядро с новой конфигурацией стартует с радиусом 70', engine.button.radius === 70 && engine.button.minRadius === 12);
  engine.cfg = buildConfig(base, up(4)); // как при покупке между партиями
  engine.reset();
  check('подмена engine.cfg действует на следующий сброс партии', engine.button.radius === 80);

  const theme = { name: 'T', background: '#2e4a2e', allowedColors: ['#294429', '#3a5a38', '#335033'] }; // по ΔE: 294429, 335033 ближе к фону
  const bg = hexToRgb(theme.background);
  const dE = (c) => deltaE(bg, c);
  const first = pickColorForLevel(theme, 1, 10);
  const last = pickColorForLevel(theme, 10, 10);
  const mid = pickColorForLevel(theme, 5, 10);
  check('уровень 1 — самый заметный цвет темы', dE(first) >= dE(mid) && dE(first) >= dE(last));
  check('последний уровень — самый близкий к фону', dE(last) <= dE(mid) && dE(last) <= dE(first));
  check('сложность не падает с ростом уровня (ΔE не растёт)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => dE(pickColorForLevel(theme, l, 10))).every((v, i, a) => i === 0 || v <= a[i - 1] + 1e-9));
  check('все цвета различимы (ΔE ≥ порога)', [1, 5, 10].every((l) => dE(pickColorForLevel(theme, l, 10)) >= MIN_DELTA_E));
  check('тема с одним цветом работает на любом уровне', pickColorForLevel({ ...theme, allowedColors: ['#335033'] }, 7, 10).join() === hexToRgb('#335033').join());
  check('тема без цветов — null', pickColorForLevel({ ...theme, allowedColors: [] }, 1, 10) === null);
  check('maxLevel = 1 не даёт деления на ноль', Array.isArray(pickColorForLevel(theme, 1, 1)));

  const e2 = new ChameleonEngine(base, new Random(9));
  e2.startGame(0);
  check('applyTheme меняет фон и цвет кнопки ядра', applyTheme(e2, theme) && e2.background.join() === bg.join() && deltaE(e2.background, e2.button.color) >= MIN_DELTA_E);
  check('applyTheme(null) ничего не делает', applyTheme(e2, null) === false);
  check('после смены цветов коэффициент маскировки считается ядром', e2.camouflage > 0 && e2.camouflage < 1);
}

// ---------- Сайт 4. Логика HUD ----------
section('Сайт 4. Динамический HUD: состояния индикаторов');
{
  check('жизни 3/3 — спокойно', lowIsBad(1) === 'calm');
  check('жизни 2/3 — среднее состояние', lowIsBad(2 / 3) === 'mid');
  check('жизни 1/3 — критическое', lowIsBad(1 / 3) === 'crit');
  check('жизней нет — критическое', lowIsBad(0) === 'crit');
  check('маскировка низкая — спокойно, средняя — mid, высокая — crit', highIsBad(0.3) === 'calm' && highIsBad(0.7) === 'mid' && highIsBad(0.95) === 'crit');
  check('границы порогов: 0.6 → calm, 0.85 → mid', highIsBad(0.6) === 'calm' && highIsBad(0.85) === 'mid');
  check('stateKey по состояниям ядра', stateKey(STATE.MENU, false) === 'menu' && stateKey(STATE.PLAY, false) === 'play' && stateKey(STATE.WIN, false) === 'win' && stateKey(STATE.LOSE, false) === 'lose');
  check('пауза перекрывает любое состояние', stateKey(STATE.PLAY, true) === 'pause');

  const frozen = freezeView({ frozen: true, remainingMs: 1500, cooldownLeftMs: 9000, charges: 2, playing: true });
  check('заморозка действует: ratio = остаток / 3 с, класс ice', Math.abs(frozen.ratio - 0.5) < 1e-9 && frozen.cls === 'ice' && /заморожена 1.5/.test(frozen.label));
  const cool = freezeView({ frozen: false, remainingMs: 0, cooldownLeftMs: FREEZE_COOLDOWN_MS / 2, charges: 2, playing: true });
  check('перезарядка: ratio растёт от 0 к 1, класс mid', Math.abs(cool.ratio - 0.5) < 1e-9 && cool.cls === 'mid');
  const ready = freezeView({ frozen: false, remainingMs: 0, cooldownLeftMs: 0, charges: 3, playing: true });
  check('готова: полная полоса, класс calm, показаны заряды', ready.ratio === 1 && ready.cls === 'calm' && /3/.test(ready.label));
  const none = freezeView({ frozen: false, remainingMs: 0, cooldownLeftMs: 0, charges: 0, playing: true });
  check('нет зарядов: пустая серая полоса', none.ratio === 0 && none.cls === 'off');
  check('вне игры перезарядка не показывается', freezeView({ frozen: false, remainingMs: 0, cooldownLeftMs: 5000, charges: 1, playing: false }).cls === 'calm');
  check('константы заморозки из ядра: 3 с и 10 с', FREEZE_DURATION_MS === 3000 && FREEZE_COOLDOWN_MS === 10000);
}

// ---------- Сайт 5. HUD не пересоздаёт и не переписывает DOM ----------
section('Сайт 5. HUD: обновление существующих узлов (кэш значений)');
{
  // Заглушка DOM: считает, сколько раз записали в свойства
  let writes = 0;
  const makeEl = () => {
    const el = { dataset: {}, style: {} };
    let text = '', width = '', cls = '';
    Object.defineProperty(el, 'textContent', { get: () => text, set: (v) => { text = v; writes++; } });
    Object.defineProperty(el.style, 'width', { get: () => width, set: (v) => { width = v; writes++; } });
    Object.defineProperty(el, 'className', { get: () => cls, set: (v) => { cls = v; writes++; } });
    return el;
  };
  const els = {};
  const doc = { getElementById: (id) => (els[id] ??= makeEl()), createElement: () => { throw new Error('HUD не должен создавать узлы'); } };
  const hud = new Hud(doc);
  const cfg = new GameConfig();
  const engine = { state: STATE.PLAY, score: 120, multiplier: 2, level: 3, hitsOnLevel: 2, lives: 2, camouflage: 0.9, isFrozen: false, frozenUntil: 0, cfg, freezeCooldownLeft: () => 0 };
  const widget = { engine, paused: false, simNow: 1000 };
  const economy = { balance: 55, level: () => 1 };

  hud.update(widget, economy);
  const firstWrites = writes;
  check('первый кадр записывает значения в существующие узлы', firstWrites > 10);
  check('очки, множитель и баланс выведены текстом', els['hud-score'].textContent === '120' && els['hud-mult'].textContent === '×2' && els['hud-balance'].textContent === '55');
  check('уровень: подпись и ширина полосы 2/5 = 40%', els['hud-level'].textContent === '3/10 · 2/5' && els['hud-level-fill'].style.width === '40%');
  check('жизни 2/3: класс mid', els['hud-lives-fill'].className === 'meter-fill mid' && els['hud-lives'].textContent === '2/3');
  check('маскировка 0.9: класс crit, ширина по K / K_max', els['hud-camo-fill'].className === 'meter-fill crit' && els['hud-camo-fill'].style.width.endsWith('%'));
  check('индикатор состояния: ИГРА и data-state="play"', els['hud-state-text'].textContent === 'ИГРА' && els['hud-state'].dataset.state === 'play');

  writes = 0;
  hud.update(widget, economy);
  check('второй кадр без изменений — ноль записей в DOM', writes === 0);

  engine.score = 130;
  hud.update(widget, economy);
  check('изменился один показатель — одна запись', writes === 1 && els['hud-score'].textContent === '130');

  writes = 0;
  engine.lives = 1;
  hud.update(widget, economy);
  check('жизни 1/3: вид индикатора сменился на crit (подпись, ширина, класс)', els['hud-lives-fill'].className === 'meter-fill crit' && els['hud-lives-fill'].style.width === '33%' && writes === 3);

  widget.paused = true;
  hud.update(widget, economy);
  check('пауза: подпись ПАУЗА и data-state="pause"', els['hud-state-text'].textContent === 'ПАУЗА' && els['hud-state'].dataset.state === 'pause');
  widget.paused = false;
  engine.state = STATE.LOSE;
  hud.update(widget, economy);
  check('поражение: подпись ПОРАЖЕНИЕ и data-state="lose"', els['hud-state-text'].textContent === 'ПОРАЖЕНИЕ' && els['hud-state'].dataset.state === 'lose');
}

console.log(`\nИтого: ${passed + failed} проверок, пройдено ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
