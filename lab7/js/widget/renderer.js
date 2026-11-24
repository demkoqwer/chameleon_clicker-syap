// js/renderer.js — ПРЕДСТАВЛЕНИЕ: рисует кадр на Canvas примитивами (fillRect, arc, fillText).
// Ничего не считает в игре: берёт готовые значения у ядра (engine) и у модели эффектов (alpha, radius)
// и подставляет их в строки rgb()/rgba(). Каждый кадр начинается с заливки фона:
// Canvas не помнит прошлый кадр, поэтому всё рисуется заново.
import { HUD_HEIGHT, STATE, WINDOW_HEIGHT, WINDOW_WIDTH } from '../core/constants.js';
import { MAX_CAMOUFLAGE } from '../core/colorMath.js';

const FONT = 'system-ui, "Segoe UI", sans-serif';
const COLORS = { strip: '#19191e', text: '#f0f0f0', accent: '#ffc83c', danger: '#e63c3c', good: '#50dc78', menu: '#141828' };

export const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
export const rgba = (c, alpha) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`;

export class Renderer {
  constructor(canvas, widget) {
    this.canvas = canvas;
    this.widget = widget;
    this.ctx = canvas.getContext('2d');
    // Чёткая картинка на экранах с devicePixelRatio > 1: физических пикселей больше, система координат — прежняя 800×600
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WINDOW_WIDTH * dpr;
    canvas.height = WINDOW_HEIGHT * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  text(str, x, y, color, size = 20, align = 'center') {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  // ---------- Кадр ----------
  draw() {
    const { widget } = this;
    const e = widget.engine;
    if (e.state === STATE.MENU) {
      this.drawMenu();
      return;
    }
    const { ctx } = this;
    ctx.fillStyle = rgb(e.background); // 1. фон: заливаем весь экран
    ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    this.drawButton();                 // 2. кнопка-мишень (в режиме «фонарика» — только в радиусе)
    this.drawReveal();                 // 3. подсказка-контур
    this.drawEffects();                // 4. волны, частицы, тексты, маркеры
    if (widget.spotlight.enabled) this.drawFog(); // 5. туман вне радиуса видимости
    this.drawCrosshair();              // 6. прицел — управляемая сущность
    this.drawStrip();                  // 7. верхняя полоса: прогресс уровня и маскировка
    if (widget.paused) this.drawPause();
    else if (e.state !== STATE.PLAY) this.drawResult();
  }

  // ---------- Кнопка-мишень ----------
  drawButton() {
    const { ctx, widget } = this;
    const e = widget.engine;
    const b = e.button;
    if (e.state === STATE.WIN) return; // на экране победы мишени нет
    const { x: cx, y: cy, radius: R, enabled } = { ...widget.cursor, ...widget.spotlight };
    if (enabled) {
      // «Туман войны» отбором по расстоянию: кнопка за пределами радиуса видимости даже не рисуется
      if (Math.hypot(b.x - cx, b.y - cy) - b.radius > R) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip(); // часть кнопки, выступающая за радиус, обрезается
    }
    ctx.fillStyle = rgb(b.color); // без обводки: иначе маскировка не работает
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    if (e.isFrozen) {
      ctx.strokeStyle = 'rgba(120, 210, 255, 0.85)'; // голубое кольцо вокруг замороженной кнопки
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enabled) ctx.restore();
  }

  // Пунктирный контур-подсказка вокруг кнопки (сценарий reveal)
  drawReveal() {
    const { ctx, widget } = this;
    if (widget.simNow >= widget.revealUntil) return;
    const b = widget.engine.button;
    const pulse = 0.55 + 0.45 * Math.sin(widget.simNow / 90);
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255, 255, 255, ${pulse.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Эффекты: alpha считает модель, здесь он только подставляется в rgba() ----------
  drawEffects() {
    const { ctx } = this;
    const fx = this.widget.effects;

    // Ударные волны: контур кольца, чем больше радиус — тем прозрачнее
    ctx.lineWidth = 3;
    for (const wave of fx.waves) {
      ctx.strokeStyle = rgba(wave.color, wave.alpha);
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Частицы: прозрачность и размер уменьшаются к концу жизни
    for (const p of fx.particles) {
      ctx.fillStyle = rgba(p.color, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Всплывающий текст
    for (const t of fx.texts) {
      this.text(t.text, t.x, t.y, rgba(t.color, t.alpha), 22);
    }

    // Маркеры над кнопкой: «плашка» с текстом, следует за сущностью
    for (const m of fx.markers) {
      const { x, y } = m.position;
      const size = 16 * m.scale;
      ctx.font = `bold ${size}px ${FONT}`;
      const w = ctx.measureText(m.text).width + 18;
      const h = size + 10;
      ctx.fillStyle = `rgba(15, 17, 26, ${(0.8 * m.alpha).toFixed(3)})`;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeStyle = rgba(m.color, m.alpha);
      ctx.lineWidth = 2;
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      this.text(m.text, x, y + 1, rgba(m.color, m.alpha), size);
    }
  }

  // ---------- Ограниченная видимость ----------
  // Вне круга вокруг прицела — тёмная заливка. Фигура «прямоугольник минус круг» задаётся одним путём
  // с правилом evenodd, поэтому никаких слоёв и масок не нужно.
  drawFog() {
    const { ctx, widget } = this;
    const { x, y } = widget.cursor;
    const R = widget.spotlight.radius;
    ctx.fillStyle = 'rgba(5, 6, 10, 0.93)';
    ctx.beginPath();
    ctx.rect(0, HUD_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT - HUD_HEIGHT);
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------- Прицел ----------
  drawCrosshair() {
    const { ctx, widget } = this;
    if (widget.engine.state !== STATE.PLAY) return;
    const { x, y } = widget.cursor;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
    ctx.stroke();
    // тонкая тёмная подложка, чтобы прицел был виден на светлом фоне
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------- Верхняя полоса (зона HUD ядра, клики по ней игнорируются) ----------
  drawStrip() {
    const { ctx, widget } = this;
    const e = widget.engine;
    ctx.fillStyle = COLORS.strip;
    ctx.fillRect(0, 0, WINDOW_WIDTH, HUD_HEIGHT);

    const bar = (x, label, value, color) => {
      this.text(label, x, 14, '#9ab', 13, 'left');
      ctx.fillStyle = '#2a2c36';
      ctx.fillRect(x, 26, 220, 10);
      ctx.fillStyle = color;
      ctx.fillRect(x, 26, 220 * Math.max(0, Math.min(1, value)), 10);
    };
    bar(30, `уровень ${e.level}: ${e.hitsOnLevel}/${e.cfg.hitsPerLevel}`, e.hitsOnLevel / e.cfg.hitsPerLevel, COLORS.accent);
    // шкала K доходит до предела маскировки MAX_CAMOUFLAGE (≈0.984): выше кнопка не бывает
    bar(300, `маскировка K = ${e.camouflage.toFixed(3)}`, e.camouflage / MAX_CAMOUFLAGE, COLORS.good);
    this.text(`x${e.multiplier}`, 560, 25, COLORS.accent, 26, 'left');
    for (let i = 0; i < e.lives; i++) { // жизни — красные кружки
      ctx.fillStyle = COLORS.danger;
      ctx.beginPath();
      ctx.arc(660 + i * 24, 25, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Экраны ----------
  drawMenu() {
    const { ctx } = this;
    ctx.fillStyle = COLORS.menu;
    ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);
    this.text('ЭВОЛЮЦИОННЫЙ КЛИКЕР', 400, 110, COLORS.accent, 46);
    const cfg = this.widget.engine.cfg;
    const lines = [
      'Кликай по прыгающей кнопке-хамелеону.',
      'С каждым попаданием она уменьшается, ускоряется',
      'и всё сильнее сливается с цветом фона.',
      'Промах мимо кнопки отнимает жизнь.',
      `Дойди до уровня ${cfg.maxLevel}, чтобы победить.`,
    ];
    lines.forEach((line, i) => this.text(line, 400, 200 + i * 32, COLORS.text, 21));
    this.text('Мышь или касание — прицел и клик. Либо WASD (Shift — быстрее) и пробел', 400, 400, '#9ab', 17);
    this.text('ENTER / клик / тап — начать', 400, 470, COLORS.accent, 26);
  }

  drawPause() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, HUD_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT - HUD_HEIGHT);
    this.text('ПАУЗА', 400, 290, COLORS.text, 54);
    this.text('P — продолжить', 400, 345, COLORS.accent, 22);
  }

  drawResult() {
    const { ctx, widget } = this;
    const e = widget.engine;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.67)';
    ctx.fillRect(0, HUD_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT - HUD_HEIGHT);
    const win = e.state === STATE.WIN;
    this.text(win ? 'ПОБЕДА!' : 'ИГРА ОКОНЧЕНА', 400, 230, win ? COLORS.good : COLORS.danger, 56);
    this.text(`Очки: ${e.score}   Уровень: ${e.level}   Макс. множитель: x${e.maxMultiplier}`, 400, 300, COLORS.text, 22);
    this.text(`Точность: ${(e.accuracy * 100).toFixed(0)}%   Попаданий: ${e.hits}   Промахов: ${e.misses}`, 400, 337, COLORS.text, 20);
    this.text('R / Enter / тап — играть снова', 400, 395, COLORS.accent, 24);
  }
}
