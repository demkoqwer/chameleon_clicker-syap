// js/hotbar.js — хотбар: карточки тем из LocalStorage (ключ chameleon_themes — тот же, что у панели CRUD из ЛР 6).
// Клик по карточке выбирает тему: она записывается в состояние сайта и применяется в игре (фон и цвета кнопки).
import { ThemeStorage, STORAGE_KEY } from './themes/storage.js';
import { ThemeStore, themeStats } from './themes/store.js';
import { escapeHtml, safeHex } from './themes/utils.js';

export const SELECTED_KEY = 'chameleon_selected_theme';

const dot = (color) => `<i class="dot" style="background:${safeHex(color)}"></i>`;

export class Hotbar {
  // container — элемент для карточек, onSelect(theme | null) — вызывается при смене выбора
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.store = new ThemeStore(new ThemeStorage()); // при первом запуске создаёт примеры тем, как и панель CRUD
    this.selectedId = this.#loadSelected();

    // Делегирование: один обработчик на контейнер, карточки можно перерисовывать
    container.addEventListener('click', (event) => {
      const card = event.target.closest('.hotbar-card');
      if (!card) return;
      this.select(card.dataset.id || null);
      card.blur(); // иначе пробел на сфокусированной карточке «нажал» бы её снова, а не выстрелил в игре
    });

    // Темы добавили на странице CRUD в ДРУГОЙ вкладке: событие storage приходит сюда, хотбар обновляется без перезагрузки
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY || event.key === null) this.refresh();
    });
    // Возврат на страницу (кнопка «Назад», переключение вкладок) тоже перечитывает данные
    window.addEventListener('pageshow', () => this.refresh());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });

    this.render();
  }

  #loadSelected() {
    try { return localStorage.getItem(SELECTED_KEY) || null; } catch { return null; }
  }

  #saveSelected() {
    try {
      if (this.selectedId) localStorage.setItem(SELECTED_KEY, this.selectedId);
      else localStorage.removeItem(SELECTED_KEY);
    } catch { /* без хранилища выбор живёт до закрытия вкладки */ }
  }

  get themes() { return this.store.list(); }
  get selected() { return this.themes.find((t) => t.id === this.selectedId) ?? null; }

  select(id) {
    this.selectedId = id;
    this.#saveSelected();
    this.#markSelected();
    this.onSelect(this.selected);
  }

  // Перечитать данные из LocalStorage и перерисовать; если выбранную тему удалили, выбор сбрасывается
  refresh() {
    this.store.reload();
    const had = this.selectedId;
    if (had && !this.selected) {
      this.selectedId = null;
      this.#saveSelected();
    }
    this.render();
    if (had && !this.selectedId) this.onSelect(null);
  }

  render() {
    const noTheme = `
      <button type="button" class="hotbar-card" data-id="" aria-pressed="false">
        <span class="hb-preview hb-random"><i class="dot"></i><i class="dot"></i><i class="dot"></i></span>
        <span class="hb-name">Случайные цвета</span>
        <span class="hb-stats">как в ЛР 5: ядро подбирает пару само</span>
      </button>`;
    const cards = this.themes.map((t) => {
      const s = themeStats(t);
      const stats = s.minDeltaE === null ? 'нет цветов' : `ΔE ${s.minDeltaE.toFixed(1)} · K ${s.maxK.toFixed(2)} · ${t.allowedColors.length} цв.`;
      return `
      <button type="button" class="hotbar-card" data-id="${escapeHtml(t.id)}" aria-pressed="false" title="${escapeHtml(t.name)}">
        <span class="hb-preview" style="background:${safeHex(t.background)}">${t.allowedColors.slice(0, 5).map(dot).join('')}</span>
        <span class="hb-name">${escapeHtml(t.name)}</span>
        <span class="hb-stats">${escapeHtml(stats)}</span>
      </button>`;
    });
    this.container.innerHTML = noTheme + cards.join('');
    this.#markSelected();
  }

  #markSelected() {
    for (const card of this.container.querySelectorAll('.hotbar-card')) {
      const on = (card.dataset.id || null) === this.selectedId;
      card.classList.toggle('selected', on);
      card.setAttribute('aria-pressed', String(on));
    }
  }
}
