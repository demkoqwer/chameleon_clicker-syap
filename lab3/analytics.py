"""Аналитика выгрузки игры: разбор CSV, верификация, рейтинг, статистика, ачивки.

Модуль не зависит от aiogram: его можно тестировать отдельно (см. test_analytics.py).
Формат данных - clicker_profiles.csv из игры: Имя, Уровень, Очки, Множитель, Дата.
"""
import csv
import html
import io
import json
import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import config

logger = logging.getLogger("bot.analytics")


@dataclass(frozen=True)
class Record:
    name: str
    level: int
    score: int
    multiplier: int
    date: str  # "ГГГГ-ММ-ДД ЧЧ:ММ"

    @property
    def key(self):
        return self.name.casefold()


@dataclass(frozen=True)
class Achievement:
    code: str
    title: str
    description: str
    unlocked: bool


# ====================== Верификация ======================

def verify_record(r):
    """Проверка записи на непротиворечивость. Возвращает список проблем (пустой - всё хорошо)."""
    issues = []
    if not r.name:
        issues.append("пустое имя игрока")
    elif len(r.name) > config.MAX_NAME_LENGTH:
        issues.append(f"имя длиннее {config.MAX_NAME_LENGTH} символов")
    if not 1 <= r.level <= config.MAX_LEVEL:
        issues.append(f"уровень вне диапазона 1..{config.MAX_LEVEL}")
    if not 1 <= r.multiplier <= config.MAX_MULTIPLIER:
        issues.append(f"множитель вне диапазона 1..{config.MAX_MULTIPLIER}")
    if r.score < 0:
        issues.append("отрицательные очки")
    elif 1 <= r.level <= config.MAX_LEVEL:
        # Чтобы дойти до уровня L, нужно минимум 5 попаданий на каждом из предыдущих уровней
        # (по 10*уровень очков), а максимум - те же попадания с множителем x5.
        low = 25 * r.level * (r.level - 1)
        high = 125 * r.level * (r.level + 1)
        if r.score < low:
            issues.append(f"очки слишком малы для уровня {r.level} (минимум {low})")
        elif r.score > high:
            issues.append(f"очки слишком велики для уровня {r.level} (максимум {high})")
    try:
        played = datetime.strptime(r.date, config.DATE_FORMAT)
        if played > datetime.now() + timedelta(days=1):
            issues.append("дата в будущем")
    except ValueError:
        issues.append(f"дата не в формате {config.DATE_FORMAT}")
    return issues


# ====================== Разбор CSV ======================

def parse_profiles_text(text):
    """Разбирает текст CSV. Возвращает (записи, ошибки). Битые строки не ломают разбор."""
    records, errors = [], []
    rows = [row for row in csv.reader(io.StringIO(text)) if any(c.strip() for c in row)]
    if not rows:
        return [], ["файл пустой"]
    header = [c.strip().casefold() for c in rows[0]]
    if header != [f.casefold() for f in config.CSV_FIELDS]:
        return [], [f"неверный заголовок, ожидается: {','.join(config.CSV_FIELDS)}"]
    if len(rows) - 1 > config.MAX_UPLOAD_ROWS:
        return [], [f"слишком много строк (максимум {config.MAX_UPLOAD_ROWS})"]
    for line_no, row in enumerate(rows[1:], start=2):
        if len(row) != len(config.CSV_FIELDS):
            errors.append(f"Строка {line_no}: ожидается {len(config.CSV_FIELDS)} полей")
            continue
        name, level, score, mult, played = (c.strip() for c in row)
        try:
            record = Record(name, int(level), int(score), int(mult), played)
        except ValueError:
            errors.append(f"Строка {line_no}: нечисловые значения")
            continue
        issues = verify_record(record)
        if issues:
            errors.append(f"Строка {line_no} ({name or '?'}): {'; '.join(issues)}")
        else:
            records.append(record)
    return records, errors


def _read_file(path):
    """Читает CSV-файл с диска. Нет файла или ошибка чтения -> пустой список."""
    try:
        with open(path, "r", newline="", encoding="utf-8-sig") as f:
            text = f.read()
    except FileNotFoundError:
        return []
    except (OSError, UnicodeDecodeError) as e:
        logger.error("Не удалось прочитать %s: %s", path, e)
        return []
    records, errors = parse_profiles_text(text)
    for err in errors:
        logger.warning("%s: %s", path.name, err)
    return records


def merge_records(*record_lists):
    """Объединяет списки. Для одного имени остаётся запись с более поздней датой."""
    merged = {}
    for records in record_lists:
        for r in records:
            old = merged.get(r.key)
            if old is None or r.date >= old.date:
                merged[r.key] = r
    return list(merged.values())


def load_all():
    """Все известные боту записи: выгрузка игры + база загруженных файлов."""
    return merge_records(_read_file(config.GAME_CSV), _read_file(config.DB_FILE))


def file_mtime(path):
    """Время изменения файла (None, если файла нет)."""
    try:
        return os.stat(path).st_mtime
    except OSError:
        return None


