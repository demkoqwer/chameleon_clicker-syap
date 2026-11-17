// js/rect.js — порт pygame.Rect: прямоугольник x, y, w, h

export class Rect {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  get right() { return this.x + this.w; }
  get bottom() { return this.y + this.h; }
  get centerx() { return this.x + this.w / 2; }
  get centery() { return this.y + this.h / 2; }
  get center() { return [this.centerx, this.centery]; }

  // Возвращает НОВЫЙ прямоугольник; оригинал не меняется (как pygame.Rect.move).
  // Это защита от случайной порчи состояния при «пробном» движении.
  move(dx, dy) {
    return new Rect(this.x + dx, this.y + dy, this.w, this.h);
  }

  // Пересечение прямоугольников. Касание краями пересечением не считается.
  colliderect(other) {
    return this.x < other.right && this.right > other.x &&
           this.y < other.bottom && this.bottom > other.y;
  }

  // Попадание точки: левая и верхняя границы входят, правая и нижняя — нет.
  collidepoint(px, py) {
    return px >= this.x && px < this.right && py >= this.y && py < this.bottom;
  }

  // Лежит ли other целиком внутри этого прямоугольника.
  contains(other) {
    return other.x >= this.x && other.right <= this.right &&
           other.y >= this.y && other.bottom <= this.bottom;
  }
}
