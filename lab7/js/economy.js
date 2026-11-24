// js/economy.js — модель экономики сайта-кликера: баланс очков и апгрейды, всё хранится в LocalStorage.
// Здесь нет DOM: класс принимает покупки и заработок, проверяет правила и сразу сохраняет.
//
// Два ключа LocalStorage:
//   chameleon_wallet   — баланс и статистика:  { balance, totalEarned, bestScore, gamesPlayed }
//   chameleon_upgrades — НАСТРОЙКИ апгрейдов вместе с уровнями (массив объектов, см. DEFAULT_UPGRADES)
// Настройки читаются из LocalStorage при каждом запуске: если изменить, например, baseCost в DevTools,
// цена в магазине изменится после перезагрузки страницы.

export const WALLET_KEY = 'chameleon_wallet';
export const UPGRADES_KEY = 'chameleon_upgrades';

// Настройки по умолчанию (используются при первом запуске и как «запасные» значения для испорченных полей)
export const DEFAULT_UPGRADES = Object.freeze([
  {
    id: 'radius',
    name: 'Увеличение радиуса кнопки',
    description: 'Каждый уровень добавляет +5 px к стартовому радиусу кнопки (и +2 px к минимальному). Действует сразу и во всех следующих партиях.',
    baseCost: 50,      // цена первой покупки
    costGrowth: 1.6,   // цена растёт: baseCost × costGrowth ^ (число покупок)
    step: 5,           // px радиуса за уровень
    maxLevel: 10,
    level: 0,          // текущий уровень
    bought: 0,         // сколько раз куплено (от него считается цена)
  },
  {
    id: 'freeze',
    name: 'Заморозка движения на 3 секунды',
    description: 'Каждая покупка даёт 1 заряд. Заряд тратится при заморозке кнопки (кнопка «Применить» или клавиша F), между применениями перезарядка 10 с.',
    baseCost: 80,
    costGrowth: 1.25,
    step: 1,
    maxLevel: 20,      // для заморозки — максимум зарядов в запасе
    level: 0,          // для заморозки — число зарядов в запасе
    bought: 0,
  },
]);

export const DEFAULT_WALLET = Object.freeze({ balance: 0, totalEarned: 0, bestScore: 0, gamesPlayed: 0 });

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const intIn = (value, fallback, low, high) => (Number.isFinite(value) ? clamp(Math.round(value), low, high) : fallback);
const numIn = (value, fallback, low, high) => (Number.isFinite(value) ? clamp(value, low, high) : fallback);
const text = (value, fallback, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback);

// Приведение сохранённой записи апгрейда к допустимому виду (защита от ручной правки и битых данных)
export function normalizeUpgrade(raw, def) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const maxLevel = intIn(r.maxLevel, def.maxLevel, 1, 99);
  const level = intIn(r.level, 0, 0, maxLevel);
  return {
    id: def.id,
    name: text(r.name, def.name, 60),
    description: text(r.description, def.description, 300),
    baseCost: intIn(r.baseCost, def.baseCost, 1, 1_000_000),
    costGrowth: numIn(r.costGrowth, def.costGrowth, 1, 5),
    step: intIn(r.step, def.step, 1, 20),
    maxLevel,
    level,
    bought: intIn(r.bought, level, 0, 1_000_000),
  };
}

// Массив настроек: порядок и набор берутся из DEFAULT_UPGRADES, поэтому новый апгрейд, добавленный в код,
// автоматически появится и у тех, у кого в LocalStorage лежит старый массив (миграция при чтении)
export function normalizeUpgrades(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_UPGRADES.map((def) => normalizeUpgrade(list.find((u) => u && u.id === def.id), def));
}

export function normalizeWallet(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    balance: intIn(r.balance, 0, 0, 1e12),
    totalEarned: intIn(r.totalEarned, 0, 0, 1e12),
    bestScore: intIn(r.bestScore, 0, 0, 1e12),
    gamesPlayed: intIn(r.gamesPlayed, 0, 0, 1e9),
  };
}

