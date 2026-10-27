"""Основной класс игры: состояния, игровой цикл, обработка событий."""
import sys

import pygame

from py_chameleon_clicker.button import TargetButton
from py_chameleon_clicker.color_utils import make_color_pair
from py_chameleon_clicker.constants import (
    FPS,
    HITS_PER_LEVEL,
    HUD_HEIGHT,
    MAX_LEVEL,
    POINTS_PER_HIT,
    START_LIVES,
    STATE_LOSE,
    STATE_MENU,
    STATE_PLAY,
    STATE_WIN,
    WINDOW_HEIGHT,
    WINDOW_TITLE,
    WINDOW_WIDTH,
)
from py_chameleon_clicker import ui


class Game:
    def __init__(self):
        pygame.init()
        pygame.font.init()
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption(WINDOW_TITLE)
        self.clock = pygame.time.Clock()
        self.font = pygame.font.Font(None, 28)
        self.big_font = pygame.font.Font(None, 64)
        self.state = STATE_MENU
        self.best_score = 0
        self.reset()

    def reset(self):
        """Сброс игровой сессии в начальные значения."""
        self.score = 0
        self.level = 1
        self.lives = START_LIVES
        self.hits_on_level = 0
        self.background, color = make_color_pair(self.level)
        self.button = TargetButton(color)

    def start_game(self):
        self.reset()
        self.state = STATE_PLAY

    # ---------------- обработка событий ----------------
    def handle_event(self, event):
        if event.type == pygame.QUIT:
            self.quit()
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                self.quit()
            if self.state == STATE_MENU and event.key in (pygame.K_RETURN, pygame.K_SPACE):
                self.start_game()
            elif self.state in (STATE_WIN, STATE_LOSE) and event.key == pygame.K_r:
                self.start_game()
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.state == STATE_MENU:
                self.start_game()
            elif self.state == STATE_PLAY:
                self.handle_click(*event.pos)

    def handle_click(self, mx, my):
        """Клик в игре: попадание по кнопке или промах."""
        if my < HUD_HEIGHT:  # клики по панели HUD игнорируем
            return
        if self.button.contains(mx, my):
            self.on_hit()
        else:
            self.lives -= 1
            if self.lives <= 0:
                self.finish(STATE_LOSE)

    def on_hit(self):
        """Попадание: очки, прогресс уровня, новые цвета, движение кнопки."""
        self.score += POINTS_PER_HIT * self.level
        self.hits_on_level += 1
        if self.hits_on_level >= HITS_PER_LEVEL:
            self.hits_on_level = 0
            self.level += 1
            if self.level > MAX_LEVEL:
                self.level = MAX_LEVEL
                self.finish(STATE_WIN)
                return
        self.button.on_hit()
        # Новая пара цветов: чем выше уровень, тем меньше разница
        self.background, self.button.color = make_color_pair(self.level)

    def finish(self, new_state):
        self.state = new_state
        self.best_score = max(self.best_score, self.score)

    # ---------------- обновление и отрисовка ----------------
    def update(self):
        if self.state == STATE_PLAY:
            self.button.update()

    def draw(self):
        if self.state == STATE_MENU:
            ui.draw_menu(self.screen, self.big_font, self.font, self.best_score)
            return
        self.screen.fill(self.background)
        self.button.draw(self.screen)
        ui.draw_hud(self.screen, self.font, self.score, self.level,
                    self.lives, self.button.speed)
        if self.state in (STATE_WIN, STATE_LOSE):
            ui.draw_end_screen(self.screen, self.big_font, self.font,
                               self.state == STATE_WIN, self.score, self.level)

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
        pygame.quit()
        sys.exit()
