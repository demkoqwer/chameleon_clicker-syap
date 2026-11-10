"""Инлайн-клавиатуры. В callback_data только короткие коды действий (лимит 64 байта)."""
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def _btn(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def menu_keyboard(subscribed):
    watch_text = "🔔 Уведомления: ВКЛ" if subscribed else "🔕 Уведомления: ВЫКЛ"
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("🏆 Топ игроков", "top"), _btn("📊 Моя статистика", "stats")],
        [_btn("🎖 Ачивки", "achievements"), _btn("📥 Загрузить CSV", "upload")],
        [_btn(watch_text, "watch")],
        [_btn("✏️ Сменить имя игрока", "rename")],
    ])


def top_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("🔄 Обновить", "top"), _btn("🏠 В меню", "menu")],
    ])


def player_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("✏️ Сменить имя", "rename"), _btn("🏠 В меню", "menu")],
    ])


def cancel_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[[_btn("❌ Отмена", "cancel")]])


def back_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[[_btn("🏠 В меню", "menu")]])
