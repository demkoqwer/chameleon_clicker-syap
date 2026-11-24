// js/gameBridge.js — «мост» между сайтом и ядром игры: как апгрейды и тема влияют на правила и цвета.
// Чистые функции без DOM. Ядро (core/) об апгрейдах и темах ничего не знает: сайт лишь подставляет ему
// новые настройки и цвета через публичные поля.
import { GameConfig } from './core/gameConfig.js';
import { deltaE, ensureVisible } from './core/colorMath.js';
import { hexToRgb } from './themes/utils.js';

export const MAX_START_RADIUS = 150; // ограничения GameConfig: радиус ≤ 200, минимальный радиус ≤ 50
export const MAX_MIN_RADIUS = 50;

const toSnake = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Бонус апгрейда «Увеличение радиуса»: +step px к стартовому радиусу и +step/2 к минимальному за каждый уровень
export function radiusBonus(upgrade) {
  return { start: upgrade.level * upgrade.step, min: upgrade.level * Math.floor(upgrade.step / 2) };
}

// Новая (неизменяемая) конфигурация ядра с учётом апгрейда. Базовые значения берутся из data/clicker_config.json.
export function buildConfig(baseConfig, radiusUpgrade) {
  const values = Object.fromEntries(Object.entries(baseConfig).map(([key, value]) => [toSnake(key), value]));
  const bonus = radiusBonus(radiusUpgrade);
  values.button_start_radius = Math.min(MAX_START_RADIUS, baseConfig.buttonStartRadius + bonus.start);
  values.button_min_radius = Math.min(MAX_MIN_RADIUS, baseConfig.buttonMinRadius + bonus.min);
  return new GameConfig(values);
}

// Цвет кнопки для уровня: на первых уровнях самый заметный из разрешённых цветов темы, на последних — самый
// близкий к фону (труднее найти). Так тема «растёт» по сложности вместе с уровнем.
export function pickColorForLevel(theme, level, maxLevel) {
  const bg = hexToRgb(theme.background);
  const colors = theme.allowedColors
    .map((hex) => ({ rgb: hexToRgb(hex), dE: deltaE(bg, hexToRgb(hex)) }))
    .sort((a, b) => b.dE - a.dE); // от самого заметного к самому незаметному
  if (colors.length === 0) return null;
  const progress = maxLevel > 1 ? (level - 1) / (maxLevel - 1) : 0;
  const index = Math.min(colors.length - 1, Math.max(0, Math.round(progress * (colors.length - 1))));
  return ensureVisible(bg, colors[index].rgb); // страховка: цвет не должен быть невидимым
}

// Применить тему к текущему состоянию ядра: фон и цвет кнопки. Возвращает true, если тема применена.
export function applyTheme(engine, theme) {
  if (!theme) return false;
  const color = pickColorForLevel(theme, engine.level, engine.cfg.maxLevel);
  if (!color) return false;
  engine.background = hexToRgb(theme.background);
  engine.button.color = color;
  return true;
}
