// js/storage.js — слой LocalStorage: чтение и запись JSON-массива тем под одним фиксированным ключом.
import { generateId, normalizeHex } from './utils.js';

export const STORAGE_KEY = 'chameleon_themes';

// «Миграция при чтении»: приводит запись к текущей схеме. Если в новой версии у темы появится поле,
// старые записи получат для него значение по умолчанию, а повреждённые записи отбрасываются.
export function normalizeTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const background = normalizeHex(raw.background);
  if (!name || !background) return null;
  const colors = Array.isArray(raw.allowedColors) ? raw.allowedColors.map(normalizeHex).filter(Boolean) : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    name,
    background,
    allowedColors: [...new Set(colors)],
    createdAt: Number.isNaN(Date.parse(raw.createdAt)) ? new Date().toISOString() : raw.createdAt,
  };
}

export class ThemeStorage {
  // backend — объект с интерфейсом localStorage (в тестах подставляется заглушка)
  constructor(backend = globalThis.localStorage, key = STORAGE_KEY) {
    this.key = key;
    this.error = null;       // последнее сообщение об ошибке хранилища (для показа на странице)
    this.memory = null;      // запасной вариант, если localStorage недоступен
    try {
      if (!backend) throw new Error('localStorage недоступен');
      backend.setItem('__chameleon_test__', '1'); // в режиме запрета хранения setItem бросает исключение
      backend.removeItem('__chameleon_test__');
      this.backend = backend;
    } catch (e) {
      this.backend = null;
      this.memory = new Map();
      this.error = 'LocalStorage недоступен: данные хранятся только до закрытия вкладки';
    }
  }

  get persistent() { return this.backend !== null; }

  #read() {
    return this.backend ? this.backend.getItem(this.key) : this.memory.get(this.key) ?? null;
  }

  // Есть ли вообще запись под ключом (пустой массив «[]» тоже считается: человек мог удалить всё сам)
  hasData() { return this.#read() !== null; }

  // Чтение: строка → JSON.parse → проверка каждой записи. Битый JSON не роняет страницу.
  load() {
    const raw = this.#read();
    if (raw === null) return [];
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error('ожидался массив');
      this.error = this.persistent ? null : this.error;
      return data.map(normalizeTheme).filter(Boolean);
    } catch (e) {
      this.error = `Данные в LocalStorage повреждены (${e.message}) — показан пустой список`;
      return [];
    }
  }

  // Запись целиком: объекты в localStorage хранятся только строками, поэтому JSON.stringify
  save(items) {
    const json = JSON.stringify(items);
    try {
      if (this.backend) this.backend.setItem(this.key, json);
      else this.memory.set(this.key, json);
      return true;
    } catch (e) { // например, переполнение квоты ~5 МБ
      this.error = `Не удалось сохранить: ${e.message}`;
      return false;
    }
  }

  raw() { return this.#read(); }
}
