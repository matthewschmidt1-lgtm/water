// WHERE IS WATER? — the discovery engine. Owned by this module; main.js only calls mountWhere().
import audio from './audio.js';
import { WHERE } from './content.js';

export function mountWhere({ narrow, reduced }) {
  // WHERE IS WATER? — a scavenger hunt across Earth.
  const whereBtn = document.getElementById('where-btn');
  const whereCard = document.getElementById('where-card');
  let whereIdx = -1;
  let whereOrder = [];
  function nextWhere() {
    if (whereOrder.length === 0) whereOrder = WHERE.map((_, i) => i).sort(() => Math.random() - 0.5);
    whereIdx = (whereIdx + 1) % whereOrder.length;
    const item = WHERE[whereOrder[whereIdx]];
    whereCard.querySelector('.where-text').textContent = item.text;
    whereCard.querySelector('.where-note').textContent = item.note || '';
    whereCard.hidden = false;
    whereCard.classList.remove('pop'); void whereCard.offsetWidth; whereCard.classList.add('pop');
    audio.plip(0.8 + Math.random() * 0.6);
  }
  whereBtn.addEventListener('click', nextWhere);
  whereCard.querySelector('.where-next').addEventListener('click', nextWhere);
  whereCard.querySelector('.where-close').addEventListener('click', () => { whereCard.hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') whereCard.hidden = true; });
}
