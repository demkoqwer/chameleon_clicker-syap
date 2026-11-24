// js/hud.js — динамический HUD. Значения приходят из ДВИЖКА (ядро + виджет), а вид индикатора меняется по ним:
// ширина полосы (style.width), цвет (CSS-класс calm → mid → crit), подпись (textContent).
// HUD обновляется каждый кадр, но DOM-узлы не создаются заново: меняются только свойства существующих элементов,
// и только если значение изменилось (кэш), поэтому браузеру не приходится пересчитывать страницу впустую.
import { FREEZE_COOLDOWN_MS, FREEZE_DURATION_MS, STATE } from './core/constants.js';
import { MAX_CAMOUFLAGE } from './core/colorMath.js';

// ---------- Чистая логика состояний индикаторов (проверяется в Node) ----------

// Показатель, где МЕНЬШЕ = ХУЖЕ (жизни): мало осталось → критично
export function lowIsBad(ratio) {
  if (ratio < 0.4) return 'crit';
  if (ratio < 0.8) return 'mid';
  return 'calm';
}

// Показатель, где БОЛЬШЕ = ХУЖЕ (маскировка кнопки: чем сильнее сливается с фоном, тем труднее)
export function highIsBad(ratio) {
  if (ratio > 0.85) return 'crit';
  if (ratio > 0.6) return 'mid';
  return 'calm';
}

export const STATE_LABELS = { menu: 'МЕНЮ', play: 'ИГРА', pause: 'ПАУЗА', win: 'ПОБЕДА', lose: 'ПОРАЖЕНИЕ' };

export function stateKey(engineState, paused) {
  if (paused) return 'pause';
  return { [STATE.MENU]: 'menu', [STATE.PLAY]: 'play', [STATE.WIN]: 'win', [STATE.LOSE]: 'lose' }[engineState] ?? 'menu';
}

// Индикатор заморозки: { ratio 0..1, label, cls }
export function freezeView({ frozen, remainingMs, cooldownLeftMs, charges, playing }) {
  if (frozen) return { ratio: Math.max(0, Math.min(1, remainingMs / FREEZE_DURATION_MS)), label: `заморожена ${(remainingMs / 1000).toFixed(1)} с`, cls: 'ice' };
  if (cooldownLeftMs > 0 && playing) return { ratio: 1 - cooldownLeftMs / FREEZE_COOLDOWN_MS, label: `перезарядка ${(cooldownLeftMs / 1000).toFixed(1)} с`, cls: 'mid' };
  if (charges < 1) return { ratio: 0, label: 'нет зарядов', cls: 'off' };
  return { ratio: 1, label: `готова · зарядов ${charges}`, cls: 'calm' };
}

// ---------- Привязка к DOM ----------

export class Hud {
  #cache = new Map();

  constructor(doc = document) {
    const $ = (id) => doc.getElementById(id);
    this.el = {
      state: $('hud-state'), stateText: $('hud-state-text'), balance: $('hud-balance'), score: $('hud-score'), mult: $('hud-mult'),
      level: $('hud-level'), levelFill: $('hud-level-fill'),
      lives: $('hud-lives'), livesFill: $('hud-lives-fill'),
      camo: $('hud-camo'), camoFill: $('hud-camo-fill'),
      freeze: $('hud-freeze'), freezeFill: $('hud-freeze-fill'),
    };
  }

  // Записать, только если значение изменилось
  #text(name, value) {
    const text = String(value);
    if (this.#cache.get(name) === text) return;
    this.#cache.set(name, text);
    this.el[name].textContent = text;
  }

  #fill(name, ratio, cls) {
    const width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    if (this.#cache.get(`${name}:w`) !== width) {
      this.#cache.set(`${name}:w`, width);
      this.el[name].style.width = width;
    }
    const className = `meter-fill ${cls}`;
    if (this.#cache.get(`${name}:c`) !== className) {
      this.#cache.set(`${name}:c`, className);
      this.el[name].className = className;
    }
  }

  // Вызывается каждый кадр: widget — виджет (внутри ядро), economy — баланс и запас зарядов
  update(widget, economy) {
    const e = widget.engine;
    const playing = e.state === STATE.PLAY;
    const key = stateKey(e.state, widget.paused);

    // Состояние: подпись + атрибут, по которому CSS меняет цвет и мигание индикатора
    this.#text('stateText', STATE_LABELS[key]);
    if (this.#cache.get('state:k') !== key) {
      this.#cache.set('state:k', key);
      this.el.state.dataset.state = key;
    }

    this.#text('balance', economy.balance);
    this.#text('score', e.score);
    this.#text('mult', `×${e.multiplier}`);

    // Уровень: прогресс внутри уровня
    this.#text('level', `${e.level}/${e.cfg.maxLevel} · ${e.hitsOnLevel}/${e.cfg.hitsPerLevel}`);
    this.#fill('levelFill', e.hitsOnLevel / e.cfg.hitsPerLevel, 'calm');

    // Жизни: чем меньше, тем «критичнее» вид
    const livesRatio = e.lives / e.cfg.startLives;
    this.#text('lives', `${e.lives}/${e.cfg.startLives}`);
    this.#fill('livesFill', livesRatio, lowIsBad(livesRatio));

    // Маскировка K: чем выше, тем труднее заметить кнопку
    const camoRatio = e.camouflage / MAX_CAMOUFLAGE;
    this.#text('camo', e.camouflage.toFixed(3));
    this.#fill('camoFill', camoRatio, highIsBad(camoRatio));

    // Заморозка: готовность, действие, перезарядка
    const view = freezeView({
      frozen: playing && e.isFrozen,
      remainingMs: e.frozenUntil - widget.simNow,
      cooldownLeftMs: e.freezeCooldownLeft(widget.simNow),
      charges: economy.level('freeze'),
      playing,
    });
    this.#text('freeze', view.label);
    this.#fill('freezeFill', view.ratio, view.cls);
  }
}
