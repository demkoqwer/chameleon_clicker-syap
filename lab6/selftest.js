// selftest.js — самопроверка частей, не зависящих от браузера: утилиты, валидация, LocalStorage-слой, CRUD-модель.
// Запуск: node selftest.js  (интерфейс проверяют глазами в браузере)
import { escapeHtml, generateId, hexToRgb, normalizeHex, rgbToHex, safeHex, splitColorList, UUID_RE } from './js/utils.js';
import { LIMITS, validateTheme } from './js/validation.js';
import { STORAGE_KEY, ThemeStorage, normalizeTheme } from './js/storage.js';
import { SAMPLE_THEMES, ThemeStore, filterThemes, suggestColors, themeStats } from './js/store.js';
import { deltaE } from './js/core/colorMath.js';
import { MIN_DELTA_E } from './js/core/constants.js';

let passed = 0;
let failed = 0;
const section = (title) => console.log(`\n== ${title} ==`);
function check(name, condition) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}`); }
}

// Заглушка localStorage: хранит только строки, как настоящий
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    data,
  };
}
const good = { name: 'Тест', background: '#2e4a2e', allowedColors: ['#335033', '#3a5a38'] };

// ---------- 1. Утилиты ----------
section('1. Утилиты: escapeHtml, UUID, HEX');
{
  const evil = '<img src=x onerror=alert(1)>';
  const safe = escapeHtml(evil);
  check('escapeHtml экранирует угловые скобки', !safe.includes('<') && !safe.includes('>'));
  check('escapeHtml: результат — «безопасный текст»', safe === '&lt;img src=x onerror=alert(1)&gt;');
  check('escapeHtml экранирует кавычки и &', escapeHtml(`"a" & 'b'`) === '&quot;a&quot; &amp; &#39;b&#39;');
  check('escapeHtml приводит числа к строке', escapeHtml(42) === '42');
  const id = generateId();
  check('generateId даёт UUID v4', UUID_RE.test(id) && id[14] === '4');
  check('generateId: 1000 идентификаторов уникальны', new Set(Array.from({ length: 1000 }, generateId)).size === 1000);
  check('normalizeHex: #ABC → #aabbcc', normalizeHex('#ABC') === '#aabbcc');
  check('normalizeHex: без # и с пробелами', normalizeHex('  336699 ') === '#336699');
  check('normalizeHex отклоняет мусор', normalizeHex('#12345') === null && normalizeHex('red') === null && normalizeHex(5) === null);
  check('hexToRgb / rgbToHex обратимы', rgbToHex(hexToRgb('#1a2b3c')) === '#1a2b3c');
  check('rgbToHex ограничивает диапазон 0..255', rgbToHex([300, -5, 12.4]) === '#ff000c');
  check('safeHex заменяет подделку на чёрный', safeHex('red;background:url(x)') === '#000000');
  check('splitColorList делит по запятым, пробелам, ;', splitColorList('#a, #b;#c  #d').length === 4);
}

// ---------- 2. Валидация ----------
section('2. Валидация темы');
{
  check('корректная тема проходит', validateTheme(good).valid);
  check('возвращается очищенное значение', validateTheme({ ...good, name: '  Тест   тема ' }).value.name === 'Тест тема');
  check('пустое название — ошибка', 'name' in validateTheme({ ...good, name: '   ' }).errors);
  check('слишком короткое название', 'name' in validateTheme({ ...good, name: 'a' }).errors);
  check(`название длиннее ${LIMITS.nameMax} символов`, 'name' in validateTheme({ ...good, name: 'x'.repeat(41) }).errors);
  check('некорректный фон', 'background' in validateTheme({ ...good, background: '#12' }).errors);
  check('пустой массив цветов', 'allowedColors' in validateTheme({ ...good, allowedColors: [] }).errors);
  check('некорректный цвет в списке', /Некорректный/.test(validateTheme({ ...good, allowedColors: ['#335033', 'zzz'] }).errors.allowedColors));
  check('повторяющиеся цвета', /повторяться/.test(validateTheme({ ...good, allowedColors: ['#335033', '#335033'] }).errors.allowedColors));
  check('повтор с другим регистром тоже ловится', 'allowedColors' in validateTheme({ ...good, allowedColors: ['#ABCDEF', '#abcdef'] }).errors);
  check(`больше ${LIMITS.colorsMax} цветов`, 'allowedColors' in validateTheme({ ...good, allowedColors: Array.from({ length: 13 }, (_, i) => `#${(i * 16 + 100).toString(16).padStart(2, '0')}0000`) }).errors);
  const same = validateTheme({ ...good, allowedColors: [good.background] });
  check('цвет, совпавший с фоном (ΔE < порога), отклоняется', /невидима/.test(same.errors.allowedColors));
  check('цвета можно передать строкой через запятую', validateTheme({ ...good, allowedColors: '#335033, #3a5a38' }).valid);
  check('уникальность названия без учёта регистра', 'name' in validateTheme({ ...good, name: 'ЛЕС' }, { existing: [{ id: '1', name: 'лес' }] }).errors);
  check('при редактировании своё же название допустимо', validateTheme({ ...good, name: 'Лес' }, { existing: [{ id: '1', name: 'Лес' }], selfId: '1' }).valid);
  check('несколько ошибок возвращаются сразу', Object.keys(validateTheme({ name: '', background: 'x', allowedColors: [] }).errors).length === 3);
}

