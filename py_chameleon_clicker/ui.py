"""Интерфейс: стартовый экран, HUD, ввод имени и экраны завершения."""
import pygame

from py_chameleon_clicker.constants import (
    COLORS,
    HUD_HEIGHT,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)


def draw_text(surface, font, text, color, center):
    """Рисует текст с центром в точке center."""
    img = font.render(text, True, color)
    surface.blit(img, img.get_rect(center=center))


def draw_menu(surface, big_font, font, top_players, max_level):
    """Стартовый экран с топ-3 игроков из CSV-файла."""
    surface.fill(COLORS["menu_bg"])
    cx = WINDOW_WIDTH // 2
    draw_text(surface, big_font, "ЭВОЛЮЦИОННЫЙ КЛИКЕР", COLORS["accent"], (cx, 100))
    lines = [
        "Кликай по прыгающей кнопке-хамелеону.",
        "С каждым попаданием она уменьшается, ускоряется",
        "и всё сильнее сливается с цветом фона.",
        "Промах мимо кнопки отнимает жизнь.",
        f"Дойди до уровня {max_level}, чтобы победить.",
    ]
    for i, line in enumerate(lines):
        draw_text(surface, font, line, COLORS["text"], (cx, 170 + i * 30))

    # Таблица лучших игроков (данные из clicker_profiles.csv)
    draw_text(surface, font, "ТОП-3 ИГРОКОВ", COLORS["good"], (cx, 345))
    if top_players:
        for i, p in enumerate(top_players):
            line = f"{i + 1}. {p['Имя']} - {p['Очки']} оч., ур. {p['Уровень']}, x{p['Множитель']}"
            draw_text(surface, font, line, COLORS["text"], (cx, 380 + i * 30))
    else:
        draw_text(surface, font, "Пока нет результатов", COLORS["text"], (cx, 380))
    draw_text(surface, font, "ENTER / клик - начать,  ESC - выход", COLORS["accent"], (cx, 520))


def draw_hud(surface, font, score, multiplier, level, max_level, lives, speed):
    """Верхняя панель: очки и множитель, уровень, жизни, скорость кнопки."""
    pygame.draw.rect(surface, COLORS["hud_bg"], (0, 0, WINDOW_WIDTH, HUD_HEIGHT))
    items = [
        (f"Очки: {score} (x{multiplier})", COLORS["text"], 105),
        (f"Уровень: {level}/{max_level}", COLORS["accent"], 330),
        (f"Жизни: {lives}", COLORS["danger"], 520),
        (f"Скорость: {speed:.1f}", COLORS["good"], 690),
    ]
    for text, color, x in items:
        draw_text(surface, font, text, color, (x, HUD_HEIGHT // 2))


def _draw_overlay(surface):
    """Полупрозрачная вуаль поверх игрового поля."""
    overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
    overlay.fill(COLORS["overlay"])
    surface.blit(overlay, (0, 0))


def _draw_result_title(surface, big_font, victory, center):
    if victory:
        draw_text(surface, big_font, "ПОБЕДА!", COLORS["good"], center)
    else:
        draw_text(surface, big_font, "ИГРА ОКОНЧЕНА", COLORS["danger"], center)


def draw_name_input(surface, big_font, font, victory, score, level, text, cursor_on):
    """Экран ввода имени перед сохранением результата в CSV."""
    _draw_overlay(surface)
    cx, cy = WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2
    _draw_result_title(surface, big_font, victory, (cx, cy - 120))
    draw_text(surface, font, f"Очки: {score}   Уровень: {level}", COLORS["text"], (cx, cy - 60))
    draw_text(surface, font, "Введите имя игрока:", COLORS["text"], (cx, cy - 10))
    box = pygame.Rect(cx - 150, cy + 20, 300, 44)
    pygame.draw.rect(surface, COLORS["menu_bg"], box)
    pygame.draw.rect(surface, COLORS["accent"], box, 2)
    draw_text(surface, font, text + ("_" if cursor_on else " "), COLORS["text"], box.center)
    draw_text(surface, font, "ENTER - сохранить результат", COLORS["accent"], (cx, cy + 100))


def draw_end_screen(surface, big_font, font, victory, score, level, max_multiplier, save_status):
    """Экран завершения (победа или поражение) поверх замершей игры."""
    _draw_overlay(surface)
    cx, cy = WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2
    _draw_result_title(surface, big_font, victory, (cx, cy - 90))
    draw_text(surface, font, f"Очки: {score}   Уровень: {level}   Макс. множитель: x{max_multiplier}",
              COLORS["text"], (cx, cy - 20))
    draw_text(surface, font, save_status, COLORS["good"], (cx, cy + 30))
    draw_text(surface, font, "R - играть снова,  ESC - выход", COLORS["accent"], (cx, cy + 90))
