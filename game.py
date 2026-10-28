"""Основной класс игры: состояния, игровой цикл, обработка событий."""
import logging
import sys

import pygame

from py_chameleon_clicker import ui
from py_chameleon_clicker.button import TargetButton
from py_chameleon_clicker.color_utils import make_color_pair
from py_chameleon_clicker.constants import (
    DEFAULT_PLAYER_NAME,
    FPS,
    HUD_HEIGHT,
    NAME_MAX_LENGTH,
    STATE_LOSE,
    STATE_MENU,
    STATE_NAME,
    STATE_PLAY,
    STATE_WIN,
    WINDOW_HEIGHT,
    WINDOW_TITLE,
    WINDOW_WIDTH,
)
from py_chameleon_clicker.data_io import (
    get_top,
    load_config,
    log_event,
    save_profile,
    setup_logging,
)


class Game:
    def __init__(self):
        setup_logging()                 # 1. лог-файл
        self.cfg = load_config()        # 2. настройки из JSON (с валидацией)
        pygame.init()
        pygame.font.init()
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption(WINDOW_TITLE)
        self.clock = pygame.time.Clock()
        self.font = pygame.font.Font(None, 28)
        self.big_font = pygame.font.Font(None, 64)
        self.state = STATE_MENU
        self.top_players = get_top(3)   # 3. топ-3 из CSV для стартового экрана
        self.last_name = ""             # имя прошлого игрока подставляется в поле ввода
        self.input_text = ""
        self.result_state = STATE_LOSE
        self.save_status = ""
        self.reset()
        log_event("Игра запущена")

    def reset(self):
        """Сброс игровой сессии в начальные значения."""
        self.score = 0
        self.level = 1
        self.lives = self.cfg["start_lives"]
        self.hits_on_level = 0
        self.combo = 0                  # попаданий подряд без промаха
        self.multiplier = 1             # множитель клика
        self.max_multiplier = 1
        self.background, color = make_color_pair(self.level, self.cfg)
        self.button = TargetButton(color, self.cfg)

    def start_game(self):
        self.reset()
        self.state = STATE_PLAY
        log_event("Новая игра началась")

    # ---------------- обработка событий ----------------
    def handle_event(self, event):
        if event.type == pygame.QUIT:
            self.quit()
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                self.quit()
            if self.state == STATE_MENU and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                self.start_game()
            elif self.state == STATE_NAME:
                self.handle_name_key(event)
            elif self.state in (STATE_WIN, STATE_LOSE) and event.key == pygame.K_r:
                self.start_game()
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.state == STATE_MENU:
                self.start_game()
            elif self.state == STATE_PLAY:
                self.handle_click(*event.pos)

    def handle_name_key(self, event):
        """Ввод имени: буквы, Backspace и Enter (сохранить)."""
        if event.key == pygame.K_RETURN:
            self.confirm_name()
        elif event.key == pygame.K_BACKSPACE:
            self.input_text = self.input_text[:-1]
        elif (event.unicode and event.unicode.isprintable()
              and len(self.input_text) < NAME_MAX_LENGTH):
            self.input_text += event.unicode

    def confirm_name(self):
        """Сохраняет результат сессии в CSV и показывает экран завершения."""
        name = self.input_text.strip() or DEFAULT_PLAYER_NAME
        self.last_name = name
        result = save_profile(name, self.level, self.score, self.max_multiplier)
        if result == "created":
            self.save_status = f"Профиль «{name}» создан"
        elif result == "updated":
            self.save_status = f"Профиль «{name}» обновлён"
        else:
            self.save_status = "Не удалось сохранить результат (проверьте файл CSV)"
        self.top_players = get_top(3)
        self.state = self.result_state

    def handle_click(self, mx, my):
        """Клик в игре: попадание по кнопке или промах."""
        if my < HUD_HEIGHT:  # клики по панели HUD игнорируем
            return
        if self.button.contains(mx, my):
            self.on_hit()
        else:
            self.lives -= 1
            self.combo = 0
            self.multiplier = 1
            log_event(f"Промах. Осталось жизней: {self.lives}", logging.WARNING)
            if self.lives <= 0:
                self.finish(STATE_LOSE)

    def on_hit(self):
        """Попадание: очки, множитель, прогресс уровня, новые цвета."""
        self.combo += 1
        self.multiplier = min(self.cfg["max_multiplier"],
                              1 + self.combo // self.cfg["combo_step"])
        self.max_multiplier = max(self.max_multiplier, self.multiplier)
        self.score += self.cfg["points_per_hit"] * self.level * self.multiplier
        self.hits_on_level += 1
        log_event(f"Попадание. Очки: {self.score}, множитель x{self.multiplier}")
        if self.hits_on_level >= self.cfg["hits_per_level"]:
            self.hits_on_level = 0
            self.level += 1
            log_event(f"Уровень повышен до {self.level}")
            if self.level > self.cfg["max_level"]:
                self.level = self.cfg["max_level"]
                self.finish(STATE_WIN)
                return
        self.button.on_hit()
        # Новая пара цветов: чем выше уровень, тем меньше разница
        self.background, self.button.color = make_color_pair(self.level, self.cfg)

    def finish(self, result_state):
        """Конец игры: запоминаем исход и просим ввести имя игрока."""
        self.result_state = result_state
        self.input_text = self.last_name
        self.state = STATE_NAME
        outcome = "Победа" if result_state == STATE_WIN else "Поражение"
        log_event(f"{outcome}. Очки: {self.score}, уровень: {self.level}")

    # ---------------- обновление и отрисовка ----------------
    def update(self):
        if self.state == STATE_PLAY:
            self.button.update()

    def draw(self):
        if self.state == STATE_MENU:
            ui.draw_menu(self.screen, self.big_font, self.font,
                         self.top_players, self.cfg["max_level"])
            return
        self.screen.fill(self.background)
        self.button.draw(self.screen)
        ui.draw_hud(self.screen, self.font, self.score, self.multiplier, self.level,
                    self.cfg["max_level"], self.lives, self.button.speed)
        victory = self.result_state == STATE_WIN
        if self.state == STATE_NAME:
            cursor_on = (pygame.time.get_ticks() // 500) % 2 == 0  # мигающий курсор
            ui.draw_name_input(self.screen, self.big_font, self.font, victory,
                               self.score, self.level, self.input_text, cursor_on)
        elif self.state in (STATE_WIN, STATE_LOSE):
            ui.draw_end_screen(self.screen, self.big_font, self.font, victory,
                               self.score, self.level, self.max_multiplier, self.save_status)

    def run(self):
        """Игровой цикл: события -> обновление -> отрисовка -> ограничение FPS."""
        while True:
            for event in pygame.event.get():
                self.handle_event(event)
            self.update()
            self.draw()
            pygame.display.flip()
            self.clock.tick(FPS)

    @staticmethod
    def quit():
        log_event("Игра закрыта")
        pygame.quit()
        sys.exit()
