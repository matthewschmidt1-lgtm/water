// The navigation is a drop. Tap it; it opens into the chapters.
export function mountNav(items) {
  const root = document.getElementById('drop-nav');
  const btn = root.querySelector('.drop');
  const list = root.querySelector('.drop-list');
  // Three ideas hold everything: water changes, water connects, water returns.
  const GROUPS = [['changes', 'Water changes'], ['connects', 'Water connects'], ['returns', 'Water returns']];
  list.innerHTML = GROUPS.map(([key, title]) => {
    const rows = items.filter((it) => it.group === key);
    if (!rows.length) return '';
    return `<li class="drop-group">${title}</li>` + rows.map((it) => `<li><a href="#${it.name}" data-name="${it.name}">${it.label}</a></li>`).join('');
  }).join('');
  btn.addEventListener('click', () => {
    const open = root.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const target = document.getElementById(a.dataset.name);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Chapters between here and there mount (and grow) while we travel; settle on the target afterwards.
    let taken = false;
    ['touchstart', 'wheel', 'keydown'].forEach((ev) => addEventListener(ev, () => { taken = true; }, { once: true, passive: true }));
    [1100, 2200].forEach((ms) => setTimeout(() => {
      if (!taken && target && Math.abs(target.getBoundingClientRect().top) > 12) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, ms));
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('scene', (e) => {
    list.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.name === e.detail));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  addEventListener('scroll', () => { if (root.classList.contains('open')) { root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } }, { passive: true });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) { root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });
}
