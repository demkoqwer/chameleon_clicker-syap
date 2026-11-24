// js/crud.js — представление и события: рисует карточки/таблицу и реагирует на действия пользователя.
// Данные и правила не здесь: ThemeStore (store.js) создаёт/меняет/удаляет и сразу сохраняет в LocalStorage,
// validateTheme (validation.js) проверяет, escapeHtml (utils.js) защищает от XSS.
import { ThemeStorage, STORAGE_KEY } from './storage.js';
import { ThemeStore, filterThemes, suggestColors, themeStats } from './store.js';
import { escapeHtml, normalizeHex, safeHex, splitColorList } from './utils.js';
import { LIMITS } from './validation.js';

const storage = new ThemeStorage();
const store = new ThemeStore(storage);

const $ = (selector) => document.querySelector(selector);
const els = {
  form: $('#create-form'), cards: $('#cards'), tableWrap: $('#table-wrap'), tbody: $('#themes tbody'),
  counter: $('#counter'), empty: $('#empty'), json: $('#json-view'), banner: $('#banner'), toast: $('#toast'),
  search: $('#search'), slider: $('#filterColors'), sliderOut: $('#filterVal'),
  viewCards: $('#view-cards'), viewTable: $('#view-table'),
};

// Состояние интерфейса (данные тем лежат в store, а не здесь)
const state = { view: 'cards', editingId: null, query: '', minColors: 0 };

// ======================================================================
// Разметка. Любая строка из данных проходит через escapeHtml (или safeHex для цветов в style="").
// ======================================================================

const dot = (color) => `<span class="dot" style="background:${safeHex(color)}"></span>`;
const chip = (color) => `<span class="chip"><i style="background:${safeHex(color)}"></i>${escapeHtml(color)}</span>`;

function statsHtml(theme) {
  const s = themeStats(theme);
  if (s.minDeltaE === null) return '<span>ΔE —</span><span>K —</span>';
  return `<span title="Самый незаметный цвет: меньше ΔE — сильнее слияние с фоном">ΔE мин ${s.minDeltaE.toFixed(1)}</span>`
    + `<span title="Коэффициент маскировки (1 — полное слияние)">K ${s.maxK.toFixed(3)}</span>`;
}

const actionButtons = (id) => `
  <button type="button" class="btn-edit" data-id="${escapeHtml(id)}">✎ Изменить</button>
  <button type="button" class="btn-delete" data-id="${escapeHtml(id)}">✕ Удалить</button>`;

const editButtons = (id) => `
  <button type="button" class="btn-save" data-id="${escapeHtml(id)}">✓ Сохранить</button>
  <button type="button" class="btn-cancel" data-id="${escapeHtml(id)}">Отмена</button>`;

function viewCard(t) {
  return `
  <article class="card" data-id="${escapeHtml(t.id)}">
    <div class="preview" style="background:${safeHex(t.background)}" title="Так выглядят кнопки на этом фоне">${t.allowedColors.map(dot).join('')}</div>
    <div class="card-body">
      <h3>${escapeHtml(t.name)}</h3>
      <div class="stats"><span>фон ${escapeHtml(t.background)}</span>${statsHtml(t)}</div>
      <div class="chips">${t.allowedColors.map(chip).join('')}</div>
    </div>
    <div class="card-actions">${actionButtons(t.id)}</div>
  </article>`;
}

function viewRow(t) {
  const s = themeStats(t);
  return `
  <tr data-id="${escapeHtml(t.id)}">
    <td><span class="mini" style="background:${safeHex(t.background)}">${t.allowedColors.slice(0, 4).map(dot).join('')}</span></td>
    <td>${escapeHtml(t.name)}</td>
    <td>${chip(t.background)}</td>
    <td><div class="chips">${t.allowedColors.map(chip).join('')}</div></td>
    <td>${s.minDeltaE === null ? '—' : s.minDeltaE.toFixed(1)}</td>
    <td>${s.maxK === null ? '—' : s.maxK.toFixed(3)}</td>
    <td><div class="card-actions" style="padding:0">${actionButtons(t.id)}</div></td>
  </tr>`;
}

