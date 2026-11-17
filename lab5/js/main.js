// js/main.js — точка входа: загружает настройки игры (data/) и запускает виджет.
import { GameConfig } from '../core/gameConfig.js';
import { Widget } from './widget.js';

async function loadConfig() {
  try {
    const response = await fetch(new URL('../data/clicker_config.json', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { config, warnings } = GameConfig.fromJSONOrDefault(await response.text());
    warnings.forEach((w) => console.warn(w));
    return config;
  } catch (e) {
    console.warn(`Не удалось загрузить настройки: ${e.message}. Используются значения по умолчанию.`);
    return new GameConfig();
  }
}

const widget = new Widget(document.getElementById('game'), await loadConfig());
widget.start();

// Способ 2: вызов сценариев из консоли браузера — Chameleon.scenarios.explode()
window.Chameleon = {
  widget,
  scenarios: widget.scenarios,
  get engine() { return widget.engine; }, // ядро может пересоздаваться сценарием restart
};
console.info('Chameleon Clicker: сценарии — Chameleon.scenarios.help()');
