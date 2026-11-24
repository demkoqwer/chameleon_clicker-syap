// js/site.js — общий для всех страниц код: «бургер»-меню и всплывающие уведомления.
// Подключается на каждой странице, поэтому навигация ведёт себя одинаково везде.

// ---------- Бургер ----------
// Кнопка ☰ переключает класс open у выпадающего меню; какое меню видно (верхнее или бургер), решают медиазапросы в CSS
function initBurger() {
  const burger = document.querySelector('#burger');
  const menu = document.querySelector('#mobile-menu');
  if (!burger || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  };

  burger.addEventListener('click', () => setOpen(!menu.classList.contains('open')));
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  // Клик вне меню закрывает его
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !burger.contains(e.target)) setOpen(false);
  });
  // Окно стало широким (поворот экрана) — меню-бургер больше не нужно
  window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

// ---------- Уведомления ----------
let timer;
export function notify(message, bad = false) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 2200);
}

initBurger();
