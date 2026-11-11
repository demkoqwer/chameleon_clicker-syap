// demo.js — демонстрация ядра без интерфейса. Запуск: node demo.js
// Бот «идеальный игрок» кликает по центру кнопки; на каждом уровне печатаются расчёты.
import { ChameleonEngine } from './js/chameleonEngine.js';
import { Random } from './js/random.js';
import { GameConfig } from './js/gameConfig.js';
import { maxDiffForLevel } from './js/colorMath.js';
import { MIN_DELTA_E } from './js/constants.js';

const cfg = new GameConfig();
const engine = new ChameleonEngine(cfg, new Random(2026));
engine.startGame(0);

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`Порог видимости: dE ≥ ${MIN_DELTA_E}\n`);
console.log('ур. | maxDiff | радиус | скорость | фон      | кнопка   |   dE  |   K   | очки | x');
console.log('----+---------+--------+----------+----------+----------+-------+-------+------+--');

let lastLevel = 0;
let t = 0;
while (engine.state === 'PLAY') {
  if (engine.level !== lastLevel) {
    lastLevel = engine.level;
    const b = engine.button;
    console.log(
      `${String(engine.level).padStart(3)} | ${String(maxDiffForLevel(engine.level, cfg)).padStart(7)} | ` +
      `${String(b.radius).padStart(6)} | ${b.speed.toFixed(1).padStart(8)} | ${hex(engine.background)} | ` +
      `${hex(b.color)} | ${engine.deltaE.toFixed(1).padStart(5)} | ${engine.camouflage.toFixed(3)} | ` +
      `${String(engine.score).padStart(4)} | ${engine.multiplier}`);
  }
  t += 16;
  engine.update(t);
  engine.click(engine.button.x, engine.button.y, t);
}
console.log(`\nИтог: ${engine.state}, очки ${engine.score}, макс. множитель x${engine.maxMultiplier}, точность ${(engine.accuracy * 100).toFixed(0)}%`);
console.log('\nПоследние события «чёрного ящика»:');
engine.log.last(5).forEach((e) => console.log(`  [${e.t} мс] ${e.type} | ${e.message}`));
