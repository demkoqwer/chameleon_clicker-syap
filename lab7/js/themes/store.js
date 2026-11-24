// js/store.js — модель: CRUD над массивом тем + немедленное сохранение (паттерн «сохранить сразу»).
// Здесь нет DOM: store принимает данные, валидирует, меняет массив и вызывает storage.save().
// Что показывать на экране, решает crud.js.
import { camouflageCoefficient, deltaE, ensureVisible, similarColor } from '../core/colorMath.js';
import { generateId, hexToRgb, rgbToHex } from './utils.js';
import { validateTheme } from './validation.js';

// Примеры при первом запуске (чтобы страница не была пустой). Все проходят validateTheme.
export const SAMPLE_THEMES = [
  { name: 'Лесная чаща', background: '#2e4a2e', allowedColors: ['#335033', '#3a5a38', '#294429'] },
  { name: 'Океанская глубина', background: '#12304a', allowedColors: ['#183a58', '#1a3d5e', '#0e2a42', '#16405f'] },
  { name: 'Пустыня', background: '#c9a66b', allowedColors: ['#cfae75', '#c29e62', '#d4b27a'] },
];

export class ThemeStore {
  constructor(storage) {
    this.storage = storage;
    if (!storage.hasData()) {
      this.items = SAMPLE_THEMES.map((t, i) => this.#make(t, i));
      storage.save(this.items);
    } else {
      this.items = storage.load();
    }
  }

  // Создание записи: id (UUID v4) и дата создания ставятся здесь, а не приходят из формы
  #make(value, shift = 0) {
    return { id: generateId(), ...value, createdAt: new Date(Date.now() - shift * 1000).toISOString() };
  }

  list() { return this.items; }
  get(id) { return this.items.find((t) => t.id === id) ?? null; }
  reload() { this.items = this.storage.load(); }

  // ----- Create -----
  create(input) {
    const result = validateTheme(input, { existing: this.items });
    if (!result.valid) return { ok: false, errors: result.errors };
    const theme = this.#make(result.value);
    this.items.push(theme);
    this.storage.save(this.items); // сразу после операции
    return { ok: true, theme };
  }

  // ----- Update -----
  update(id, input) {
    const current = this.get(id);
    if (!current) return { ok: false, errors: { _: 'Тема не найдена (возможно, удалена в другой вкладке)' } };
    const result = validateTheme(input, { existing: this.items, selfId: id });
    if (!result.valid) return { ok: false, errors: result.errors };
    Object.assign(current, result.value); // id и createdAt остаются прежними
    this.storage.save(this.items);
    return { ok: true, theme: current };
  }

  // ----- Delete -----
  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((t) => t.id !== id);
    if (this.items.length === before) return false;
    this.storage.save(this.items);
    return true;
  }

  resetToSamples() {
    this.items = SAMPLE_THEMES.map((t, i) => this.#make(t, i));
    this.storage.save(this.items);
  }
}

// ---------- Фильтр: чистая функция-предикат (query — текст, minColors — число из ползунка) ----------
export function filterThemes(items, { query = '', minColors = 0 } = {}) {
  const q = query.trim().toLowerCase();
  return items.filter((t) => {
    if (t.allowedColors.length < minColors) return false;
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.background.includes(q) || t.allowedColors.some((c) => c.includes(q));
  });
}

// ---------- Оценка маскировки темы с помощью ядра ЛР 4 ----------
// minDeltaE — самый «незаметный» цвет (меньше ΔE = сильнее слияние с фоном);
// maxK — коэффициент маскировки этого цвета (ближе к 1 — лучше замаскирован)
export function themeStats(theme) {
  const bg = hexToRgb(theme.background);
  const dEs = theme.allowedColors.map((c) => deltaE(bg, hexToRgb(c)));
  if (dEs.length === 0) return { minDeltaE: null, maxK: null };
  const closest = theme.allowedColors[dEs.indexOf(Math.min(...dEs))];
  return { minDeltaE: Math.min(...dEs), maxK: camouflageCoefficient(bg, hexToRgb(closest)) };
}

// ---------- Подбор цветов маскировки: похожие на фон, но различимые (ensureVisible из ЛР 4) ----------
export function suggestColors(backgroundHex, count = 5, rng = defaultRng) {
  const bg = hexToRgb(backgroundHex);
  const result = [];
  for (let attempt = 0; attempt < count * 20 && result.length < count; attempt++) {
    const hex = rgbToHex(ensureVisible(bg, similarColor(bg, 30, rng)));
    if (!result.includes(hex)) result.push(hex);
  }
  return result;
}

const defaultRng = { int: (low, high) => low + Math.floor(Math.random() * (high - low + 1)) };