def append_records(records):
    """Дописывает проверенные записи в общую базу (profiles_db.csv).

    Возвращает (добавлено, обновлено, список изменённых записей).
    Игрок с тем же именем обновляется, если дата загруженной записи не старше.
    """
    db = {r.key: r for r in _read_file(config.DB_FILE)}
    added = updated = 0
    changed = []
    for r in records:
        old = db.get(r.key)
        if old is None:
            db[r.key] = r
            added += 1
            changed.append(r)
        elif r.date >= old.date and r != old:
            db[r.key] = r
            updated += 1
            changed.append(r)
    tmp = config.DB_FILE.with_name(config.DB_FILE.name + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(config.CSV_FIELDS)
        for r in db.values():
            writer.writerow([r.name, r.level, r.score, r.multiplier, r.date])
    os.replace(tmp, config.DB_FILE)  # атомарная подмена: старая база не теряется при сбое
    return added, updated, changed


def diff_records(old_by_key, new_records):
    """Новые игроки и улучшенные результаты (для уведомлений /watch)."""
    return [r for r in new_records
            if r.key not in old_by_key or r.score > old_by_key[r.key].score]


# ====================== Рейтинг ======================

def leaderboard(records, limit=None):
    """Рейтинг по очкам; при равенстве - по уровню, затем по множителю."""
    ordered = sorted(records, key=lambda r: (-r.score, -r.level, -r.multiplier, r.name.casefold()))
    return ordered[:limit] if limit else ordered


def format_leaderboard(records, highlight=None):
    """Таблица лидеров для Telegram: моноширинный текст в <pre>."""
    rows = leaderboard(records, config.TOP_LIMIT)
    if not rows:
        return "Пока нет данных. Загрузите CSV-файл игры."
    lines = [f"{'#':<2} {'Имя':<12} {'Очки':>6} {'Ур.':>3} {'x':>2}"]
    for i, r in enumerate(rows, start=1):
        mark = "*" if highlight and r.key == highlight.casefold() else " "
        lines.append(f"{i:<2}{mark}{r.name[:12]:<12} {r.score:>6} {r.level:>3} {r.multiplier:>2}")
    return "<pre>" + html.escape("\n".join(lines)) + "</pre>"


def find_player(records, name):
    for r in records:
        if r.key == name.casefold():
            return r
    return None


def rank_of(records, name):
    """Место игрока в рейтинге (1 - лучший) или None."""
    for i, r in enumerate(leaderboard(records), start=1):
        if r.key == name.casefold():
            return i
    return None


# ====================== Дни игры и стрик ======================
# В CSV игры хранится только дата последней игры, поэтому бот запоминает
# каждый день, который встретил в данных, и по ним считает серию дней подряд.

def _load_days():
    try:
        with open(config.DAYS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        logger.warning("Файл дней игры повреждён (%s), начат заново", e)
        return {}


def sync_days(records):
    """Запоминает дни игры из записей."""
    days = _load_days()
    for r in records:
        known = set(days.get(r.key, []))
        known.add(r.date[:10])
        days[r.key] = sorted(known)
    tmp = config.DAYS_FILE.with_name(config.DAYS_FILE.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(days, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config.DAYS_FILE)


def streak_days(name, today=None):
    """Серия дней подряд, оканчивающаяся последним известным днём игры.

    Возвращает (длина серии, активна ли серия: последний день - сегодня или вчера).
    """
    today = today or date.today()
    try:
        days = sorted({date.fromisoformat(d) for d in _load_days().get(name.casefold(), [])})
    except ValueError:
        return 0, False
    if not days:
        return 0, False
    streak = 1
    for prev, cur in zip(reversed(days[:-1]), reversed(days)):
        if (cur - prev).days == 1:
            streak += 1
        else:
            break
    return streak, (today - days[-1]).days <= 1


# ====================== Статистика и ачивки ======================

def format_stats(records, name):
    r = find_player(records, name)
    if r is None:
        return None
    place = rank_of(records, name)
    streak, active = streak_days(name)
    streak_text = f"{streak} дн." + (" (серия активна)" if active and streak else "")
    return (
        f"<b>Статистика игрока {html.escape(r.name)}</b>\n\n"
        f"Место в рейтинге: {place} из {len(records)}\n"
        f"Уровень: {r.level}\n"
        f"Очки: {r.score}\n"
        f"Множитель клика: x{r.multiplier}\n"
        f"Последняя игра: {html.escape(r.date)}\n"
        f"Стрик: {streak_text}"
    )


def achievements(r, streak):
    """Ачивки игрока по его записи и серии дней."""
    return [
        Achievement("first", "Новичок", "Сыграть хотя бы одну игру", True),
        Achievement("eye", "Меткий глаз", "Множитель x3 и выше", r.multiplier >= 3),
        Achievement("combo", "Комбо-мастер", f"Максимальный множитель x{config.MAX_MULTIPLIER}",
                    r.multiplier >= config.MAX_MULTIPLIER),
        Achievement("evolution", "Эволюция", "Дойти до 5 уровня", r.level >= 5),
        Achievement("master", "Хамелеон", f"Дойти до {config.MAX_LEVEL} уровня", r.level >= config.MAX_LEVEL),
        Achievement("thousand", "Тысячник", "Набрать 1000 очков", r.score >= 1000),
        Achievement("regular", "Постоянный игрок", "Играть 3 дня подряд", streak >= 3),
    ]


def format_achievements(records, name):
    r = find_player(records, name)
    if r is None:
        return None
    streak, _ = streak_days(name)
    items = achievements(r, streak)
    done = sum(a.unlocked for a in items)
    lines = [f"<b>Ачивки игрока {html.escape(r.name)}</b> ({done}/{len(items)})\n"]
    for a in items:
        lines.append(f"{'✅' if a.unlocked else '🔒'} <b>{a.title}</b> - {a.description}")
    return "\n".join(lines)
