// js/targetButton.js — кнопка-мишень (порт класса TargetButton из button.py)
import { Rect } from './rect.js';

export class TargetButton {
  // color — [R, G, B]; cfg — GameConfig; random — Random; playArea — Rect игровой зоны
  constructor(color, cfg, random, playArea) {
    this.radius = cfg.buttonStartRadius;
    this.minRadius = cfg.buttonMinRadius;
    this.shrinkFactor = cfg.buttonShrinkFactor;
    this.speedStep = cfg.buttonSpeedStep;
    this.color = color;
    this.speed = cfg.buttonStartSpeed;
    this.random = random;
    this.playArea = playArea;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.teleport();
  }

  // Ограничивающий квадрат кнопки (вычисляемое свойство, аналог @property)
  get rect() {
    return new Rect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
  }

  // Телепортация в случайную точку игровой зоны (круг целиком внутри зоны)
  teleport() {
    const a = this.playArea;
    this.x = this.random.int(a.x + this.radius, a.right - this.radius);
    this.y = this.random.int(a.y + this.radius, a.bottom - this.radius);
    this.#randomDirection();
  }

  // Случайное направление; длина вектора скорости всегда равна speed
  #randomDirection() {
    const angle = this.random.float(0, 2 * Math.PI);
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
  }

  // Попадание: расстояние от курсора до центра не больше радиуса
  contains(px, py) {
    return Math.hypot(px - this.x, py - this.y) <= this.radius;
  }

  // Реакция на попадание: радиус уменьшается на 5% (не меньше минимума), скорость растёт, телепорт
  onHit() {
    this.radius = Math.max(this.minRadius, Math.floor(this.radius * this.shrinkFactor));
    this.speed += this.speedStep;
    this.teleport();
  }

  // Один шаг движения с отскоком. Движение пробуется на КОПИИ прямоугольника (Rect.move),
  // и если шаг выводит кнопку за границы, скорость по этой оси меняет знак.
  // Так кнопка никогда не оказывается за границей и не застревает в ней.
  update() {
    const trial = this.rect.move(this.vx, this.vy);
    const a = this.playArea;
    if (trial.x < a.x || trial.right > a.right) this.vx = -this.vx;
    if (trial.y < a.y || trial.bottom > a.bottom) this.vy = -this.vy;
    this.x += this.vx;
    this.y += this.vy;
  }
}
