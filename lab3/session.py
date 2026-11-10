"""Stateless JSON-сессии: один файл sessions/<user_id>.json на пользователя.

Бот не хранит состояние пользователей в глобальной памяти: перед каждым действием
сессия читается с диска, после - записывается обратно. Поэтому пользователи изолированы,
а после перезапуска бота ничего не теряется.
"""
import json
import logging
import os

import config

logger = logging.getLogger("bot.session")


def create_new_session(user_id):
    """Сессия нового пользователя."""
    return {
        "state": "MENU",           # режим диалога (дублирует FSM, переживает перезапуск)
        "name": None,              # имя игрока в игре
        "pending": None,           # что показать после ввода имени ("stats"/"achievements")
        "subscribed": False,       # подписка на уведомления (/watch)
        "screen_message_id": None, # id сообщения-экрана, которое бот редактирует
        "screen_chat_id": None,    # чат этого сообщения
    }


def _path(user_id):
    # int() защищает от подстановки в имя файла чего-то кроме числа (../ и т.п.)
    return config.SESSION_DIR / f"{int(user_id)}.json"


def load_session(user_id):
    """Читает сессию. Нет файла или он повреждён -> создаётся новая сессия."""
    session = create_new_session(user_id)
    try:
        with open(_path(user_id), "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            session.update(data)
        else:
            logger.warning("Сессия %s имеет неверный формат, создана новая", user_id)
    except FileNotFoundError:
        pass
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        logger.warning("Сессия %s повреждена (%s), создана новая", user_id, e)
    return session


def save_session(user_id, data):
    """Атомарно записывает сессию (через временный файл)."""
    path = _path(user_id)
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except OSError as e:
        logger.error("Не удалось сохранить сессию %s: %s", user_id, e)


def all_sessions():
    """Все сессии: список пар (user_id, session). Нужен для рассылок и уведомлений."""
    result = []
    for path in config.SESSION_DIR.glob("*.json"):
        if path.stem.isdigit():
            result.append((int(path.stem), load_session(int(path.stem))))
    return result
