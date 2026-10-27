"""Интерфейс: стартовый экран, HUD и экраны завершения."""
import pygame

from py_chameleon_clicker.constants import (
    COLORS,
    HUD_HEIGHT,
    MAX_LEVEL,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)


def draw_text(surface, font, text, color, center):
    """Рисует текст с центром в точке center."""
    img = font.render(text, True, color)
    surface.blit(img, img.get_rect(center=center))


def draw_menu(surface, big_font, font, best_score):
    """Стартовый экран."""
    surface.fill(COLORS["menu_bg"])
    cx = WINDOW_WIDTH // 2
    draw_text(surface, big_font, "ЭВОЛЮЦИОННЫЙ КЛИКЕР", COLORS["accent"], (cx, 130))
    lines = [
        "Кликай по прыгающей кнопке-хамелеону.",
        "С каждым попаданием она уменьшается, ускоряется",
        "и всё сильнее сливается с цветом фона.",
        "Промах мимо кнопки отнимает жизнь.",
        f"Дойди до уровня {MAX_LEVEL}, чтобы победить.",
    ]
    for i, line in enumerate(lines):
        draw_text(surface, font, line, COLORS["text"], (cx, 220 + i * 32))
    draw_text(surface, font, f"Рекорд за сессию: {best_score}", COLORS["good"], (cx, 420))
    draw_text(surface, font, "ENTER / клик - начать,  ESC - выход", COLORS["accent"], (cx, 500))


def draw_hud(surface, font, score, level, lives, speed):
    """Верхняя панель: очки, уровень, жизни, скорость кнопки."""
    pygame.draw.rect(surface, COLORS["hud_bg"], (0, 0, WINDOW_WIDTH, HUD_HEIGHT))
    items = [
        (f"Очки: {score}", COLORS["text"], 90),
        (f"Уровень: {level}/{MAX_LEVEL}", COLORS["accent"], 300),
        (f"Жизни: {lives}", COLORS["danger"], 500),
        (f"Скорость: {speed:.1f}", COLORS["good"], 690),
    ]
    for text, color, x in items:
        draw_text(surface, font, text, color, (x, HUD_HEIGHT // 2))


def draw_end_screen(surface, big_font, font, victory, score, level):
    """Экран завершения (победа или поражение) поверх замершей игры."""
    overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
    overlay.fill(COLORS["overlay"])
    surface.blit(overlay, (0, 0))
    cx, cy = WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2
    if victory:
        draw_text(surface, big_font, "ПОБЕДА!", COLORS["good"], (cx, cy - 70))
    else:
        draw_text(surface, big_font, "ИГРА ОКОНЧЕНА", COLORS["danger"], (cx, cy - 70))
    draw_text(surface, font, f"Очки: {score}   Уровень: {level}", COLORS["text"], (cx, cy))
    draw_text(surface, font, "R - играть снова,  ESC - выход", COLORS["accent"], (cx, cy + 70))
