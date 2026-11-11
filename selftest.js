// selftest.js — самопроверка ядра. Запуск: node selftest.js
// Каждая проверка выводится через console.log; при ошибке процесс завершается с кодом 1.
import { readFileSync } from 'node:fs';
import { Rect } from './js/rect.js';
import { Random } from './js/random.js';
import {
  DELTA_E_MAX, MAX_CAMOUFLAGE, camouflageCoefficient, channelDifference, clamp, deltaE,
  ensureVisible, makeColorPair, maxDiffForLevel, similarColor,
} from './js/colorMath.js';
import { GameConfig } from './js/gameConfig.js';
import { EventLog } from './js/eventLog.js';
import { TargetButton } from './js/targetButton.js';
import { ChameleonEngine } from './js/chameleonEngine.js';
import {
  FREEZE_COOLDOWN_MS, FREEZE_DURATION_MS, HUD_HEIGHT, MIN_DELTA_E, STATE, TRANSITIONS, WINDOW_HEIGHT, WINDOW_WIDTH,
} from './js/constants.js';

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n== ${title} ==`);
}

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
  }
}

const cfg = new GameConfig();
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const newEngine = (seed = 1, config = cfg) => new ChameleonEngine(config, new Random(seed));
const hitCenter = (e, t = 0) => e.click(e.button.x, e.button.y, t); // клик ровно по центру кнопки

// ---------------------------------------------------------------
section('1. Геометрия: Rect (порт pygame.Rect)');
{
  const r = new Rect(10, 20, 30, 40);
  check('центр прямоугольника', r.centerx === 25 && r.centery === 40);
  const moved = r.move(5, -5);
  check('move() возвращает новый объект', moved !== r && moved.x === 15 && moved.y === 15);
  check('move() не меняет оригинал', r.x === 10 && r.y === 20);
  check('colliderect: пересекающиеся', r.colliderect(new Rect(30, 50, 20, 20)));
  check('colliderect: непересекающиеся', !r.colliderect(new Rect(100, 100, 5, 5)));
  check('colliderect: касание краем — не пересечение', !r.colliderect(new Rect(40, 20, 10, 10)));
  check('collidepoint: внутри и на левой границе', r.collidepoint(15, 25) && r.collidepoint(10, 20));
  check('collidepoint: на правой границе и снаружи — нет', !r.collidepoint(40, 30) && !r.collidepoint(0, 0));
  check('contains: вложенный прямоугольник', r.contains(new Rect(12, 22, 5, 5)) && !r.contains(new Rect(0, 0, 50, 50)));
}

// ---------------------------------------------------------------
section('2. Случайные числа: Random с зерном');
{
  const a = new Random(7);
  const b = new Random(7);
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  check('одинаковое зерно — одинаковая последовательность', seqA.every((v, i) => v === seqB[i]));
  const r = new Random(3);
  let inRange = true;
  for (let i = 0; i < 5000; i++) {
    const v = r.int(-5, 5);
    if (v < -5 || v > 5 || !Number.isInteger(v)) inRange = false;
  }
  check('int(min, max) всегда в границах (включительно)', inRange);
}

// ---------------------------------------------------------------
section('3. Расчёты: сближение цветов (формулы ЛР 1)');
{
  check('maxDiffForLevel(1) = 200', maxDiffForLevel(1, cfg) === 200);
  check('maxDiffForLevel(5) = 120', maxDiffForLevel(5, cfg) === 120);
  check('maxDiffForLevel(10) = 20', maxDiffForLevel(10, cfg) === 20);
  check('maxDiffForLevel(50) не ниже минимума 15', maxDiffForLevel(50, cfg) === 15);
  let mono = true;
  for (let l = 2; l <= 12; l++) if (maxDiffForLevel(l, cfg) > maxDiffForLevel(l - 1, cfg)) mono = false;
  check('maxDiffForLevel не возрастает с уровнем (монотонность)', mono);
  check('clamp ограничивает 0..255', clamp(-5) === 0 && clamp(300) === 255 && clamp(100) === 100);
  const rnd = new Random(11);
  let within = true;
  for (let i = 0; i < 3000; i++) {
    const base = [rnd.int(0, 255), rnd.int(0, 255), rnd.int(0, 255)];
    const c = similarColor(base, 40, rnd);
    if (channelDifference(base, c) > 40 || c.some((v) => v < 0 || v > 255)) within = false;
  }
  check('similarColor: разница каналов ≤ maxDiff и значения в 0..255', within);
}

// ---------------------------------------------------------------
section('4. Расчёты: упрощённая Delta E и коэффициент маскировки');
{
  const bg = [120, 80, 200];
  check('Delta E одинаковых цветов = 0', deltaE(bg, bg) === 0);
  check('Delta E симметрична', near(deltaE([10, 20, 30], [200, 100, 50]), deltaE([200, 100, 50], [10, 20, 30])));
  check('Delta E чёрный–белый = DELTA_E_MAX ≈ 764.8', near(deltaE([0, 0, 0], [255, 255, 255]), DELTA_E_MAX) && near(DELTA_E_MAX, 764.83, 0.01));
  check('Delta E растёт с удалением цвета (монотонность)',
    deltaE(bg, [125, 80, 200]) < deltaE(bg, [140, 80, 200]) && deltaE(bg, [140, 80, 200]) < deltaE(bg, [200, 80, 200]));
  check('K = 1 для совпавших цветов', camouflageCoefficient(bg, bg) === 1);
  check('K = 0 для чёрного и белого', near(camouflageCoefficient([0, 0, 0], [255, 255, 255]), 0));
  check('K ближе к 1 у более похожих цветов', camouflageCoefficient(bg, [122, 80, 200]) > camouflageCoefficient(bg, [180, 80, 200]));
  check('MAX_CAMOUFLAGE = 1 − MIN_DELTA_E/DELTA_E_MAX ≈ 0.984 и меньше 1', near(MAX_CAMOUFLAGE, 1 - MIN_DELTA_E / DELTA_E_MAX) && MAX_CAMOUFLAGE < 1);
}

// ---------------------------------------------------------------
section('5. Порог видимости: кнопка не бывает невидимой, но максимально близка к фону');
{
  check('цвет, уже различимый, не меняется', (() => {
    const c = [200, 80, 200];
    return ensureVisible([120, 80, 200], c) === c;
  })());
  const edge = [[0, 0, 0], [255, 255, 255], [128, 128, 128], [255, 0, 0], [0, 255, 0]];
  check('совпавший с фоном цвет отодвигается до dE ≥ порога (в т.ч. на краях палитры)',
    edge.every((bg) => deltaE(bg, ensureVisible(bg, [...bg])) >= MIN_DELTA_E));
  check('отодвигание минимально: dE не превышает порог более чем на 7',
    edge.every((bg) => deltaE(bg, ensureVisible(bg, [...bg])) <= MIN_DELTA_E + 7));
  const rnd = new Random(5);
  let ok = true;
  for (let level = 1; level <= 10; level++) {
    for (let i = 0; i < 800; i++) {
      const [bg, btn] = makeColorPair(level, cfg, rnd);
      if (deltaE(bg, btn) < MIN_DELTA_E) ok = false;
    }
  }
  check('makeColorPair: dE ≥ порога на всех уровнях (8000 пар)', ok);
  const avgK = (level) => {
    const r2 = new Random(21);
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const [bg, btn] = makeColorPair(level, cfg, r2);
      sum += camouflageCoefficient(bg, btn);
    }
    return sum / 2000;
  };
  const k1 = avgK(1);
  const k10 = avgK(10);
  check(`средний K растёт с уровнем (ур.1: ${k1.toFixed(3)} < ур.10: ${k10.toFixed(3)})`, k1 < k10);
  check('средний K на 10 уровне ближе к 1, чем 0.95', k10 > 0.95);
}

// ---------------------------------------------------------------
section('6. Настройки из JSON с валидацией');
{
  const good = readFileSync(new URL('./data/clicker_config.json', import.meta.url), 'utf-8');
  const loaded = GameConfig.fromJSON(good);
  check('файл data/clicker_config.json загружается', loaded.startLives === 3 && loaded.maxLevel === 10);
  check('snake_case из JSON превращается в camelCase', loaded.buttonShrinkFactor === 0.95 && loaded.comboStep === 3);
  const throws = (text) => { try { GameConfig.fromJSON(text); return false; } catch { return true; } };
  check('битый JSON — исключение', throws('{bad json'));
  check('корень не объект — исключение', throws('[1,2,3]'));
  const obj = JSON.parse(good);
  check('неверный тип параметра — исключение', throws(JSON.stringify({ ...obj, start_lives: 'три' })));
  check('значение вне диапазона — исключение', throws(JSON.stringify({ ...obj, max_level: 999 })));
  const missing = { ...obj }; delete missing.max_level;
  check('отсутствие обязательного поля — исключение', throws(JSON.stringify(missing)));
  const soft = GameConfig.fromJSONOrDefault(JSON.stringify({ start_lives: -5, max_level: 7 }));
  check('мягкая загрузка: неверное — по умолчанию, верное — из файла',
    soft.config.startLives === 3 && soft.config.maxLevel === 7 && soft.warnings.length === 1);
  const broken = GameConfig.fromJSONOrDefault('{oops');
  check('мягкая загрузка битого JSON: значения по умолчанию и предупреждение', broken.config.startLives === 3 && broken.warnings.length === 1);
  const cross = GameConfig.fromJSONOrDefault(JSON.stringify({ button_start_radius: 20, button_min_radius: 30 }));
  check('несогласованные радиусы сбрасываются', cross.config.buttonMinRadius < cross.config.buttonStartRadius);
  check('объект настроек неизменяем', (() => { try { loaded.startLives = 99; } catch { /* ES-модули работают в strict mode: запись бросает TypeError */ } return loaded.startLives === 3; })());
}

// ---------------------------------------------------------------
section('7. Кнопка-мишень');
{
  const area = new Rect(0, HUD_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT - HUD_HEIGHT);
  const rnd = new Random(9);
  const b = new TargetButton([1, 2, 3], cfg, rnd, area);
  let inside = true;
  for (let i = 0; i < 2000; i++) { b.teleport(); if (!area.contains(b.rect)) inside = false; }
  check('teleport(): кнопка всегда целиком в игровой зоне', inside);
  b.x = 100; b.y = 200; b.radius = 60;
  check('contains: центр и точка на границе (dist = radius) — попадание', b.contains(100, 200) && b.contains(160, 200));
  check('contains: dist = radius + 1 — промах', !b.contains(161, 200));
  const b2 = new TargetButton([1, 2, 3], cfg, rnd, area);
  b2.onHit();
  check('onHit: радиус 60 → 57 (−5%, как int() в Python)', b2.radius === 57);
  let r = 57; for (let i = 0; i < 80; i++) { b2.onHit(); r = b2.radius; }
  check('радиус не опускается ниже минимума (8)', r === 8);
  check('скорость растёт после каждого попадания', b2.speed > cfg.buttonStartSpeed);
  const b3 = new TargetButton([1, 2, 3], cfg, rnd, area);
  check('длина вектора скорости равна speed', near(Math.hypot(b3.vx, b3.vy), b3.speed, 1e-9));
  let stays = true;
  const b4 = new TargetButton([1, 2, 3], cfg, rnd, area);
  b4.speed = 15; b4.teleport();
  for (let i = 0; i < 30000; i++) { b4.update(); if (!area.contains(b4.rect)) stays = false; }
  check('защита от застревания: за 30000 кадров кнопка не выходит за границы', stays);
}

// ---------------------------------------------------------------
section('8. Конечный автомат и игровой цикл');
{
  const e = newEngine();
  check('начальное состояние MENU', e.state === STATE.MENU);
  check('клик в MENU игнорируется', e.click(100, 300) === 'ignored');
  check('startGame: MENU → PLAY, жизни и уровень по настройкам', e.startGame(0) && e.state === STATE.PLAY && e.lives === 3 && e.level === 1);
  check('повторный startGame во время игры отклоняется', e.startGame(10) === false && e.state === STATE.PLAY);
  check('клик по панели HUD игнорируется', e.click(e.button.x, HUD_HEIGHT - 1) === 'ignored' && e.lives === 3);
  check('попадание: результат hit, 10 очков на 1 уровне', hitCenter(e) === 'hit' && e.score === 10);
  hitCenter(e); hitCenter(e);
  check('3 попадания подряд: множитель x2, очки 10+10+20 = 40', e.multiplier === 2 && e.score === 40);
}
{
  const e = newEngine(2); e.startGame(0);
  hitCenter(e); hitCenter(e); hitCenter(e);
  e.button.x = 400; e.button.y = 300; e.button.radius = 20;
  const res = e.click(10, 590); // далеко от кнопки
  check('промах: результат miss, жизнь −1, серия и множитель сброшены', res === 'miss' && e.lives === 2 && e.combo === 0 && e.multiplier === 1);
  e.click(10, 590); e.click(10, 590);
  check('3 промаха → состояние LOSE', e.state === STATE.LOSE && e.lives === 0);
  check('в LOSE клики игнорируются', e.click(e.button.x, e.button.y) === 'ignored');
  check('из LOSE можно перезапустить: LOSE → PLAY со сбросом сессии', e.startGame(0) && e.state === STATE.PLAY && e.score === 0 && e.lives === 3);
}
{
  const e = newEngine(3); e.startGame(0);
  for (let i = 0; i < 5; i++) hitCenter(e);
  check('5 попаданий → 2 уровень', e.level === 2 && e.hitsOnLevel === 0);
  let expected = 0; let level = 1; let hitsOnLevel = 0; let mult = 1;
  const e2 = newEngine(4); e2.startGame(0);
  for (let i = 1; i <= 50; i++) {
    mult = Math.min(5, 1 + Math.floor(i / 3));
    expected += 10 * level * mult;
    hitsOnLevel++;
    if (hitsOnLevel === 5) { hitsOnLevel = 0; level++; }
    hitCenter(e2, i * 16);
  }
  check('50 попаданий подряд → состояние WIN', e2.state === STATE.WIN);
  check('уровень при победе ограничен 10, множитель достиг x5', e2.level === 10 && e2.maxMultiplier === 5);
  check(`очки совпадают с независимым расчётом (${expected})`, e2.score === expected);
  check('в WIN клики игнорируются', e2.click(e2.button.x, e2.button.y) === 'ignored');
  check('цвета после попаданий всегда различимы (dE ≥ порога)', (() => {
    const e3 = newEngine(6); e3.startGame(0);
    for (let i = 0; i < 49; i++) { hitCenter(e3); if (e3.deltaE < MIN_DELTA_E) return false; }
    return true;
  })());
  check('журнал фиксирует переходы автомата: MENU → PLAY → WIN', (() => {
    const lines = e2.log.entries.filter((x) => x.type === 'FSM').map((x) => x.message);
    return lines.join('|') === 'MENU -> PLAY|PLAY -> WIN';
  })());
  check('таблица переходов: в MENU вернуться нельзя, PLAY ведёт только в WIN/LOSE', (() => {
    const all = Object.values(TRANSITIONS).flat();
    return !all.includes(STATE.MENU) && TRANSITIONS[STATE.PLAY].join() === 'WIN,LOSE' &&
      Object.keys(TRANSITIONS).length === Object.keys(STATE).length;
  })());
}

// ---------------------------------------------------------------
section('9. Кулдаун и режим действия: заморозка');
{
  const e = newEngine(10);
  check('заморозка недоступна вне игры (MENU)', e.useFreeze(0) === false);
  e.startGame(0);
  const x0 = e.button.x; const y0 = e.button.y;
  check('useFreeze: включается', e.useFreeze(1000) === true && e.isFrozen);
  e.update(1500); e.update(2000);
  check('в заморозке кнопка не двигается', e.button.x === x0 && e.button.y === y0);
  e.update(1000 + FREEZE_DURATION_MS);
  check('по окончании заморозки кнопка снова двигается', !e.isFrozen && (e.button.x !== x0 || e.button.y !== y0));
  check('повтор до конца кулдауна отклоняется', e.useFreeze(1000 + FREEZE_COOLDOWN_MS - 1) === false);
  check('остаток кулдауна считается верно', e.freezeCooldownLeft(5000) === 1000 + FREEZE_COOLDOWN_MS - 5000);
  check('после кулдауна заморозка снова доступна', e.useFreeze(1000 + FREEZE_COOLDOWN_MS) === true);
}

// ---------------------------------------------------------------
section('10. Журнал событий («чёрный ящик»), статистика, воспроизводимость');
{
  const e = newEngine(12); e.startGame(100);
  hitCenter(e, 200); hitCenter(e, 300); e.click(5, 595, 400);
  check('журнал считает попадания и промахи', e.log.count('HIT') === 2 && e.log.count('MISS') === 1);
  check('точность = попадания / все клики', near(e.accuracy, 2 / 3));
  check('записи журнала содержат игровое время', e.log.last(1)[0].t === 400);
  check('журнал возвращает копию записей', (() => { const c = e.log.entries; c.pop(); return e.log.length > c.length; })());
  check('журнал ограничен лимитом', (() => { const l = new EventLog(3); for (let i = 0; i < 10; i++) l.add('X', String(i)); return l.length === 3; })());
  const row = e.toProfileRow('Мира', '2026-10-28 01:19');
  check('строка профиля совпадает по полям с CSV из ЛР 2', Object.keys(row).join() === 'Имя,Уровень,Очки,Множитель,Дата' && row['Очки'] === e.score);
  check('коэффициент маскировки в диапазоне [0, 1]', e.camouflage >= 0 && e.camouflage <= 1);
  const a = newEngine(99); const b = newEngine(99);
  a.startGame(0); b.startGame(0);
  for (let i = 0; i < 12; i++) { hitCenter(a); hitCenter(b); }
  check('одинаковое зерно — одинаковый ход игры', a.score === b.score && a.background.join() === b.background.join() && a.button.x === b.button.x);
}

// ---------------------------------------------------------------
console.log(`\nИтого: ${passed + failed} проверок, пройдено ${passed}, провалено ${failed}`);
if (failed > 0) process.exitCode = 1;
