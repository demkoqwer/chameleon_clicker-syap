// js/random.js — источник случайных чисел с возможностью «зафиксировать зерно».
// Без зерна работает как Math.random; с зерном даёт повторяемую последовательность
// (алгоритм mulberry32), поэтому самопроверка детерминирована.

export class Random {
  #seeded;
  #state;

  constructor(seed = null) {
    this.#seeded = seed !== null;
    this.#state = this.#seeded ? seed >>> 0 : 0;
  }

  // Число из [0, 1)
  next() {
    if (!this.#seeded) return Math.random();
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Целое из [min, max] включительно (аналог random.randint)
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // Дробное из [min, max) (аналог random.uniform)
  float(min, max) {
    return min + this.next() * (max - min);
  }
}
