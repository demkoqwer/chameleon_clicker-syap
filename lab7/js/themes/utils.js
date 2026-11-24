// js/utils.js — мелкие чистые функции: защита от XSS, идентификаторы, работа с HEX-цветами.
// Ничего не знает про DOM и localStorage, поэтому проверяется в Node (selftest.js).

// ---------- XSS-защита ----------
// Название темы вводит пользователь. Если вставить его в innerHTML как есть, строка вида
// <img src=x onerror=alert(1)> превратится в живой тег и выполнит скрипт.
// escapeHtml заменяет служебные символы HTML на «сущности», и браузер показывает их как обычный текст.
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// ---------- Идентификаторы ----------
// crypto.randomUUID() — криптографически случайный UUID v4. Он есть только в «безопасном контексте»
// (HTTPS или localhost). На http://192.168.x.x его нет, поэтому запасной вариант на getRandomValues.
export function generateId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // версия 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // вариант RFC 4122
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------- HEX-цвета ----------
// Приводит ввод к виду «#rrggbb» в нижнем регистре. Принимает «#abc», «abc», «#AABBCC». Иначе null.
export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim().toLowerCase();
  if (s.startsWith('#')) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = [...s].map((ch) => ch + ch).join('');
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

// Для вставки в style="...": любое некорректное значение (например, подделанное в localStorage) заменяется на чёрный
export function safeHex(value, fallback = '#000000') {
  return normalizeHex(value) ?? fallback;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) throw new Error(`Некорректный HEX-цвет: ${hex}`);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

// «#aabbcc, #ddeeff;  #112233» → ['#aabbcc', '#ddeeff', '#112233'] (без нормализации и без проверки)
export function splitColorList(text) {
  return String(text).split(/[\s,;]+/).filter(Boolean);
}
