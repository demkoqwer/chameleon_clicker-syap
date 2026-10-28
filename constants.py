"""Все константы игры: окно, цвета интерфейса, файлы данных, параметры по умолчанию."""
from pathlib import Path

#  Окно
WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
FPS = 60
WINDOW_TITLE = "Эволюционный Кликер - ЛР 2"
HUD_HEIGHT = 50  # высота верхней панели с информацией (HUD)

# Цвета интерфейса (не участвуют в маскировке) 
COLORS = {
    "hud_bg": (25, 25, 30),
    "text": (240, 240, 240),
    "accent": (255, 200, 60),
    "danger": (230, 60, 60),
    "good": (80, 220, 120),
    "menu_bg": (20, 24, 40),
    "overlay": (0, 0, 0, 170),  # RGBA, полупрозрачная вуаль на экранах конца игры
}

# Файлы данных (пути через pathlib: одинаково работают на любой ОС)
DATA_DIR = Path(__file__).resolve().parent
CONFIG_FILE = DATA_DIR / "clicker_config.json"     # настройки игры (JSON)
LOG_FILE = DATA_DIR / "game.log"                   # лог событий с timestamp
PROFILES_FILE = DATA_DIR / "clicker_profiles.csv"  # профили игроков (CSV)
CSV_FIELDS = ["Имя", "Уровень", "Очки", "Множитель", "Дата"]

# Параметры по умолчанию (используются, если JSON-файл повреждён/отсутствует) 
DEFAULT_CONFIG = {
    "start_lives": 3,              # промах мимо кнопки отнимает жизнь
    "hits_per_level": 5,           # попаданий до нового уровня
    "max_level": 10,               # дошёл до этого уровня - победа
    "button_start_radius": 60,
    "button_min_radius": 8,
    "button_shrink_factor": 0.95,  # радиус уменьшается на 5% после попадания
    "button_start_speed": 2.0,     # пикселей за кадр
    "button_speed_step": 0.4,      # прирост скорости за каждое попадание
    "color_diff_start": 200,       # разница каналов фона и кнопки на 1-м уровне
    "color_diff_min": 15,          # нижняя граница: кнопка не исчезает полностью
    "color_diff_step": 20,         # на сколько разница падает с каждым уровнем
    "points_per_hit": 10,          # очки = points_per_hit * уровень * множитель
    "combo_step": 3,               # сколько попаданий подряд дают +1 к множителю
    "max_multiplier": 5,           # максимальный множитель клика
}

# Ввод имени игрока
NAME_MAX_LENGTH = 12
DEFAULT_PLAYER_NAME = "Игрок"

# Состояния игры
STATE_MENU = "MENU"
STATE_PLAY = "PLAY"
STATE_NAME = "NAME"   # ввод имени перед сохранением результата
STATE_WIN = "WIN"
STATE_LOSE = "LOSE"