// Поля формы редактирования: одни и те же и в карточке, и в строке таблицы
function editFields(t) {
  return `
  <div class="edit-grid">
    <div class="field">
      <label>Название</label>
      <input name="name" value="${escapeHtml(t.name)}" maxlength="${LIMITS.nameMax}">
      <span class="error" data-error="name"></span>
    </div>
    <div class="field">
      <label>Базовый цвет фона</label>
      <div class="color-row">
        <input type="color" name="backgroundPicker" value="${safeHex(t.background)}">
        <input name="background" value="${escapeHtml(t.background)}" maxlength="7" spellcheck="false">
      </div>
      <span class="error" data-error="background"></span>
    </div>
    <div class="field wide">
      <label>Разрешённые цвета маскировки</label>
      <div class="color-row">
        <input type="color" name="colorPicker" value="${safeHex(t.background)}">
        <button type="button" class="btn-addcolor">+ Добавить</button>
        <button type="button" class="btn-suggest">Подобрать автоматически</button>
      </div>
      <input name="allowedColors" value="${escapeHtml(t.allowedColors.join(', '))}" spellcheck="false">
      <div class="live" data-live></div>
      <span class="error" data-error="allowedColors"></span>
    </div>
  </div>`;
}

const editCard = (t) => `
  <article class="card editing" data-id="${escapeHtml(t.id)}">
    ${editFields(t)}
    <div class="card-actions">${editButtons(t.id)}</div>
  </article>`;

const editRow = (t) => `
  <tr class="editing" data-id="${escapeHtml(t.id)}">
    <td colspan="7">${editFields(t)}<div class="card-actions">${editButtons(t.id)}</div></td>
  </tr>`;

// ======================================================================
// Отрисовка. Для небольшого числа записей проще перерисовать контейнер целиком.
// ======================================================================

function render() {
  const all = store.list();
  const items = filterThemes(all, { query: state.query, minColors: state.minColors });

  els.counter.textContent = `(${items.length} из ${all.length})`;
  els.empty.hidden = items.length > 0;
  els.cards.hidden = state.view !== 'cards';
  els.tableWrap.hidden = state.view !== 'table';

  if (state.view === 'cards') {
    els.cards.innerHTML = items.map((t) => (t.id === state.editingId ? editCard(t) : viewCard(t))).join('');
  } else {
    els.tbody.innerHTML = items.map((t) => (t.id === state.editingId ? editRow(t) : viewRow(t))).join('');
  }
  document.querySelectorAll('.editing').forEach(refreshLive);

  // Показ сырого содержимого LocalStorage (то же самое видно в DevTools → Application → Local Storage)
  try {
    els.json.textContent = JSON.stringify(JSON.parse(storage.raw() ?? '[]'), null, 2);
  } catch {
    els.json.textContent = String(storage.raw());
  }
  els.banner.hidden = !storage.error;
  els.banner.textContent = storage.error ?? '';
}

// ======================================================================
// Вспомогательные функции форм (работают и с формой создания, и со строкой/карточкой редактирования)
// ======================================================================

// Корень формы: форма создания или карточка/строка редактирования.
// Нельзя искать по [data-id]: этот атрибут есть и у самих кнопок, и closest вернул бы кнопку.
const rootOf = (el) => el.closest('form, .card, tr');

const field = (root, name) => root.querySelector(`[name="${name}"]`);

const readFields = (root) => ({
  name: field(root, 'name').value,
  background: field(root, 'background').value,
  allowedColors: field(root, 'allowedColors').value,
});

function showErrors(root, errors) {
  root.querySelectorAll('[data-error]').forEach((span) => {
    const message = errors[span.dataset.error] ?? '';
    span.textContent = message; // textContent, а не innerHTML: текст ошибок тоже не интерпретируется как HTML
    field(root, span.dataset.error)?.classList.toggle('invalid', Boolean(message));
  });
}

// Живое превью: фон и кружки выбранных цветов обновляются при каждом вводе
function refreshLive(root) {
  const live = root.querySelector('[data-live]');
  if (!live) return;
  const bg = normalizeHex(field(root, 'background').value);
  const colors = splitColorList(field(root, 'allowedColors').value).map(normalizeHex).filter(Boolean);
  live.style.background = bg ?? 'transparent';
  live.innerHTML = colors.map(dot).join('');
}

