// js/gameConfig.js — настройки игры из JSON с валидацией (порт load_config из data_io.py)
import { DEFAULT_CONFIG } from './constants.js';

// Допустимые типы и диапазоны: ключ -> [тип, минимум, максимум]
const LIMITS = Object.freeze({
  start_lives: ['int', 1, 10],
  hits_per_level: ['int', 1, 50],
  max_level: ['int', 1, 50],
  button_start_radius: ['int', 10, 200],
  button_min_radius: ['int', 2, 50],
  button_shrink_factor: ['float', 0.5, 0.99],
  button_start_speed: ['float', 0, 20],
  button_speed_step: ['float', 0, 5],
  color_diff_start: ['int', 0, 255],
  color_diff_min: ['int', 0, 255],
  color_diff_step: ['int', 0, 255],
  points_per_hit: ['int', 1, 1000],
  combo_step: ['int', 1, 50],
  max_multiplier: ['int', 1, 20],
});

// snake_case из JSON -> camelCase в JS: button_start_radius -> buttonStartRadius
const toCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function isValid(key, value) {
  const [type, low, high] = LIMITS[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return false; // true/false и строки отсеиваются
  if (type === 'int' && !Number.isInteger(value)) return false;
  return value >= low && value <= high;
}

export class GameConfig {
  constructor(values = DEFAULT_CONFIG) {
    for (const [key, value] of Object.entries(values)) {
      this[toCamel(key)] = value;
    }
    Object.freeze(this); // настройки неизменяемы после создания
  }

  static get limits() {
    return LIMITS;
  }

  // Проверка объекта настроек. strict = true: отсутствующие поля считаются ошибкой.
  static validate(raw, strict) {
    const values = { ...DEFAULT_CONFIG };
    const problems = [];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { values, problems: ['корневой элемент должен быть объектом'] };
    }
    for (const key of Object.keys(LIMITS)) {
      if (!(key in raw)) {
        if (strict) problems.push(`отсутствует обязательное поле «${key}»`);
        continue;
      }
      if (isValid(key, raw[key])) {
        values[key] = raw[key];
      } else {
        problems.push(`параметр «${key}» = ${JSON.stringify(raw[key])} недопустим`);
      }
    }
    // Согласованность параметров между собой
    if (values.button_min_radius >= values.button_start_radius) {
      problems.push('button_min_radius должен быть меньше button_start_radius');
      values.button_min_radius = DEFAULT_CONFIG.button_min_radius;
      values.button_start_radius = DEFAULT_CONFIG.button_start_radius;
    }
    if (values.color_diff_min > values.color_diff_start) {
      problems.push('color_diff_min больше color_diff_start');
      values.color_diff_min = DEFAULT_CONFIG.color_diff_min;
      values.color_diff_start = DEFAULT_CONFIG.color_diff_start;
    }
    return { values, problems };
  }

  // Строгая загрузка: любая проблема — исключение (try/catch снаружи).
  static fromJSON(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`Ошибка парсинга JSON: ${e.message}`);
    }
    const { values, problems } = GameConfig.validate(raw, true);
    if (problems.length > 0) {
      throw new Error(`Некорректные настройки: ${problems.join('; ')}`);
    }
    return new GameConfig(values);
  }

  // Мягкая загрузка (как в ЛР 2): не бросает исключений, неверное заменяет значениями по умолчанию.
  static fromJSONOrDefault(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { config: new GameConfig(), warnings: [`Ошибка парсинга JSON: ${e.message}`] };
    }
    const { values, problems } = GameConfig.validate(raw, false);
    return { config: new GameConfig(values), warnings: problems };
  }
}
