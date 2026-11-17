// js/effects.js — МОДЕЛЬ анимационных эффектов: частицы, ударные волны, всплывающий текст, маркеры.
// Здесь нет ни Canvas, ни DOM: каждый эффект знает своё состояние, шагает вместе с симуляцией
// и сам считает прозрачность (геттер alpha). Рисует эффекты renderer.js — он только подставляет alpha в rgba().
// Эффект сам сообщает, что «умер» (alive = false), и система его удаляет: так эффекты исчезают
// по окончании жизненного цикла, а не по решению отрисовки.
import { Random } from '../core/random.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Частица взрыва ----------
export class Particle {
  static FRICTION = 0.95; // скорость каждый шаг умножается на этот коэффициент
  static GRAVITY = 0.08;  // лёгкое падение вниз

  constructor(x, y, vx, vy, size, color, life) {
    Object.assign(this, { x, y, vx, vy, size, color, life, maxLife: life });
  }

  step() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= Particle.FRICTION;
    this.vy = this.vy * Particle.FRICTION + Particle.GRAVITY;
    this.life -= 1;
  }

  get alpha() { return clamp01(this.life / this.maxLife); }          // 1 → 0 за время жизни
  get radius() { return this.size * (0.35 + 0.65 * this.alpha); }    // частица ещё и сжимается
  get alive() { return this.life > 0; }
}

// ---------- Ударная волна: расширяющееся кольцо ----------
export class Shockwave {
  constructor(x, y, color, maxRadius = 120, speed = 3.2) {
    Object.assign(this, { x, y, color, maxRadius, speed, radius: 4 });
  }

  step() { this.radius += this.speed; }

  get alpha() { return clamp01(1 - this.radius / this.maxRadius); }  // 1 в центре → 0 на maxRadius
  get alive() { return this.radius < this.maxRadius; }
}

// ---------- Всплывающий текст («+40») ----------
export class FloatingText {
  constructor(x, y, text, color, life = 50) {
    Object.assign(this, { x, y, text, color, life, maxLife: life });
  }

  step() { this.y -= 0.9; this.life -= 1; }

  get alpha() { return clamp01(this.life / this.maxLife); }
  get alive() { return this.life > 0; }
}

// ---------- Маркер над сущностью: следует за кнопкой, пока не истечёт срок ----------
export class Marker {
  // anchor — функция, возвращающая { x, y, radius } сущности (кнопка движется, маркер за ней)
  constructor(text, color, anchor, life = 55) {
    Object.assign(this, { text, color, anchor, life, maxLife: life });
  }

  step() { this.life -= 1; }

  get age() { return 1 - this.life / this.maxLife; }              // 0 → 1
  get alpha() { return clamp01(this.life / 12); }                 // держится, затем гаснет за последние 12 шагов
  get scale() { return 1 + 0.5 * Math.max(0, 1 - this.age * 6); } // «всплеск» размера в первые шаги

  // Положение над сущностью: выше верхнего края, с лёгким покачиванием
  get position() {
    const a = this.anchor();
    return { x: a.x, y: a.y - a.radius - 16 - Math.sin(this.age * Math.PI * 4) * 4 };
  }

  get alive() { return this.life > 0; }
}

// ---------- Система эффектов ----------
export class EffectsSystem {
  constructor(random = new Random()) {
    this.random = random;
    this.particles = [];
    this.waves = [];
    this.texts = [];
    this.markers = [];
  }

  // Взрыв частиц: colors — список [R, G, B], цвет каждой частицы выбирается случайно
  burst(x, y, colors, count = 40, maxSpeed = 6) {
    for (let i = 0; i < count; i++) {
      const angle = this.random.float(0, Math.PI * 2);
      const speed = this.random.float(1, maxSpeed);
      const color = colors[this.random.int(0, colors.length - 1)];
      this.particles.push(new Particle(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        this.random.float(2, 5), color, this.random.int(28, 55),
      ));
    }
  }

  shockwave(x, y, color, maxRadius = 120) {
    this.waves.push(new Shockwave(x, y, color, maxRadius));
  }

  floatText(x, y, text, color, life = 50) {
    this.texts.push(new FloatingText(x, y, text, color, life));
  }

  marker(text, color, anchor, life = 55) {
    this.markers.push(new Marker(text, color, anchor, life));
  }

  // Один шаг симуляции: все эффекты шагают, «умершие» удаляются
  step() {
    for (const list of [this.particles, this.waves, this.texts, this.markers]) {
      for (const effect of list) effect.step();
    }
    this.particles = this.particles.filter((e) => e.alive);
    this.waves = this.waves.filter((e) => e.alive);
    this.texts = this.texts.filter((e) => e.alive);
    this.markers = this.markers.filter((e) => e.alive);
  }

  get count() {
    return this.particles.length + this.waves.length + this.texts.length + this.markers.length;
  }

  clear() {
    this.particles = [];
    this.waves = [];
    this.texts = [];
    this.markers = [];
  }
}

// ---------- Цвета эффектов ----------
// Кнопка маскируется под фон, поэтому частицы цвета кнопки на фоне почти не видны.
// Добавляем контрастный цвет (светлый на тёмном фоне и наоборот) и акцентный жёлтый.
export function contrastColor(background) {
  const luminance = 0.299 * background[0] + 0.587 * background[1] + 0.114 * background[2];
  return luminance > 140 ? [20, 20, 30] : [250, 250, 250];
}

export function burstColors(buttonColor, background) {
  return [buttonColor, contrastColor(background), contrastColor(background), [255, 200, 60]];
}
