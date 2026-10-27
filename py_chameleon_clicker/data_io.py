"""Работа с файлами: настройки (JSON), лог событий (logging), профили игроков (CSV).

Модуль не зависит от pygame, поэтому его можно тестировать отдельно.
"""
import csv
import json
import logging
import os
from datetime import datetime

from py_chameleon_clicker.constants import (
    CONFIG_FILE,
    CSV_FIELDS,
    DEFAULT_CONFIG,
    LOG_FILE,
    PROFILES_FILE,
)

# Допустимые типы и диапазоны значений для каждого параметра JSON-файла.
# (тип, минимум, максимум). Тип float принимает и целые числа.
CONFIG_LIMITS = {
    "start_lives": (int, 1, 10),
    "hits_per_level": (int, 1, 50),
    "max_level": (int, 1, 50),
    "button_start_radius": (int, 10, 200),
    "button_min_radius": (int, 2, 50),
    "button_shrink_factor": (float, 0.5, 0.99),
    "button_start_speed": (float, 0.0, 20.0),
    "button_speed_step": (float, 0.0, 5.0),
    "color_diff_start": (int, 0, 255),
    "color_diff_min": (int, 0, 255),
    "color_diff_step": (int, 0, 255),
    "points_per_hit": (int, 1, 1000),
    "combo_step": (int, 1, 50),
    "max_multiplier": (int, 1, 20),
}


# ====================== Логирование ======================

def setup_logging():
    """Настраивает запись событий в game.log: время | уровень | сообщение."""
    try:
        logging.basicConfig(
            filename=LOG_FILE,
            level=logging.INFO,
            format="%(asctime)s | %(levelname)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            encoding="utf-8",
            force=True,  # переопределяем настройки, если они уже были заданы
        )
    except OSError as e:
        # Нет прав на запись - игра должна работать и без лога
        print(f"Не удалось открыть лог-файл: {e}")


def log_event(message, level=logging.INFO):
    """Записывает событие в лог."""
    logging.log(level, message)


def _report(message):
    """Сообщение об ошибке данных: в консоль и в лог (предупреждение)."""
    print(message)
    logging.warning(message)


# ====================== Настройки (JSON) ======================

def _is_valid(key, value):
    """Проверка значения параметра по таблице CONFIG_LIMITS."""
    expected, low, high = CONFIG_LIMITS[key]
    if isinstance(value, bool):  # True/False в Python - это тоже int, исключаем
        return False
    if expected is int and not isinstance(value, int):
        return False
    if expected is float and not isinstance(value, (int, float)):
        return False
    return low <= value <= high


def load_config():
    """Загружает настройки из clicker_config.json.

    Обработка ошибок:
      - файла нет (FileNotFoundError)    -> значения по умолчанию;
      - файл повреждён (JSONDecodeError) -> значения по умолчанию;
      - неверный параметр                -> по умолчанию только для него.
    """
    config = dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        _report(f"Файл {CONFIG_FILE.name} не найден. Используются настройки по умолчанию.")
        return config
    except json.JSONDecodeError as e:
        _report(f"Повреждён формат JSON в {CONFIG_FILE.name}: {e}. Настройки по умолчанию.")
        return config
    except (OSError, UnicodeDecodeError) as e:
        _report(f"Не удалось прочитать {CONFIG_FILE.name}: {e}. Настройки по умолчанию.")
        return config

    if not isinstance(raw, dict):
        _report(f"{CONFIG_FILE.name}: корневой элемент должен быть объектом. Настройки по умолчанию.")
        return config

    # Валидация каждого параметра отдельно
    for key, value in raw.items():
        if key not in CONFIG_LIMITS:
            _report(f"Неизвестный параметр «{key}» проигнорирован.")
        elif _is_valid(key, value):
            config[key] = value
        else:
            _report(f"Параметр «{key}» = {value!r} недопустим, оставлено {config[key]!r}.")

    # Проверка согласованности параметров между собой
    if config["button_min_radius"] >= config["button_start_radius"]:
        _report("button_min_radius должен быть меньше button_start_radius. Сброс радиусов.")
        config["button_min_radius"] = DEFAULT_CONFIG["button_min_radius"]
        config["button_start_radius"] = DEFAULT_CONFIG["button_start_radius"]
    if config["color_diff_min"] > config["color_diff_start"]:
        _report("color_diff_min больше color_diff_start. Сброс параметров цвета.")
        config["color_diff_min"] = DEFAULT_CONFIG["color_diff_min"]
        config["color_diff_start"] = DEFAULT_CONFIG["color_diff_start"]

    log_event(f"Настройки загружены из {CONFIG_FILE.name}")
    return config


# ====================== Профили игроков (CSV) ======================

def load_profiles():
    """Читает все профили из CSV. Повреждённые строки пропускает.

    Возвращает список словарей: {"Имя", "Уровень", "Очки", "Множитель", "Дата"}.
    """
    profiles = []
    try:
        # utf-8-sig: понимает файл как с BOM (после Excel), так и без него
        with open(PROFILES_FILE, "r", newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                try:
                    profiles.append({
                        "Имя": row["Имя"].strip(),
                        "Уровень": int(row["Уровень"]),
                        "Очки": int(row["Очки"]),
                        "Множитель": int(row["Множитель"]),
                        "Дата": row["Дата"],
                    })
                except (KeyError, ValueError, AttributeError, TypeError):
                    log_event(f"Пропущена повреждённая строка CSV: {row}", logging.WARNING)
    except FileNotFoundError:
        pass  # первый запуск: файла ещё нет, это нормально
    except (OSError, UnicodeDecodeError, csv.Error) as e:
        _report(f"Не удалось прочитать {PROFILES_FILE.name}: {e}")
    return profiles


def get_top(count=3):
    """Топ игроков по очкам (по умолчанию 3 - для стартового экрана)."""
    profiles = load_profiles()
    profiles.sort(key=lambda p: p["Очки"], reverse=True)
    return profiles[:count]


def save_profile(name, level, score, multiplier):
    """Сохраняет прогресс игрока в CSV.

    Если игрок с таким именем уже есть - его строка обновляется,
    иначе добавляется новая. Файл с заголовками создаётся при первом запуске.
    Возвращает "created", "updated" или None при ошибке записи.
    """
    row = {
        "Имя": name,
        "Уровень": level,
        "Очки": score,
        "Множитель": multiplier,
        "Дата": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    profiles = load_profiles()
    result = "created"
    for i, profile in enumerate(profiles):
        if profile["Имя"].casefold() == name.casefold():
            profiles[i] = row
            result = "updated"
            break
    else:
        profiles.append(row)

    # Запись через временный файл: если программа упадёт во время записи,
    # старый CSV останется целым. os.replace подменяет файл атомарно.
    tmp_path = PROFILES_FILE.with_name(PROFILES_FILE.name + ".tmp")
    try:
        with open(tmp_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(profiles)
        os.replace(tmp_path, PROFILES_FILE)
    except OSError as e:
        # Например, файл открыт в Excel или нет прав на запись
        logging.error(f"Не удалось сохранить профиль: {e}")
        print(f"Не удалось сохранить профиль: {e}")
        return None
    log_event(f"Профиль «{name}» {'обновлён' if result == 'updated' else 'создан'}: "
              f"уровень {level}, очки {score}, множитель x{multiplier}")
    return result
