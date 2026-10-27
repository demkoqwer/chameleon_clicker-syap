"""Все константы игры: окно, цвета интерфейса, параметры механик, состояния."""

#  Окно
WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
FPS = 60
WINDOW_TITLE = "Эволюционный Кликер - ЛР 1"
HUD_HEIGHT = 50  

# Цвета интерфейса (не участвуют в маскировке) 
COLORS = {
    "hud_bg": (25, 25, 30),
    "text": (240, 240, 240),
    "accent": (255, 200, 60),
    "danger": (230, 60, 60),
    "good": (80, 220, 120),
    "menu_bg": (20, 24, 40),
    "overlay": (0, 0, 0, 170),  
}

# Кнопка-мишень 
BUTTON_START_RADIUS = 60
BUTTON_MIN_RADIUS = 8
BUTTON_SHRINK_FACTOR = 0.95   
BUTTON_START_SPEED = 2.0     
BUTTON_SPEED_STEP = 0.4      

# Правила игры 
START_LIVES = 3               
HITS_PER_LEVEL = 5           
MAX_LEVEL = 10               
POINTS_PER_HIT = 10          

# Сближение цветов (маскировка) 

COLOR_DIFF_START = 200       
COLOR_DIFF_MIN = 15          
COLOR_DIFF_STEP = 20         
# Состояния игры 
STATE_MENU = "MENU"
STATE_PLAY = "PLAY"
STATE_WIN = "WIN"
STATE_LOSE = "LOSE"
