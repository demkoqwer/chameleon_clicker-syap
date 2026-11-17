// js/constants.js — все константы ядра в одном месте (аналог constants.py)

// --- Игровое поле (как в Pygame-версии) ---
export const WINDOW_WIDTH = 800;
export const WINDOW_HEIGHT = 600;
export const HUD_HEIGHT = 50; // верхняя панель: клики по ней игнорируются

// --- Состояния конечного автомата ---
// Объект-перечисление: опечатка в имени состояния (STATE.PLAI) даст undefined, а не тихую ошибку.
export const STATE = Object.freeze({
  MENU: 'MENU',
  PLAY: 'PLAY',
  WIN: 'WIN',
  LOSE: 'LOSE',
});

// Допустимые переходы: из какого состояния в какие можно перейти.
export const TRANSITIONS = Object.freeze({
  [STATE.MENU]: [STATE.PLAY],
  [STATE.PLAY]: [STATE.WIN, STATE.LOSE],
  [STATE.WIN]: [STATE.PLAY],   // перезапуск (клавиша R в Pygame)
  [STATE.LOSE]: [STATE.PLAY],
});

// --- Настройки по умолчанию (те же ключи, что в clicker_config.json из ЛР 2) ---
export const DEFAULT_CONFIG = Object.freeze({
  start_lives: 3,              // промах мимо кнопки отнимает жизнь
  hits_per_level: 5,           // попаданий до нового уровня
  max_level: 10,               // достиг этого уровня — победа
  button_start_radius: 60,
  button_min_radius: 8,
  button_shrink_factor: 0.95,  // радиус уменьшается на 5% после попадания
  button_start_speed: 2.0,     // пикселей за кадр
  button_speed_step: 0.4,      // прирост скорости за попадание
  color_diff_start: 200,       // макс. разница каналов фона и кнопки на 1-м уровне
  color_diff_min: 15,          // нижняя граница разницы каналов
  color_diff_step: 20,         // на сколько разница падает с уровнем
  points_per_hit: 10,          // очки = points_per_hit * уровень * множитель
  combo_step: 3,               // попаданий подряд для +1 к множителю
  max_multiplier: 5,           // максимальный множитель клика
});

// --- Маскировка: порог видимости по упрощённой Delta E ---
// Если разница цветов меньше порога, кнопка считается невидимой, поэтому цвет отодвигается от фона.
export const MIN_DELTA_E = 12;

// --- Способность «заморозка кнопки» (кулдаун считается в мс игровых часов) ---
export const FREEZE_DURATION_MS = 3000;
export const FREEZE_COOLDOWN_MS = 10000;
