// js/validation.js — JS-валидация темы (вторая линия обороны после HTML5-атрибутов required/maxlength).
// HTML5-проверку можно обойти (DevTools, подмена данных), а эту функцию вызывает и создание, и редактирование,
// и хранилище, поэтому в базу не попадёт то, что не прошло проверку.
import { deltaE } from '../core/colorMath.js';
import { MIN_DELTA_E } from '../core/constants.js';
import { hexToRgb, normalizeHex, splitColorList } from './utils.js';

export const LIMITS = Object.freeze({ nameMin: 2, nameMax: 40, colorsMin: 1, colorsMax: 12 });

// input: { name, background, allowedColors } — allowedColors массивом или строкой «#aaa, #bbb»
// options: { existing — все темы (для проверки уникальности имени), selfId — id редактируемой темы }
// Возвращает { valid, errors: { поле: сообщение }, value: очищенная тема }
export function validateTheme(input, { existing = [], selfId = null } = {}) {
  const errors = {};

  // --- Название: обязательно, длина, уникальность ---
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Название обязательно';
  else if (name.length < LIMITS.nameMin) errors.name = `Название: минимум ${LIMITS.nameMin} символа`;
  else if (name.length > LIMITS.nameMax) errors.name = `Название: максимум ${LIMITS.nameMax} символов`;
  else if (existing.some((t) => t.id !== selfId && t.name.toLowerCase() === name.toLowerCase())) {
    errors.name = 'Тема с таким названием уже есть';
  }

  // --- Базовый цвет фона ---
  const background = normalizeHex(input.background);
  if (!background) errors.background = 'Фон: ожидается цвет вида #rrggbb';

  // --- Массив разрешённых цветов маскировки ---
  const tokens = Array.isArray(input.allowedColors) ? input.allowedColors.map(String) : splitColorList(input.allowedColors ?? '');
  const normalized = tokens.map(normalizeHex);
  const bad = tokens.filter((_, i) => normalized[i] === null);
  const allowedColors = [...new Set(normalized.filter(Boolean))];

  if (tokens.length === 0) {
    errors.allowedColors = 'Добавьте хотя бы один цвет маскировки';
  } else if (bad.length > 0) {
    errors.allowedColors = `Некорректный цвет: ${bad.slice(0, 3).join(', ')} (нужен #rrggbb)`;
  } else if (allowedColors.length !== normalized.length) {
    errors.allowedColors = 'Цвета не должны повторяться';
  } else if (allowedColors.length > LIMITS.colorsMax) {
    errors.allowedColors = `Не больше ${LIMITS.colorsMax} цветов`;
  } else if (background) {
    // Правило игры из ЛР 4: кнопка не должна быть абсолютно невидимой (ΔE ≥ MIN_DELTA_E)
    const bg = hexToRgb(background);
    const invisible = allowedColors
      .map((color) => ({ color, dE: deltaE(bg, hexToRgb(color)) }))
      .filter((c) => c.dE < MIN_DELTA_E);
    if (invisible.length > 0) {
      const list = invisible.slice(0, 3).map((c) => `${c.color} (ΔE ${c.dE.toFixed(1)})`).join(', ');
      errors.allowedColors = `Слишком близко к фону, кнопка будет невидима (ΔE < ${MIN_DELTA_E}): ${list}`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, value: { name, background, allowedColors } };
}
