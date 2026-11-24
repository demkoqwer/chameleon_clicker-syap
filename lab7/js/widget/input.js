// js/input.js — ввод с клавиатуры через массив-флаги.
// События keydown/keyup только ОТМЕЧАЮТ состояние клавиши, а игровой цикл ОПРАШИВАЕТ его каждый шаг.
// Так движение плавное: не зависит от задержки и частоты автоповтора keydown в операционной системе.
//
// Клавиши хранятся по e.code (физическая клавиша: «KeyW»), а не по e.key: поэтому WASD работает
// и в русской раскладке (там на клавише W буква «ц»).

// Клавиши управления: для них отключается действие браузера по умолчанию (прокрутка страницы пробелом и стрелками)
const CONTROL_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter',
]);

export class KeyboardInput {
  #keys = {};    // { KeyW: true, ShiftLeft: false, ... } — зажата ли клавиша сейчас
  #taps = {};    // для одноразовых действий: «клавишу нажали, а цикл ещё не заметил»

  // target — окно, на котором слушаем события (в тестах можно подставить заглушку)
  constructor(target) {
    this.target = target;
    this.onKeyDown = (e) => {
      if (CONTROL_CODES.has(e.code)) e.preventDefault(); // без прокрутки страницы
      if (!this.#keys[e.code]) this.#taps[e.code] = true; // новое нажатие (автоповтор keydown не считается)
      this.#keys[e.code] = true;
    };
    this.onKeyUp = (e) => {
      this.#keys[e.code] = false; // tap остаётся: быстрый тап короче одного шага не теряется
    };
    this.onBlur = () => this.release(); // окно потеряло фокус: «залипших» клавиш быть не должно
  }

  attach() {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
  }

  detach() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  // Зажата ли хотя бы одна из клавиш (для непрерывных действий — движения)
  isDown(...codes) {
    return codes.some((code) => this.#keys[code] === true);
  }

  // Одноразовое действие: true один раз за нажатие (удержание не повторяет). Это тот же опрос флага,
  // но с запоминанием: тап короче одного шага симуляции (16 мс) не пропадёт между опросами.
  wasPressed(...codes) {
    for (const code of codes) {
      if (this.#taps[code] === true) {
        this.#taps[code] = false;
        return true;
      }
    }
    return false;
  }

  // Снимок состояния для текущего шага — «опрос в начале каждого кадра»
  read() {
    return {
      up: this.isDown('KeyW', 'ArrowUp'),
      down: this.isDown('KeyS', 'ArrowDown'),
      left: this.isDown('KeyA', 'ArrowLeft'),
      right: this.isDown('KeyD', 'ArrowRight'),
      fast: this.isDown('ShiftLeft', 'ShiftRight'),
    };
  }

  release() {
    this.#keys = {};
    this.#taps = {};
  }
}