export const upgradeCost = (u) => Math.round(u.baseCost * u.costGrowth ** u.bought);

export class Economy {
  // backend — объект с интерфейсом localStorage (в тестах подставляется заглушка)
  constructor(backend = globalThis.localStorage) {
    this.error = null;
    this.memory = new Map();
    try {
      if (!backend) throw new Error('localStorage недоступен');
      backend.setItem('__economy_test__', '1');
      backend.removeItem('__economy_test__');
      this.backend = backend;
    } catch {
      this.backend = null;
      this.error = 'LocalStorage недоступен: прогресс не сохранится после закрытия вкладки';
    }
    this.reload();
  }

  get persistent() { return this.backend !== null; }

  #read(key) {
    const raw = this.backend ? this.backend.getItem(key) : this.memory.get(key) ?? null;
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { this.error = `Данные «${key}» повреждены и сброшены к настройкам по умолчанию`; return null; }
  }

  #write(key, value) {
    const json = JSON.stringify(value);
    try {
      if (this.backend) this.backend.setItem(key, json);
      else this.memory.set(key, json);
    } catch (e) { // например, переполнена квота
      this.error = `Не удалось сохранить: ${e.message}`;
    }
  }

  // Чтение обоих ключей (при запуске и при изменении из другой вкладки). Результат сразу нормализуется и записывается обратно,
  // поэтому в LocalStorage всегда лежат «чистые» данные в текущем формате.
  reload() {
    this.wallet = normalizeWallet(this.#read(WALLET_KEY));
    this.upgrades = normalizeUpgrades(this.#read(UPGRADES_KEY));
    this.#write(WALLET_KEY, this.wallet);
    this.#write(UPGRADES_KEY, this.upgrades);
  }

  get balance() { return this.wallet.balance; }
  get(id) { return this.upgrades.find((u) => u.id === id) ?? null; }
  level(id) { return this.get(id)?.level ?? 0; }
  cost(id) { const u = this.get(id); return u ? upgradeCost(u) : Infinity; }
  isMaxed(id) { const u = this.get(id); return !u || u.level >= u.maxLevel; }
  canBuy(id) { return !this.isMaxed(id) && this.balance >= this.cost(id); }

  // Заработок: вызывается на каждое попадание
  earn(points) {
    const gain = Math.max(0, Math.floor(Number(points) || 0));
    if (gain === 0) return 0;
    this.wallet.balance += gain;
    this.wallet.totalEarned += gain;
    this.#write(WALLET_KEY, this.wallet);
    return gain;
  }

  // Покупка: списывает очки, повышает уровень, сохраняет оба ключа сразу
  buy(id) {
    const u = this.get(id);
    if (!u) return { ok: false, reason: 'unknown' };
    if (u.level >= u.maxLevel) return { ok: false, reason: 'max' };
    const cost = upgradeCost(u);
    if (this.balance < cost) return { ok: false, reason: 'funds', cost };
    this.wallet.balance -= cost;
    u.level += 1;
    u.bought += 1;
    this.#write(WALLET_KEY, this.wallet);
    this.#write(UPGRADES_KEY, this.upgrades);
    return { ok: true, cost, level: u.level };
  }

  // Трата заряда заморозки (вызывается только после того, как ядро приняло заморозку)
  useFreezeCharge() {
    const u = this.get('freeze');
    if (!u || u.level < 1) return false;
    u.level -= 1; // bought не уменьшается: цена следующей покупки не падает
    this.#write(UPGRADES_KEY, this.upgrades);
    return true;
  }

  recordGame(score) {
    this.wallet.gamesPlayed += 1;
    this.wallet.bestScore = Math.max(this.wallet.bestScore, Math.max(0, Math.floor(score)));
    this.#write(WALLET_KEY, this.wallet);
  }

  resetProgress() {
    this.wallet = { ...DEFAULT_WALLET };
    this.upgrades = normalizeUpgrades(null);
    this.#write(WALLET_KEY, this.wallet);
    this.#write(UPGRADES_KEY, this.upgrades);
  }
}
