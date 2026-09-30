// The navigation is a drop. Tap it; it opens into the chapters.
export function mountNav(items) {
  const root = document.getElementById('drop-nav');
  const btn = root.querySelector('.drop');
  const list = root.querySelector('.drop-list');
  list.innerHTML = items.map((it) => `<li><a href="#${it.name}" data-name="${it.name}">${it.label}</a></li>`).join('');
  btn.addEventListener('click', () => {
    const open = root.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.name)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('scene', (e) => {
    list.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.name === e.detail));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) { root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });
}
