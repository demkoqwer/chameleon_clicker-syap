// js/controls.js — ВСЁ управление игрой в одном классе.
// KeyboardInput (input.js) только запоминает, какие клавиши нажаты. А здесь записано, что эти клавиши ДЕЛАЮТ:
//   • горячие клавиши (P, F, R, Enter, пробел) → вызов сценария из реестра;
//   • WASD / стрелки / Shift → движение прицела;
//   • пробел / Enter в игре → выстрел.
// Чтобы поменять или добавить клавишу, достаточно изменить таблицу KEY_BINDINGS.
import { HUD_HEIGHT, STATE, WINDOW_HEIGHT, WINDOW_WIDTH } from '../core/constants.js';

export const CURSOR_SPEED = 6; // пикселей за шаг; с Shift — вдвое быстрее

// Таблица горячих клавиш: какие клавиши → какой сценарий, и в каких состояниях игры это работает.
// states: null — всегда; иначе список состояний ядра.
export const KEY_BINDINGS = [
  { codes: ['KeyP'], states: null, scenario: 'pause' },                           // пауза / продолжить
  { codes: ['Enter', 'Space'], states: [STATE.MENU], scenario: 'start' },         // старт из меню
  { codes: ['KeyR', 'Enter'], states: [STATE.WIN, STATE.LOSE], scenario: 'start' }, // заново после конца партии
  { codes: ['KeyF'], states: [STATE.PLAY], scenario: 'freeze' },                  // заморозка кнопки
];

export class Controls {
  // input — KeyboardInput, scenarios — реестр сценариев, bindings — таблица клавиш
  constructor(input, scenarios, bindings = KEY_BINDINGS) {
    this.input = input;
    this.scenarios = scenarios;
    this.bindings = bindings;
  }

  // Горячие клавиши. Вызывается каждый шаг; state — текущее состояние ядра.
  // Одно нажатие срабатывает один раз (wasPressed), а в «чужом» состоянии не расходуется.
  hotkeys(state) {
    for (const { codes, states, scenario } of this.bindings) {
      if (states && !states.includes(state)) continue;
      if (this.input.wasPressed(...codes)) {
        this.scenarios[scenario]();
        return scenario; // за один шаг — одно действие
      }
    }
    return null;
  }

  // Движение прицела по зажатым клавишам. Меняет cursor { x, y } и не выпускает его за игровую зону.
  moveCursor(cursor) {
    const k = this.input.read();
    const v = k.fast ? CURSOR_SPEED * 2 : CURSOR_SPEED;
    cursor.x += ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * v;
    cursor.y += ((k.down ? 1 : 0) - (k.up ? 1 : 0)) * v;
    cursor.x = Math.max(0, Math.min(WINDOW_WIDTH, cursor.x));
    cursor.y = Math.max(HUD_HEIGHT, Math.min(WINDOW_HEIGHT, cursor.y));
  }

  // Выстрел с клавиатуры: пробел или Enter (один выстрел за нажатие)
  wantsShot() {
    return this.input.wasPressed('Space', 'Enter');
  }
}
