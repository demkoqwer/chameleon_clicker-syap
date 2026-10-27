"""Функции работы с цветом. Модуль не зависит от pygame, поэтому легко тестируется."""
import random


def random_color():
    """Возвращает случайный цвет (R, G, B)."""
    return (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))


def clamp(value, low=0, high=255):
    """Ограничивает значение диапазоном [low, high]."""
    return max(low, min(high, value))


def max_diff_for_level(level, cfg):
    """Максимальная разница каналов для уровня (параметры берутся из настроек).

    Чем выше уровень, тем меньше разница -> кнопка сильнее сливается с фоном.
    """
    return max(cfg["color_diff_min"],
               cfg["color_diff_start"] - (level - 1) * cfg["color_diff_step"])


def similar_color(base, max_diff):
    """Алгоритм сближения значений.

    Каждый канал базового цвета сдвигается на случайную величину
    в пределах [-max_diff, +max_diff] и ограничивается диапазоном 0..255.
    """
    return tuple(clamp(c + random.randint(-max_diff, max_diff)) for c in base)


def color_difference(c1, c2):
    """Наибольшая разница по одному из каналов (для проверки и отладки)."""
    return max(abs(a - b) for a, b in zip(c1, c2))


def make_color_pair(level, cfg):
    """Создаёт пару (цвет фона, цвет кнопки) для заданного уровня."""
    background = random_color()
    button = similar_color(background, max_diff_for_level(level, cfg))
    return background, button