// ---------- 3. LocalStorage-слой ----------
section('3. LocalStorage: сохранение, чтение, защита от мусора');
{
  const backend = fakeStorage();
  const st = new ThemeStorage(backend);
  check('на старте записи под ключом нет', st.hasData() === false);
  st.save([{ id: 'a', name: 'А', background: '#112233', allowedColors: ['#223344'], createdAt: '2026-01-01T00:00:00.000Z' }]);
  check('в localStorage лежит строка JSON под фиксированным ключом', typeof backend.data.get(STORAGE_KEY) === 'string' && STORAGE_KEY === 'chameleon_themes');
  check('чтение возвращает те же данные', st.load()[0].name === 'А' && st.load()[0].allowedColors[0] === '#223344');
  check('пустой массив «[]» считается данными (не пересоздаются примеры)', (st.save([]), st.hasData() && st.load().length === 0));

  const broken = new ThemeStorage(fakeStorage({ [STORAGE_KEY]: '{не json' }));
  check('битый JSON не роняет страницу', broken.load().length === 0 && /повреждены/.test(broken.error));
  const notArray = new ThemeStorage(fakeStorage({ [STORAGE_KEY]: '{"a":1}' }));
  check('JSON не массив — пустой список и сообщение', notArray.load().length === 0 && notArray.error !== null);
  check('запись без имени или с плохим фоном отбрасывается', normalizeTheme({ name: '', background: '#112233' }) === null && normalizeTheme({ name: 'x', background: 'red' }) === null);
  const migrated = normalizeTheme({ name: 'Старая', background: '#112233', allowedColors: ['#ABCDEF', 'мусор', '#abcdef'] });
  check('миграция: нет id/даты — выдаются; цвета очищаются от мусора и повторов', UUID_RE.test(migrated.id) && !Number.isNaN(Date.parse(migrated.createdAt)) && migrated.allowedColors.length === 1);

  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const fallback = new ThemeStorage(denied);
  fallback.save([{ x: 1 }]);
  check('localStorage недоступен — работаем в памяти и предупреждаем', !fallback.persistent && fallback.raw() === '[{"x":1}]' && fallback.error !== null);
}

