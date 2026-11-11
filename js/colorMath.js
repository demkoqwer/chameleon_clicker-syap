// js/colorMath.js — расчёты с цветом: сближение (ЛР 1) и коэффициент маскировки (ЛР 4).
// Модуль не зависит от браузера и Node: только чистые функции.
import { MIN_DELTA_E } from './constants.js';

// ---------- Базовые функции (порт color_utils.py) ----------

export function clamp(value, low = 0, high = 255) {
  return Math.max(low, Math.min(high, value));
}

export function randomColor(random) {
  return [random.int(0, 255), random.int(0, 255), random.int(0, 255)];
}

// Макс. разница каналов для уровня: max(min, start - (level - 1) * step)
export function maxDiffForLevel(level, cfg) {
  return Math.max(cfg.colorDiffMin, cfg.colorDiffStart - (level - 1) * cfg.colorDiffStep);
}

// Алгоритм сближения значений: каждый канал сдвигается на случайную величину [-maxDiff, +maxDiff]
export function similarColor(base, maxDiff, random) {
  return base.map((c) => clamp(c + random.int(-maxDiff, maxDiff)));
}

// Наибольшая разница по одному из каналов
export function channelDifference(c1, c2) {
  return Math.max(...c1.map((a, i) => Math.abs(a - c2[i])));
}

// ---------- Новое в ЛР 4: упрощённая Delta E и коэффициент маскировки ----------

// Упрощённая Delta E («redmean»): взвешенное расстояние в RGB, учитывающее, что глаз
// по-разному чувствителен к каналам. Вес красного и синего зависит от среднего красного r:
//   dE = sqrt( (2 + r/256)·dR² + 4·dG² + (2 + (255 − r)/256)·dB² ),  r = (R1 + R2) / 2
export function deltaE(c1, c2) {
  const r = (c1[0] + c2[0]) / 2;
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

// Максимально возможная Delta E — между чёрным и белым (≈ 764.8). Нужна для нормировки.
export const DELTA_E_MAX = deltaE([0, 0, 0], [255, 255, 255]);

// Коэффициент маскировки K от 0 до 1:  K = 1 − dE / dE_max.
// K = 1 — цвета совпали (кнопка полностью слилась), K = 0 — максимальный контраст.
export function camouflageCoefficient(c1, c2) {
  return 1 - deltaE(c1, c2) / DELTA_E_MAX;
}

// Максимально достижимый коэффициент: при dE = MIN_DELTA_E (кнопка ещё различима).
export const MAX_CAMOUFLAGE = 1 - MIN_DELTA_E / DELTA_E_MAX;

function luminance(c) {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

// Гарантия «не абсолютно невидима, но максимально близка к фону»:
// если dE(фон, кнопка) < порога, цвет отодвигается от фона минимально необходимое расстояние.
export function ensureVisible(bg, color, minDeltaE = MIN_DELTA_E) {
  if (deltaE(bg, color) >= minDeltaE) return color; // уже различима — не трогаем

  // Направление смещения: от фона к цвету кнопки (сохраняет «оттенок» кнопки)
  let dir = color.map((c, i) => c - bg[i]);
  if (dir.every((d) => d === 0)) {
    // цвета совпали — отодвигаем светлый фон к тёмному, тёмный к светлому
    const s = luminance(bg) > 127 ? -1 : 1;
    dir = [s, s, s];
  }
  const maxAbs = Math.max(...dir.map(Math.abs));

  for (const sign of [1, -1]) {
    // шаг за шагом увеличиваем смещение (на 1 по самому большому каналу за шаг)
    for (let k = 1; k <= 256; k++) {
      const candidate = bg.map((c, i) => clamp(Math.round(c + (sign * dir[i] * k) / maxAbs)));
      if (deltaE(bg, candidate) >= minDeltaE) return candidate;
    }
  }
  // Запасной вариант: равный сдвиг всех каналов (dE ≈ 3·сдвиг ≥ порога)
  for (const d of [minDeltaE, -minDeltaE]) {
    const candidate = bg.map((c) => clamp(c + d));
    if (deltaE(bg, candidate) >= minDeltaE) return candidate;
  }
  return bg.map((c) => (c < 128 ? 255 : 0)); // недостижимо, но функция всегда возвращает цвет
}

// Пара (фон, кнопка) для уровня: сближение + гарантия видимости
export function makeColorPair(level, cfg, random) {
  const background = randomColor(random);
  const button = ensureVisible(background, similarColor(background, maxDiffForLevel(level, cfg), random));
  return [background, button];
}
