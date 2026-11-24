// js/chameleonEngine.js — ядро игры «Эволюционный Кликер» (порт game.py без отрисовки и ввода-вывода).
// Ядро не знает ни о браузере, ни о Node: время передаётся параметром (игровые часы, мс),
// случайность — объектом Random. Поэтому его можно проверять без интерфейса.
import { Rect } from './rect.js';
import { Random } from './random.js';
import { GameConfig } from './gameConfig.js';
import { EventLog } from './eventLog.js';
import { TargetButton } from './targetButton.js';
import { camouflageCoefficient, deltaE, makeColorPair } from './colorMath.js';
import {
  FREEZE_COOLDOWN_MS,
  FREEZE_DURATION_MS,
  HUD_HEIGHT,
  STATE,
  TRANSITIONS,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
} from './constants.js';

export class ChameleonEngine {
  #state = STATE.MENU;

  constructor(config = new GameConfig(), random = new Random()) {
    this.cfg = config;
    this.random = random;
    this.playArea = new Rect(0, HUD_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT - HUD_HEIGHT);
    this.log = new EventLog();
    this.now = 0; // игровые часы, мс
    this.reset();
  }

  get state() {
    return this.#state;
  }

  // ---------- Сессия ----------

  // Сброс сессии (как Game.reset в Python)
  reset() {
    this.score = 0;
    this.level = 1;
    this.lives = this.cfg.startLives;
    this.hitsOnLevel = 0;
    this.combo = 0;         // попаданий подряд без промаха
    this.multiplier = 1;    // множитель клика (модификатор очков)
    this.maxMultiplier = 1;
    this.hits = 0;
    this.misses = 0;
    this.frozenUntil = 0;
    this.lastFreezeTime = -Infinity;
    const [background, buttonColor] = makeColorPair(this.level, this.cfg, this.random);
    this.background = background;
    this.button = new TargetButton(buttonColor, this.cfg, this.random, this.playArea);
  }

  // ---------- Конечный автомат ----------

  // Переход допустим только по таблице TRANSITIONS; иначе состояние не меняется.
  #transitionTo(next) {
    if (!TRANSITIONS[this.#state].includes(next)) {
      this.log.add('FSM', `недопустимый переход ${this.#state} -> ${next}`, this.now);
      return false;
    }
    this.log.add('FSM', `${this.#state} -> ${next}`, this.now);
    this.#state = next;
    return true;
  }

  startGame(nowMs = this.now) {
    this.now = nowMs;
    if (!TRANSITIONS[this.#state].includes(STATE.PLAY)) return false; // уже идёт игра
    this.reset();
    this.#transitionTo(STATE.PLAY);
    this.log.add('START', 'новая игра началась', this.now);
    return true;
  }

  #finish(result) {
    this.#transitionTo(result);
    this.log.add(result === STATE.WIN ? 'WIN' : 'LOSE',
      `очки: ${this.score}, уровень: ${this.level}`, this.now);
  }

  // ---------- Ввод: клик ----------

  // Возвращает 'hit' | 'miss' | 'ignored'
  click(x, y, nowMs = this.now) {
    this.now = nowMs;
    if (this.#state !== STATE.PLAY) return 'ignored';
    if (y < HUD_HEIGHT) return 'ignored'; // клики по HUD игнорируем
    if (this.button.contains(x, y)) {
      this.#onHit();
      return 'hit';
    }
    this.lives -= 1;
    this.misses += 1;
    this.combo = 0;
    this.multiplier = 1; // промах сбрасывает серию
    this.log.add('MISS', `промах, жизней: ${this.lives}`, this.now);
    if (this.lives <= 0) this.#finish(STATE.LOSE);
    return 'miss';
  }

  // Попадание: серия, множитель, очки, уровни, новые цвета
  #onHit() {
    this.combo += 1;
    this.hits += 1;
    this.multiplier = Math.min(this.cfg.maxMultiplier, 1 + Math.floor(this.combo / this.cfg.comboStep));
    this.maxMultiplier = Math.max(this.maxMultiplier, this.multiplier);
    this.score += this.cfg.pointsPerHit * this.level * this.multiplier;
    this.hitsOnLevel += 1;
    this.log.add('HIT', `очки: ${this.score}, множитель x${this.multiplier}`, this.now);
    if (this.hitsOnLevel >= this.cfg.hitsPerLevel) {
      this.hitsOnLevel = 0;
      this.level += 1;
      if (this.level > this.cfg.maxLevel) {
        this.level = this.cfg.maxLevel; // последний уровень пройден: победа
        this.#finish(STATE.WIN);
        return;
      }
      this.log.add('LEVEL', `уровень ${this.level}`, this.now);
    }
    this.button.onHit();
    [this.background, this.button.color] = makeColorPair(this.level, this.cfg, this.random);
  }

  // ---------- Обновление кадра ----------

  update(nowMs = this.now) {
    this.now = nowMs;
    if (this.#state === STATE.PLAY && !this.isFrozen) this.button.update();
  }

  // ---------- Способность «заморозка» (кулдаун и режим действия) ----------

  get isFrozen() {
    return this.now < this.frozenUntil;
  }

  freezeCooldownLeft(nowMs = this.now) {
    return Math.max(0, this.lastFreezeTime + FREEZE_COOLDOWN_MS - nowMs);
  }

  // Останавливает кнопку на FREEZE_DURATION_MS. Повтор возможен только после кулдауна.
  useFreeze(nowMs = this.now) {
    this.now = nowMs;
    if (this.#state !== STATE.PLAY) return false;
    if (nowMs - this.lastFreezeTime < FREEZE_COOLDOWN_MS) return false; // кулдаун не прошёл
    this.lastFreezeTime = nowMs;
    this.frozenUntil = nowMs + FREEZE_DURATION_MS;
    this.log.add('FREEZE', `кнопка заморожена на ${FREEZE_DURATION_MS} мс`, nowMs);
    return true;
  }

  // ---------- Расчётные величины ----------

  get deltaE() {
    return deltaE(this.background, this.button.color);
  }

  // Коэффициент маскировки текущей пары цветов (0 — контраст, 1 — полное слияние)
  get camouflage() {
    return camouflageCoefficient(this.background, this.button.color);
  }

  get accuracy() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  // Строка профиля — те же поля, что в clicker_profiles.csv из ЛР 2
  toProfileRow(name, date = '') {
    return { 'Имя': name, 'Уровень': this.level, 'Очки': this.score, 'Множитель': this.maxMultiplier, 'Дата': date };
  }

  snapshot() {
    return {
      state: this.#state, score: this.score, level: this.level, lives: this.lives,
      multiplier: this.multiplier, hits: this.hits, misses: this.misses,
      accuracy: this.accuracy, camouflage: this.camouflage,
    };
  }
}
