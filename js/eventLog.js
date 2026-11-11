// js/eventLog.js — «чёрный ящик»: журнал событий игры с игровым временем (мс).
// Ядро не пишет в файлы: журнал хранится в памяти, а вывод — дело окружения.

export class EventLog {
  #entries = [];
  #limit;

  constructor(limit = 1000) {
    this.#limit = limit;
  }

  add(type, message, timeMs = 0) {
    this.#entries.push({ t: timeMs, type, message });
    if (this.#entries.length > this.#limit) this.#entries.shift(); // журнал не растёт бесконечно
  }

  get entries() {
    return [...this.#entries]; // копия: снаружи журнал не испортить
  }

  get length() {
    return this.#entries.length;
  }

  count(type) {
    return this.#entries.filter((e) => e.type === type).length;
  }

  last(n = 1) {
    return this.#entries.slice(-n);
  }

  toLines() {
    return this.#entries.map((e) => `[${String(e.t).padStart(6)} мс] ${e.type.padEnd(7)} | ${e.message}`);
  }

  clear() {
    this.#entries = [];
  }
}
