// js/widget-integration.js — сборка главной страницы: подключает виджет из ЛР 5, магазин улучшений,
// хотбар тем (ЛР 6) и динамический HUD. Виджет и ядро ничего не знают о сайте: связь идёт через
//   • хуки виджета (onHit, onMiss, onFrame),
//   • публичные поля ядра (engine.cfg, engine.background, engine.button.color),
//   • подмену сценариев freeze / start / restart в реестре виджета.
import { Widget } from './widget/widget.js';
import { GameConfig } from './core/gameConfig.js';
import { Random } from './core/random.js';
import { STATE, WINDOW_HEIGHT, WINDOW_WIDTH } from './core/constants.js';
import { Economy, UPGRADES_KEY, WALLET_KEY } from './economy.js';
import { MAX_MIN_RADIUS, MAX_START_RADIUS, applyTheme, buildConfig } from './gameBridge.js';
import { Hud } from './hud.js';
import { Hotbar } from './hotbar.js';
import { ShopPanel } from './shop.js';
import { notify } from './site.js';

// ---------- Настройки игры (те же, что в ЛР 4 и 5) ----------
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

const baseConfig = await loadConfig();
const economy = new Economy();
const canvas = document.getElementById('game');
const stage = document.getElementById('stage');

let widget;           // создаётся ниже; хуки обращаются к нему уже после создания
let theme = null;     // выбранная в хотбаре тема (объект) или null — случайные цвета ядра
let lastState = null;

// ---------- Хуки виджета ----------
const hooks = {
  // Попадание: очки копятся на балансе (LocalStorage), тема перекрашивает кнопку после пересчёта цветов ядром
  onHit({ gain }) {
    economy.earn(gain);
    if (theme) applyTheme(widget.engine, theme);
    shop.update();
  },

  // Каждый кадр: обновить HUD и отследить конец партии
  onFrame(w) {
    hud.update(w, economy);
    const state = w.engine.state;
    if (state !== lastState) {
      lastState = state;
      if (state === STATE.WIN || state === STATE.LOSE) {
        economy.recordGame(w.engine.score);
        notify(state === STATE.WIN ? `Победа! Очки партии: ${w.engine.score}` : `Игра окончена. Очки партии: ${w.engine.score}`, state === STATE.LOSE);
      }
    }
  },
};

widget = new Widget(canvas, buildConfig(baseConfig, economy.get('radius')), new Random(), hooks);
const hud = new Hud(document);

// ---------- Апгрейд «Увеличение радиуса» ----------
// Ядро берёт настройки из engine.cfg при старте партии, поэтому подставляем новую конфигурацию.
function syncConfig() {
  const cfg = buildConfig(baseConfig, economy.get('radius'));
  widget.config = cfg;        // используется при restart (новое ядро)
  widget.engine.cfg = cfg;    // используется при startGame (reset ядра)
}

function applyRadiusPurchase() {
  const upgrade = economy.get('radius');
  syncConfig();
  const engine = widget.engine;
  if (engine.state === STATE.PLAY) { // во время партии радиус растёт сразу
    engine.button.radius = Math.min(MAX_START_RADIUS, engine.button.radius + upgrade.step);
    engine.button.minRadius = Math.min(MAX_MIN_RADIUS, engine.button.minRadius + Math.floor(upgrade.step / 2));
  }
}

// ---------- Подмена сценариев ----------
const scenarios = widget.scenarios;
const rawFreeze = scenarios.freeze;
const rawStart = scenarios.start;
const rawRestart = scenarios.restart;

// Заморозка стоит заряда: заряд тратится только если ядро приняло заморозку (идёт игра, кулдаун прошёл)
scenarios.freeze = () => {
  if (economy.level('freeze') < 1) {
    notify('Нет зарядов заморозки — купите в магазине', true);
    return false;
  }
  if (!rawFreeze()) {
    notify('Заморозка недоступна: игра не идёт или идёт перезарядка', true);
    return false;
  }
  economy.useFreezeCharge();
  shop.update();
  return true;
};

// В новой партии сразу применяем выбранную тему (ядро при старте подбирает собственные цвета)
scenarios.start = () => {
  const ok = rawStart();
  if (ok && theme) applyTheme(widget.engine, theme);
  return ok;
};
scenarios.restart = () => {
  const ok = rawRestart();
  if (theme) applyTheme(widget.engine, theme);
  return ok;
};

// ---------- Магазин ----------
const shop = new ShopPanel(economy, document.getElementById('shop-list'), document.getElementById('shop-balance'), {
  baseRadius: baseConfig.buttonStartRadius,
  onBuy(id) {
    const result = economy.buy(id);
    if (!result.ok) {
      notify(result.reason === 'funds' ? `Не хватает очков (нужно ${result.cost})` : 'Достигнут максимум', true);
      return;
    }
    if (id === 'radius') applyRadiusPurchase();
    shop.update();
    notify(`Куплено: ${economy.get(id).name}`);
  },
});

document.getElementById('btn-reset-progress').addEventListener('click', () => {
  if (!window.confirm('Сбросить баланс и улучшения?')) return;
  economy.resetProgress();
  syncConfig();
  shop.update();
  notify('Прогресс сброшен');
});

// ---------- Хотбар тем ----------
const hotbar = new Hotbar(document.getElementById('hotbar-list'), (selected) => {
  theme = selected;
  if (selected) {
    applyTheme(widget.engine, selected);
    notify(`Тема «${selected.name}»`);
  } else {
    scenarios.recolor(); // вернуть случайные цвета ядра
    notify('Случайные цвета ядра');
  }
});
theme = hotbar.selected;
if (theme) applyTheme(widget.engine, theme);

// ---------- Изменения из другой вкладки (баланс, апгрейды) ----------
window.addEventListener('storage', (event) => {
  if (event.key === WALLET_KEY || event.key === UPGRADES_KEY || event.key === null) {
    economy.reload();
    syncConfig();
    shop.update();
  }
});

// ---------- Размер холста: самый большой прямоугольник 4:3, помещающийся в область stage ----------
// Холст всегда виден целиком, страница не прокручивается. Пропорции 4:3 сохраняются, поэтому
// пересчёт координат мыши в виджете (getBoundingClientRect) остаётся точным.
function fitCanvas() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w === 0 || h === 0) return;
  const scale = Math.min(w / WINDOW_WIDTH, h / WINDOW_HEIGHT);
  canvas.style.width = `${Math.floor(WINDOW_WIDTH * scale)}px`;
  canvas.style.height = `${Math.floor(WINDOW_HEIGHT * scale)}px`;
}
new ResizeObserver(fitCanvas).observe(stage);
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------- Предупреждение, если LocalStorage недоступен ----------
const banner = document.getElementById('banner');
if (economy.error) {
  banner.textContent = economy.error;
  banner.hidden = false;
}

widget.start();

// Для защиты и отладки: Site.economy.balance, Site.widget.scenarios.help() ...
window.Site = {
  widget,
  economy,
  hotbar,
  shop,
  get engine() { return widget.engine; },
};
console.info('Chameleon Site: Site.economy, Site.hotbar, Site.widget.scenarios.help()');