// ---------- 4. CRUD-модель ----------
section('4. CRUD: Create / Read / Update / Delete + мгновенное сохранение');
{
  const backend = fakeStorage();
  const store = new ThemeStore(new ThemeStorage(backend));
  check('первый запуск: созданы примеры', store.list().length === SAMPLE_THEMES.length);
  check('все примеры проходят валидацию', SAMPLE_THEMES.every((t) => validateTheme(t).valid));
  const saved = () => JSON.parse(backend.data.get(STORAGE_KEY));

  const created = store.create(good);
  check('Create: тема добавлена с UUID и датой', created.ok && UUID_RE.test(created.theme.id) && created.theme.createdAt.length > 10);
  check('Create: сразу записано в localStorage', saved().some((t) => t.id === created.theme.id));
  const bad = store.create({ ...good, name: 'Другая', allowedColors: ['nope'] });
  check('Create: невалидная тема не добавляется и не сохраняется', !bad.ok && saved().length === store.list().length && !saved().some((t) => t.name === 'Другая'));
  check('Create: дубль названия отклонён', !store.create(good).ok);

  const id = created.theme.id;
  const upd = store.update(id, { ...good, name: 'Новое имя' });
  check('Update: имя изменено и сохранено', upd.ok && saved().find((t) => t.id === id).name === 'Новое имя');
  check('Update: id и дата создания не меняются', store.get(id).id === id && store.get(id).createdAt === created.theme.createdAt);
  check('Update: невалидные данные не портят запись', !store.update(id, { ...good, background: 'x' }).ok && store.get(id).background === good.background);
  check('Update: несуществующий id — ошибка', !store.update('нет-такого', good).ok);

  const before = store.list().length;
  check('Delete: возвращает true и убирает тему', store.remove(id) === true && store.list().length === before - 1);
  check('Delete: изменение сохранено', !saved().some((t) => t.id === id));
  check('Delete: повторное удаление — false', store.remove(id) === false);

  // «Перезагрузка страницы»: новый ThemeStore над теми же данными
  const reopened = new ThemeStore(new ThemeStorage(backend));
  check('после «перезагрузки» данные на месте', reopened.list().length === store.list().length && reopened.list()[0].name === store.list()[0].name);
  store.resetToSamples();
  check('resetToSamples возвращает примеры', store.list().length === SAMPLE_THEMES.length && saved().length === SAMPLE_THEMES.length);
}

// ---------- 5. Фильтр и оценка маскировки ----------
section('5. Фильтр, статистика маскировки, подбор цветов');
{
  const items = SAMPLE_THEMES.map((t, i) => ({ id: String(i), createdAt: '', ...t }));
  check('фильтр по умолчанию пропускает всё', filterThemes(items).length === items.length);
  check('поиск по названию без учёта регистра', filterThemes(items, { query: 'ЛЕС' }).length === 1);
  check('поиск по HEX-цвету', filterThemes(items, { query: '#12304a' }).length === 1);
  check('ползунок «цветов ≥ 4» оставляет только подходящие', filterThemes(items, { minColors: 4 }).every((t) => t.allowedColors.length >= 4) && filterThemes(items, { minColors: 4 }).length === 1);
  check('ползунок выше максимума — пусто', filterThemes(items, { minColors: 12 }).length === 0);
  check('поиск и ползунок работают вместе', filterThemes(items, { query: 'пустыня', minColors: 4 }).length === 0);
  const s = themeStats(items[0]);
  check('themeStats: ΔE мин ≥ порога, K в диапазоне (0, 1)', s.minDeltaE >= MIN_DELTA_E && s.maxK > 0 && s.maxK < 1);
  check('themeStats без цветов не падает', themeStats({ background: '#000000', allowedColors: [] }).minDeltaE === null);
  const suggested = suggestColors('#2e4a2e', 5);
  check('suggestColors: 5 разных цветов', suggested.length === 5 && new Set(suggested).size === 5);
  check('suggestColors: каждый цвет различим на фоне (ΔE ≥ порога)', suggested.every((c) => deltaE(hexToRgb('#2e4a2e'), hexToRgb(c)) >= MIN_DELTA_E));
  check('подобранные цвета проходят валидацию', validateTheme({ name: 'Авто', background: '#2e4a2e', allowedColors: suggested }).valid);
}

console.log(`\nИтого: ${passed + failed} проверок, пройдено ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
