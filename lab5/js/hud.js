// js/hud.js — HUD: показатели в СУЩЕСТВУЮЩИХ DOM-элементах (id="hud-...").
// Узлы не создаются заново каждый кадр: меняется только textContent, и только если значение изменилось.
import { STATE } from '../core/constants.js';

const STATE_NAMES = { [STATE.MENU]: 'меню', [STATE.PLAY]: 'игра', [STATE.WIN]: 'победа', [STATE.LOSE]: 'поражение' };

export class Hud {
  #cache = new Map();

  constructor(doc = document) {
    this.doc = doc;
    this.els = new Map();
    for (const el of doc.querySelectorAll('[id^="hud-"]')) this.els.set(el.id.slice(4), el);
  }

  set(id, value) {
    const text = String(value);
    if (this.#cache.get(id) === text) return; // ничего не изменилось — DOM не трогаем
    this.#cache.set(id, text);
    const el = this.els.get(id);
    if (el) el.textContent = text;
  }

  update(widget, perf) {
    const e = widget.engine;
    const left = e.freezeCooldownLeft(widget.simNow);
    this.set('score', e.score);
    this.set('mult', `x${e.multiplier}`);
    this.set('level', `${e.level}/${e.cfg.maxLevel}`);
    this.set('lives', e.lives);
    this.set('speed', e.button.speed.toFixed(1));
    this.set('radius', e.button.radius);
    this.set('de', e.deltaE.toFixed(1));
    this.set('k', e.camouflage.toFixed(3));
    this.set('acc', `${(e.accuracy * 100).toFixed(0)}%`);
    this.set('state', widget.paused ? 'пауза' : STATE_NAMES[e.state]);
    this.set('freeze', e.isFrozen ? 'заморожена' : left > 0 ? `через ${(left / 1000).toFixed(1)} с` : 'готова (F)');
    this.set('fx', widget.effects.count);
    this.set('fps', perf.fps);
    this.set('steps', perf.stepsPerSec);
    this.set('scale', `×${widget.timeScale}`);
    this.set('last', widget.lastScenario);
    this.set('log', e.log.toLines().slice(-8).join('\n'));
  }
}
