"""Игровой объект: кнопка-мишень, которая прыгает по экрану."""
import math
import random

import pygame

from py_chameleon_clicker.constants import (
    BUTTON_MIN_RADIUS,
    BUTTON_SHRINK_FACTOR,
    BUTTON_SPEED_STEP,
    BUTTON_START_RADIUS,
    BUTTON_START_SPEED,
    HUD_HEIGHT,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)


class TargetButton:
    """Кнопка описывается структурой (x, y, radius, color) + скорость движения."""

    def __init__(self, color):
        self.radius = BUTTON_START_RADIUS
        self.color = color
        self.speed = BUTTON_START_SPEED
        self.x = 0.0
        self.y = 0.0
        self.vx = 0.0
        self.vy = 0.0
        self.teleport()

    def teleport(self):
        """Телепортация в случайную точку игровой зоны (под HUD, внутри окна)."""
        self.x = random.randint(self.radius, WINDOW_WIDTH - self.radius)
        self.y = random.randint(HUD_HEIGHT + self.radius, WINDOW_HEIGHT - self.radius)
        self._random_direction()

    def _random_direction(self):
        """Выбирает случайное направление движения с текущей скоростью."""
        angle = random.uniform(0, 2 * math.pi)
        self.vx = math.cos(angle) * self.speed
        self.vy = math.sin(angle) * self.speed

    def contains(self, px, py):
        """Попал ли курсор (px, py) в кнопку - по формуле расстояния."""
        return math.hypot(px - self.x, py - self.y) <= self.radius

    def on_hit(self):
        """Реакция на попадание: уменьшение радиуса на 5%, ускорение, телепорт."""
        self.radius = max(BUTTON_MIN_RADIUS, int(self.radius * BUTTON_SHRINK_FACTOR))
        self.speed += BUTTON_SPEED_STEP
        self.teleport()

    def update(self):
        """Движение кнопки с отскоком от границ игровой зоны."""
        self.x += self.vx
        self.y += self.vy
        if self.x - self.radius < 0 or self.x + self.radius > WINDOW_WIDTH:
            self.vx = -self.vx
            self.x = max(self.radius, min(WINDOW_WIDTH - self.radius, self.x))
        if self.y - self.radius < HUD_HEIGHT or self.y + self.radius > WINDOW_HEIGHT:
            self.vy = -self.vy
            self.y = max(HUD_HEIGHT + self.radius,
                         min(WINDOW_HEIGHT - self.radius, self.y))

    def draw(self, surface):
        """Отрисовка кнопки (без обводки - иначе маскировка не работает)."""
        pygame.draw.circle(surface, self.color, (int(self.x), int(self.y)), self.radius)
