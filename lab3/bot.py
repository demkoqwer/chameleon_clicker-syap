"""Telegram-бот «Кликер-Эволюционер» - сервис-аналитик для игры «Эволюционный Кликер».

Бот НЕ копия игры: игровая логика остаётся в Pygame-приложении (ЛР 1-2).
Бот анализирует данные, которые игра выгружает: clicker_profiles.csv.

Запуск:  python bot.py   (из папки lab3, после создания .env с токеном)
"""
import asyncio
import html
import io
import logging

from aiogram import BaseMiddleware, Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramServerError,
)
from aiogram.filters import Command, CommandObject, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import CallbackQuery, ErrorEvent, Message

import analytics
import config
import keyboards
import session

logger = logging.getLogger("bot")

config.require_token()
bot = Bot(token=config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher(storage=MemoryStorage())
# Бот работает только в личных сообщениях и только с сообщениями, у которых есть отправитель
dp.message.filter(F.chat.type == "private", F.from_user)
dp.callback_query.filter(F.message.chat.type == "private")


# ====================== FSM ======================

class BotState(StatesGroup):
    """Режимы диалога: что бот сейчас ждёт от пользователя."""
    MENU = State()        # свободный выбор в меню
    UPLOAD = State()      # ждём CSV-файл
    WAIT_NAME = State()   # ждём имя игрока
    BROADCAST = State()   # админ вводит текст рассылки


MODES = {"MENU": BotState.MENU, "UPLOAD": BotState.UPLOAD,
         "WAIT_NAME": BotState.WAIT_NAME, "BROADCAST": BotState.BROADCAST}


async def set_mode(state: FSMContext, user_id: int, mode: str):
    """Меняет режим одновременно в FSM и в JSON-сессии (чтобы он пережил перезапуск)."""
    data = session.load_session(user_id)
    data["state"] = mode
    session.save_session(user_id, data)
    await state.set_state(MODES[mode])


class RestoreStateMiddleware(BaseMiddleware):
    """После перезапуска бота FSM-память пуста: восстанавливаем режим из JSON-сессии."""

    async def __call__(self, handler, event, data):
        user = getattr(event, "from_user", None)
        state = data.get("state")
        if user and state is not None and await state.get_state() is None:
            mode = session.load_session(user.id).get("state", "MENU")
            await state.set_state(MODES.get(mode, BotState.MENU))
            data["raw_state"] = await state.get_state()  # его читает StateFilter
        return await handler(event, data)


dp.message.outer_middleware(RestoreStateMiddleware())
dp.callback_query.outer_middleware(RestoreStateMiddleware())


# ====================== Экраны (антифлуд через edit_text) ======================

async def show_screen(chat_id, user_id, text, keyboard):
    """Одно сообщение-экран на пользователя: редактируем его вместо отправки нового."""
    data = session.load_session(user_id)
    screen_id = data.get("screen_message_id")
    if screen_id and data.get("screen_chat_id") == chat_id:
        try:
            await bot.edit_message_text(text=text, chat_id=chat_id,
                                        message_id=screen_id, reply_markup=keyboard)
            return
        except TelegramBadRequest as e:
            if "message is not modified" in str(e):
                return  # текст тот же - это нормально
            logger.info("Экран %s недоступен (%s), отправляем новый", screen_id, e)
        except (TelegramNetworkError, TelegramServerError) as e:
            logger.warning("Сбой сети при правке экрана: %s", e)
    try:
        msg = await bot.send_message(chat_id, text, reply_markup=keyboard)
    except (TelegramNetworkError, TelegramServerError):
        msg = await bot.send_message(chat_id, text, reply_markup=keyboard)  # одна повторная попытка
    data = session.load_session(user_id)
    data["screen_message_id"] = msg.message_id
    data["screen_chat_id"] = chat_id
    session.save_session(user_id, data)


async def try_delete(message: Message):
    """Удаляет сообщение пользователя (команду), чтобы чат оставался чистым."""
    try:
        await message.delete()
    except Exception:
        pass


async def safe_answer(callback: CallbackQuery, text=None):
    """callback.answer() обязателен; просроченный запрос не должен ронять обработчик."""
    try:
        await callback.answer(text)
    except TelegramBadRequest as e:
        logger.info("callback.answer не выполнен: %s", e)


async def show_menu(chat_id, user_id, state, note=""):
    await set_mode(state, user_id, "MENU")
    data = session.load_session(user_id)
    name = html.escape(data["name"]) if data.get("name") else "не задано"
    text = (f"<b>Кликер-Эволюционер</b>\nАналитика игры «Эволюционный Кликер».\n\n"
            f"Имя игрока: {name}\n{note}")
    await show_screen(chat_id, user_id, text, keyboards.menu_keyboard(data["subscribed"]))


async def screen_top(chat_id, user_id):
    records = await asyncio.to_thread(analytics.load_all)  # файловый ввод-вывод не блокирует цикл
    name = session.load_session(user_id).get("name")
    text = "<b>🏆 Топ игроков по очкам</b>\n\n" + analytics.format_leaderboard(records, name)
    await show_screen(chat_id, user_id, text, keyboards.top_keyboard())


async def ask_name(chat_id, user_id, state, pending):
    data = session.load_session(user_id)
    data["pending"] = pending
    session.save_session(user_id, data)
    await set_mode(state, user_id, "WAIT_NAME")
    await show_screen(chat_id, user_id,
                      "Введите имя игрока так, как вы вводили его в игре (до "
                      f"{config.MAX_NAME_LENGTH} символов).", keyboards.cancel_keyboard())


async def screen_player(chat_id, user_id, state, kind):
    """Личная статистика (kind="stats") или ачивки (kind="achievements")."""
    name = session.load_session(user_id).get("name")
    if not name:
        await ask_name(chat_id, user_id, state, kind)
        return
    records = await asyncio.to_thread(analytics.load_all)
    if kind == "stats":
        text = analytics.format_stats(records, name)
    else:
        text = analytics.format_achievements(records, name)
    if text is None:
        text = (f"Игрок «{html.escape(name)}» не найден в данных.\n"
                "Проверьте имя или загрузите CSV-файл игры.")
    await show_screen(chat_id, user_id, text, keyboards.player_keyboard())


async def screen_upload(chat_id, user_id, state):
    await set_mode(state, user_id, "UPLOAD")
    text = ("Пришлите файл <b>clicker_profiles.csv</b> (до "
            f"{config.MAX_UPLOAD_BYTES // 1000} КБ).\nСтроки проверяются, ошибочные отклоняются.")
    await show_screen(chat_id, user_id, text, keyboards.cancel_keyboard())


async def toggle_watch(chat_id, user_id, state):
    data = session.load_session(user_id)
    data["subscribed"] = not data["subscribed"]
    session.save_session(user_id, data)
    logger.info("Пользователь %s: подписка %s", user_id, data["subscribed"])
    note = "🔔 Уведомления включены." if data["subscribed"] else "🔕 Уведомления выключены."
    await show_menu(chat_id, user_id, state, note)


async def notify_subscribers(text, exclude=None):
    """Рассылка подписчикам. Список подписчиков бот берёт из файлов сессий."""
    sent = 0
    for uid, data in await asyncio.to_thread(session.all_sessions):
        if not data.get("subscribed") or uid == exclude:
            continue
        try:
            await bot.send_message(uid, text)
            sent += 1
        except TelegramForbiddenError:
            logger.info("Пользователь %s заблокировал бота", uid)
        except Exception as e:
            logger.warning("Не удалось отправить %s: %s", uid, e)
        await asyncio.sleep(0.05)  # не превышаем лимит Telegram (~30 сообщений/с)
    return sent


def format_changes(records):
    lines = [f"• {html.escape(r.name)} - {r.score} оч., ур. {r.level}, x{r.multiplier}"
             for r in records[:10]]
    return "🔔 <b>Новые результаты</b>\n" + "\n".join(lines)


# ====================== Команды (без StateFilter - работают из любого режима) ======================

@dp.message(Command("start", "menu", "cancel"))
async def cmd_start(message: Message, state: FSMContext):
    logger.info("Команда %s от %s", message.text, message.from_user.id)
    await show_menu(message.chat.id, message.from_user.id, state)
    await try_delete(message)


@dp.message(Command("help"))
async def cmd_help(message: Message, state: FSMContext):
    text = ("<b>Команды</b>\n/top - рейтинг по очкам\n/stats - уровень, множитель, стрик\n"
            "/achievements - награды\n/upload - загрузить CSV игры\n"
            "/watch - уведомления о новых результатах\n/menu - главное меню\n"
            "/cancel - отмена текущего действия")
    await show_screen(message.chat.id, message.from_user.id, text, keyboards.back_keyboard())
    await try_delete(message)


@dp.message(Command("top"))
async def cmd_top(message: Message, state: FSMContext):
    await set_mode(state, message.from_user.id, "MENU")
    await screen_top(message.chat.id, message.from_user.id)
    await try_delete(message)


@dp.message(Command("stats"))
async def cmd_stats(message: Message, state: FSMContext):
    await screen_player(message.chat.id, message.from_user.id, state, "stats")
    await try_delete(message)


@dp.message(Command("achievements"))
async def cmd_achievements(message: Message, state: FSMContext):
    await screen_player(message.chat.id, message.from_user.id, state, "achievements")
    await try_delete(message)


@dp.message(Command("upload"))
async def cmd_upload(message: Message, state: FSMContext):
    await screen_upload(message.chat.id, message.from_user.id, state)
    await try_delete(message)


@dp.message(Command("watch"))
async def cmd_watch(message: Message, state: FSMContext):
    await toggle_watch(message.chat.id, message.from_user.id, state)
    await try_delete(message)


# --- Админские команды (проверка прав по ADMIN_IDS из .env) ---

@dp.message(Command("log"))
async def cmd_log(message: Message, command: CommandObject):
    if message.from_user.id not in config.ADMIN_IDS:
        await message.answer("Команда доступна только администратору.")
        return
    count = int(command.args) if command.args and command.args.isdigit() else 20
    count = max(1, min(count, 50))

    def read_tail():
        try:
            with open(config.LOG_FILE, "r", encoding="utf-8") as f:
                return f.readlines()[-count:]
        except OSError:
            return []

    lines = await asyncio.to_thread(read_tail)
    body = html.escape("".join(lines))[-3500:] or "Лог пуст."
    await message.answer(f"<pre>{body}</pre>")
    logger.info("Админ %s запросил лог (%s строк)", message.from_user.id, count)


@dp.message(Command("broadcast"))
async def cmd_broadcast(message: Message, state: FSMContext):
    if message.from_user.id not in config.ADMIN_IDS:
        await message.answer("Команда доступна только администратору.")
        return
    await set_mode(state, message.from_user.id, "BROADCAST")
    await show_screen(message.chat.id, message.from_user.id,
                      "Введите текст рассылки для подписчиков:", keyboards.cancel_keyboard())
    await try_delete(message)


# ====================== Сценарные обработчики (по состояниям FSM) ======================

@dp.message(StateFilter(BotState.BROADCAST), F.text)
async def handle_broadcast(message: Message, state: FSMContext):
    user_id = message.from_user.id
    if user_id not in config.ADMIN_IDS:  # повторная проверка прав
        return
    sent = await notify_subscribers("📢 " + html.escape(message.text))
    logger.info("Рассылка от %s: доставлено %s", user_id, sent)
    await show_menu(message.chat.id, user_id, state, f"Рассылка отправлена: {sent} получателей.")
    await try_delete(message)


@dp.message(StateFilter(BotState.WAIT_NAME), F.text)
async def handle_name(message: Message, state: FSMContext):
    user_id = message.from_user.id
    name = message.text.strip()
    if not name or len(name) > config.MAX_NAME_LENGTH or "\n" in name:
        await show_screen(message.chat.id, user_id,
                          f"Имя должно быть от 1 до {config.MAX_NAME_LENGTH} символов. Попробуйте ещё раз.",
                          keyboards.cancel_keyboard())
        await try_delete(message)
        return
    data = session.load_session(user_id)
    data["name"] = name
    pending = data.get("pending")
    data["pending"] = None
    session.save_session(user_id, data)
    logger.info("Пользователь %s задал имя игрока", user_id)
    await try_delete(message)
    if pending in ("stats", "achievements"):
        await set_mode(state, user_id, "MENU")
        await screen_player(message.chat.id, user_id, state, pending)
    else:
        await show_menu(message.chat.id, user_id, state, "Имя сохранено.")


def _process_upload(text):
    """Разбор, верификация, запись в базу и учёт дней (выполняется в отдельном потоке)."""
    records, errors = analytics.parse_profiles_text(text)
    added = updated = 0
    changed = []
    if records:
        added, updated, changed = analytics.append_records(records)
        analytics.sync_days(records)
    return added, updated, changed, errors


@dp.message(StateFilter(BotState.UPLOAD), F.document)
async def handle_upload(message: Message, state: FSMContext):
    user_id = message.from_user.id
    doc = message.document
    # Проверки ДО скачивания: размер и расширение
    if (doc.file_size or 0) > config.MAX_UPLOAD_BYTES:
        await show_screen(message.chat.id, user_id, "Файл слишком большой.", keyboards.cancel_keyboard())
        await try_delete(message)
        return
    if not (doc.file_name or "").lower().endswith(".csv"):
        await show_screen(message.chat.id, user_id, "Нужен файл с расширением .csv.",
                          keyboards.cancel_keyboard())
        await try_delete(message)
        return
    buffer = io.BytesIO()
    await bot.download(doc, destination=buffer)
    try:
        text = buffer.getvalue().decode("utf-8-sig")
    except UnicodeDecodeError:
        await show_screen(message.chat.id, user_id, "Файл должен быть в кодировке UTF-8.",
                          keyboards.cancel_keyboard())
        await try_delete(message)
        return
    added, updated, changed, errors = await asyncio.to_thread(_process_upload, text)
    logger.info("Загрузка от %s: добавлено %s, обновлено %s, отклонено %s",
                user_id, added, updated, len(errors))
    report = f"📥 <b>Загрузка завершена</b>\nДобавлено: {added}\nОбновлено: {updated}\nОтклонено строк: {len(errors)}"
    if errors:
        report += "\n\n" + "\n".join(html.escape(e) for e in errors[:5])
        if len(errors) > 5:
            report += f"\n… и ещё {len(errors) - 5}"
    await set_mode(state, user_id, "MENU")
    await show_screen(message.chat.id, user_id, report,
                      keyboards.menu_keyboard(session.load_session(user_id)["subscribed"]))
    await try_delete(message)
    if changed:
        await notify_subscribers(format_changes(changed), exclude=user_id)


@dp.message(StateFilter(BotState.UPLOAD))
async def upload_wrong_input(message: Message):
    """В режиме загрузки пришло не файл."""
    await show_screen(message.chat.id, message.from_user.id,
                      "Жду CSV-файл. Пришлите документ или нажмите «Отмена».", keyboards.cancel_keyboard())
    await try_delete(message)


@dp.message()
async def fallback(message: Message, state: FSMContext):
    """Любое другое сообщение: возвращаем пользователя в меню."""
    await show_menu(message.chat.id, message.from_user.id, state)
    await try_delete(message)


# ====================== Callback-запросы (кнопки) ======================

@dp.callback_query(F.data == "menu")
async def cb_menu(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback)
    await show_menu(callback.message.chat.id, callback.from_user.id, state)


@dp.callback_query(F.data == "cancel")
async def cb_cancel(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback, "Отменено")
    data = session.load_session(callback.from_user.id)
    data["pending"] = None
    session.save_session(callback.from_user.id, data)
    await show_menu(callback.message.chat.id, callback.from_user.id, state)


@dp.callback_query(F.data == "top")
async def cb_top(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback)
    await set_mode(state, callback.from_user.id, "MENU")
    await screen_top(callback.message.chat.id, callback.from_user.id)


@dp.callback_query(F.data.in_({"stats", "achievements"}))
async def cb_player(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback)
    await screen_player(callback.message.chat.id, callback.from_user.id, state, callback.data)


@dp.callback_query(F.data == "upload")
async def cb_upload(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback)
    await screen_upload(callback.message.chat.id, callback.from_user.id, state)


@dp.callback_query(F.data == "watch")
async def cb_watch(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback, "Подписка обновлена")
    await toggle_watch(callback.message.chat.id, callback.from_user.id, state)


@dp.callback_query(F.data == "rename")
async def cb_rename(callback: CallbackQuery, state: FSMContext):
    await safe_answer(callback)
    await ask_name(callback.message.chat.id, callback.from_user.id, state, "stats")


@dp.callback_query()
async def cb_unknown(callback: CallbackQuery):
    await safe_answer(callback, "Неизвестная кнопка")


# ====================== Глобальный обработчик ошибок ======================

@dp.errors()
async def on_error(event: ErrorEvent) -> bool:
    logger.error("Ошибка апдейта: %s", event.exception, exc_info=True)
    message = event.update.message
    if message:
        try:
            await bot.send_message(message.chat.id, "⚠️ Временный сбой. Попробуйте /start")
        except Exception:
            pass
    return True


# ====================== Наблюдатель за файлом игры (/watch) ======================

async def watch_game_file():
    """Раз в WATCH_INTERVAL секунд проверяет CSV игры и оповещает подписчиков о новых результатах."""
    known = {r.key: r for r in await asyncio.to_thread(analytics.load_all)}
    last_mtime = await asyncio.to_thread(analytics.file_mtime, config.GAME_CSV)
    while True:
        await asyncio.sleep(config.WATCH_INTERVAL)
        try:
            mtime = await asyncio.to_thread(analytics.file_mtime, config.GAME_CSV)
            if mtime == last_mtime:
                continue
            last_mtime = mtime
            records = await asyncio.to_thread(analytics.load_all)
            await asyncio.to_thread(analytics.sync_days, records)
            changed = analytics.diff_records(known, records)
            known = {r.key: r for r in records}
            if changed:
                sent = await notify_subscribers(format_changes(changed))
                logger.info("Файл игры изменён: %s новых результатов, уведомлено %s", len(changed), sent)
        except Exception:
            logger.exception("Ошибка наблюдателя за файлом игры")


# ====================== Запуск ======================

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.FileHandler(config.LOG_FILE, encoding="utf-8"), logging.StreamHandler()],
    )


async def main():
    setup_logging()
    logger.info("Бот запускается")
    # учитываем дни игры из уже существующих данных (для стрика)
    await asyncio.to_thread(lambda: analytics.sync_days(analytics.load_all()))
    watcher = asyncio.create_task(watch_game_file())
    try:
        await dp.start_polling(bot)  # long polling
    finally:
        watcher.cancel()
        await bot.session.close()
        logger.info("Бот остановлен")


if __name__ == "__main__":
    asyncio.run(main())