let toastTimer;
function toast(message, bad = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('bad', bad);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

// ======================================================================
// Действия CRUD
// ======================================================================

function startEdit(id) {
  state.editingId = id;
  render();
  document.querySelector(`[data-id="${CSS.escape(id)}"] [name="name"]`)?.focus();
}

function cancelEdit() {
  state.editingId = null;
  render();
}

function saveEdit(id, root) {
  const result = store.update(id, readFields(root));
  if (!result.ok) {
    if (result.errors._) { // тема исчезла (удалена в другой вкладке)
      state.editingId = null;
      render();
      toast(result.errors._, true);
      return;
    }
    showErrors(root, result.errors);
    toast('Проверьте поля формы', true);
    return;
  }
  state.editingId = null;
  render();
  toast('Тема сохранена');
}

function confirmDelete(id) {
  const theme = store.get(id);
  if (!theme) return;
  if (!window.confirm(`Удалить тему «${theme.name}»?`)) return; // confirm показывает строку как текст
  store.remove(id);
  if (state.editingId === id) state.editingId = null;
  render();
  toast('Тема удалена');
}

function addColor(root) {
  const input = field(root, 'allowedColors');
  const picked = field(root, 'colorPicker').value;
  const list = splitColorList(input.value);
  if (!list.map(normalizeHex).includes(picked)) list.push(picked);
  input.value = list.join(', ');
  refreshLive(root);
  showErrors(root, {});
}

function suggest(root) {
  const bg = normalizeHex(field(root, 'background').value);
  if (!bg) {
    showErrors(root, { background: 'Сначала укажите корректный фон (#rrggbb)' });
    return;
  }
  field(root, 'allowedColors').value = suggestColors(bg, 5).join(', ');
  refreshLive(root);
  showErrors(root, {});
}

// ======================================================================
// События. Делегирование: один обработчик на контейнер вместо обработчиков на каждой кнопке.
// Строки перерисовываются целиком, а обработчик на контейнере остаётся и работает для новых кнопок.
// ======================================================================

function onClick(event) {
  const btn = event.target.closest('button');
  if (!btn) return; // клик не по кнопке
  const id = btn.dataset.id;
  if (btn.classList.contains('btn-edit')) startEdit(id);
  else if (btn.classList.contains('btn-delete')) confirmDelete(id);
  else if (btn.classList.contains('btn-save')) saveEdit(id, rootOf(btn));
  else if (btn.classList.contains('btn-cancel')) cancelEdit();
  else if (btn.classList.contains('btn-addcolor')) addColor(rootOf(btn));
  else if (btn.classList.contains('btn-suggest')) suggest(rootOf(btn));
}

function onInput(event) {
  const root = rootOf(event.target);
  if (!root) return;
  const name = event.target.name;
  if (name === 'backgroundPicker') field(root, 'background').value = event.target.value;
  if (name === 'background') {
    const hex = normalizeHex(event.target.value);
    if (hex) field(root, 'backgroundPicker').value = hex;
  }
  if (['backgroundPicker', 'background', 'allowedColors'].includes(name)) refreshLive(root);
  event.target.classList.remove('invalid');
}

// Enter сохраняет, Esc отменяет редактирование строки
function onKeydown(event) {
  const root = event.target.closest('.editing');
  if (!root || event.target.tagName !== 'INPUT') return;
  if (event.key === 'Enter') { event.preventDefault(); saveEdit(root.dataset.id, root); }
  if (event.key === 'Escape') cancelEdit();
}

for (const container of [els.cards, els.tbody]) {
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('keydown', onKeydown);
}
els.form.addEventListener('click', onClick);
els.form.addEventListener('input', onInput);

// ----- Create -----
els.form.addEventListener('submit', (event) => {
  event.preventDefault(); // страница не перезагружается
  const result = store.create(readFields(els.form));
  if (!result.ok) {
    showErrors(els.form, result.errors);
    toast('Проверьте поля формы', true);
    return;
  }
  els.form.reset(); // очистка формы после успеха
  showErrors(els.form, {});
  refreshLive(els.form);
  render();
  toast(`Тема «${result.theme.name}» создана`);
});

// ----- Фильтры и вид -----
function onFilterChange() {
  state.editingId = null; // перерисовка сбросила бы несохранённые правки, поэтому закрываем редактирование
  render();
}
els.search.addEventListener('input', () => { state.query = els.search.value; onFilterChange(); });
els.slider.addEventListener('input', () => {
  state.minColors = Number(els.slider.value);
  els.sliderOut.textContent = els.slider.value;
  onFilterChange();
});

function setView(view) {
  state.view = view;
  state.editingId = null;
  els.viewCards.classList.toggle('active', view === 'cards');
  els.viewTable.classList.toggle('active', view === 'table');
  els.viewCards.setAttribute('aria-pressed', String(view === 'cards'));
  els.viewTable.setAttribute('aria-pressed', String(view === 'table'));
  render();
}
els.viewCards.addEventListener('click', () => setView('cards'));
els.viewTable.addEventListener('click', () => setView('table'));

$('#btn-samples').addEventListener('click', () => {
  if (!window.confirm('Заменить все темы примерами? Текущие темы будут удалены.')) return;
  store.resetToSamples();
  state.editingId = null;
  render();
  toast('Примеры загружены');
});

// Изменения из другой вкладки: событие storage приходит только в ДРУГИЕ вкладки того же origin
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  store.reload();
  if (!store.get(state.editingId)) state.editingId = null;
  render();
});

// Для защиты и отладки: ThemeAdmin.store.list() в консоли
window.ThemeAdmin = { store, storage };

refreshLive(els.form);
render();
