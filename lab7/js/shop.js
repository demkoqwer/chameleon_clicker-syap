// js/shop.js — интерфейс магазина улучшений. Карточки создаются один раз, а при изменениях (покупка, заработок очков)
// обновляются тексты и состояние кнопок; данные и правила лежат в economy.js.
import { escapeHtml } from './themes/utils.js';
import { upgradeCost } from './economy.js';

export class ShopPanel {
  // economy — модель; onBuy(id) — реакция на покупку; options.baseRadius — стартовый радиус из конфига (для подписи эффекта)
  constructor(economy, listEl, balanceEl, { onBuy, baseRadius }) {
    this.economy = economy;
    this.listEl = listEl;
    this.balanceEl = balanceEl;
    this.baseRadius = baseRadius;
    this.cards = new Map();

    for (const u of economy.upgrades) {
      const card = document.createElement('article');
      card.className = 'shop-card';
      card.dataset.id = u.id;
      card.innerHTML = `
        <h3 class="shop-name">${escapeHtml(u.name)}</h3>
        <p class="shop-desc">${escapeHtml(u.description)}</p>
        <div class="shop-meta"><span class="shop-level"></span><span class="shop-effect"></span></div>
        <div class="shop-actions">
          <button type="button" class="buy"></button>
          ${u.id === 'freeze' ? '<button type="button" class="use" data-scenario="freeze"></button>' : ''}
        </div>`;
      this.listEl.append(card);
      this.cards.set(u.id, {
        card,
        level: card.querySelector('.shop-level'),
        effect: card.querySelector('.shop-effect'),
        buy: card.querySelector('.buy'),
        use: card.querySelector('.use'),
      });
    }

    // Делегирование: один обработчик на список
    listEl.addEventListener('click', (event) => {
      const buy = event.target.closest('.buy');
      if (!buy) return;
      onBuy(buy.closest('.shop-card').dataset.id);
      buy.blur();
    });

    this.update();
  }

  // Обновление существующих узлов (без пересоздания)
  update() {
    const eco = this.economy;
    this.balanceEl.textContent = eco.balance;
    for (const u of eco.upgrades) {
      const view = this.cards.get(u.id);
      const maxed = u.level >= u.maxLevel;
      const cost = upgradeCost(u);
      if (u.id === 'radius') {
        view.level.textContent = `Уровень ${u.level}/${u.maxLevel}`;
        view.effect.textContent = `Радиус: ${this.baseRadius} → ${Math.min(150, this.baseRadius + u.level * u.step)} px`;
      } else {
        view.level.textContent = `Заряды: ${u.level}/${u.maxLevel}`;
        view.effect.textContent = '3 с покоя, перезарядка 10 с';
        view.use.textContent = `Применить (${u.level})`;
        view.use.disabled = u.level < 1;
      }
      view.buy.textContent = maxed ? 'Максимум' : `Купить · ${cost}`;
      view.buy.disabled = maxed || eco.balance < cost;
      view.card.classList.toggle('affordable', !maxed && eco.balance >= cost);
    }
  }
}
