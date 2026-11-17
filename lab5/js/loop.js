// js/loop.js — игровой цикл с фиксированным шагом симуляции (накопитель, accumulator).
// Класс не знает про браузер: время ему передаёт вызывающий код, поэтому его можно проверить в Node.
//
// Идея: отрисовка идёт с частотой браузера (60, 120, 144 Гц), а логика ядра — строго по 60 шагов в секунду.
// Ядро из ЛР 4 считает «в кадрах» (скорость 2 px/кадр), и это не должно зависеть от монитора.

export const STEP_MS = 1000 / 60; // длительность одного шага симуляции, мс
export const MAX_DELTA_MS = 100;  // защита от «прыжка» после сворачивания вкладки

export class FixedStepLoop {
  #accumulator = 0;

  // onStep — один шаг логики; stepMs — длина шага; maxDeltaMs — предел времени, добавляемого за один кадр
  constructor(onStep, stepMs = STEP_MS, maxDeltaMs = MAX_DELTA_MS) {
    this.onStep = onStep;
    this.stepMs = stepMs;
    this.maxDeltaMs = maxDeltaMs;
  }

  // Принимает время, прошедшее с прошлого кадра браузера, и делает столько шагов, сколько в него «влезло».
  // scale — масштаб времени симуляции (1 — обычное, 0.3 — замедление). Возвращает число сделанных шагов.
  advance(deltaMs, scale = 1) {
    this.#accumulator += Math.min(Math.max(deltaMs, 0), this.maxDeltaMs) * scale;
    let steps = 0;
    while (this.#accumulator >= this.stepMs) {
      this.onStep();
      this.#accumulator -= this.stepMs;
      steps += 1;
    }
    return steps;
  }

  // Неотработанный остаток времени (доля шага, 0..1)
  get remainder() {
    return this.#accumulator / this.stepMs;
  }

  reset() {
    this.#accumulator = 0;
  }
}
