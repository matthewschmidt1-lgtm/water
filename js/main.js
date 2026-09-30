// Orchestrator: lazy-loads chapters as they approach, runs one animation loop,
// hands every active chapter the shared breath, and wires the global UI
// (droplet nav, sound toggle, depth layers, WHERE IS WATER?, FOLLOW THE WATER).

import breath from './breath.js';
import audio from './audio.js';
import { mountNav } from './nav.js';
import { WHERE, FOLLOW } from './content.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Phones get a lighter canvas: 1.5x is plenty for soft gradients and thin rings, and saves ~45% of the pixels.
const dprFor = () => Math.min(devicePixelRatio || 1, matchMedia('(max-width: 820px)').matches ? 1.5 : 2);
let dpr = dprFor();

// ---------- Chapter registry ----------
// Chapter contract (js/chapters/<name>.js):
//   export default {
//     mount(el, ctx) {}   // build DOM into el (canvas + text). ctx = { canvas, c2d, w, h, dpr, audio, breath, reduced, resize() }
//     tick(dt, breath, ctx) {}  // called every frame while visible. dt in ms.
//     resize(ctx) {}      // optional
//     unmount() {}        // optional
//   }
const chapters = new Map(); // name -> { el, mod, ctx, mounted, visible }
const narrow = matchMedia('(max-width: 820px)');
// Phones: the scene band is 56-62% of the screen height (taller phones get the fuller band).
// Keep in sync with the `var(--scene-h, 62vh)` fallback in css/water.css. The value is measured only on a
// real resize, so a mobile URL bar sliding away never re-lays-out the scenes mid-scroll.
const sceneFraction = (hh) => (hh < 700 ? 0.56 : hh < 820 ? 0.6 : 0.62);
let sceneH = Math.round(innerHeight * sceneFraction(innerHeight));
let lastW = innerWidth, lastH = innerHeight;
document.documentElement.style.setProperty('--scene-h', sceneH + 'px');
narrow.addEventListener('change', () => dispatchEvent(new Event('resize')));

const sections = [...document.querySelectorAll('section.chapter[data-chapter]')];

function makeCtx(el) {
  const canvas = document.createElement('canvas');
  canvas.className = 'chapter-canvas';
  el.prepend(canvas);
  const ctx = {
    el, canvas, c2d: canvas.getContext('2d'), dpr, w: 0, h: 0,
    audio, breath, reduced,
    resize() {
      const r = el.getBoundingClientRect();
      ctx.w = Math.max(1, Math.round(r.width));
      // On phones the scene is a band across the top and the copy flows below it (see css: --scene-h).
      ctx.h = Math.max(1, Math.round(narrow.matches ? sceneH : r.height));
      ctx.dpr = dpr;
      canvas.width = ctx.w * dpr;
      canvas.height = ctx.h * dpr;
      canvas.style.width = ctx.w + 'px';
      canvas.style.height = ctx.h + 'px';
      ctx.c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
  ctx.resize();
  return ctx;
}

async function load(name, el) {
  const entry = chapters.get(name);
  if (entry.mounted || entry.loading) return;
  entry.loading = true;
  try {
    const mod = (await import(`./chapters/${name}.js`)).default;
    entry.ctx = makeCtx(el);
    entry.mod = mod;
    bandWatch.observe(entry.ctx.canvas);
    mod.mount(el, entry.ctx);
    entry.mounted = true;
    el.classList.add('is-mounted');
    wireDepth(el);
  } catch (e) {
    console.error(`chapter ${name} failed`, e);
    el.classList.add('is-failed');
  }
}

sections.forEach((el) => chapters.set(el.dataset.chapter, { el, mounted: false, visible: false, band: true }));

// On phones a chapter is tall but its scene is only a band at the top: stop drawing once the band is off screen.
const bandWatch = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    const entry = chapters.get(en.target.parentElement.dataset.chapter);
    if (entry) entry.band = en.isIntersecting;
  });
});

// Preload when within one viewport; mark visible when on screen.
const preloader = new IntersectionObserver((entries) => {
  entries.forEach((en) => { if (en.isIntersecting) load(en.target.dataset.chapter, en.target); });
}, { rootMargin: '100% 0px' });
const visibility = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    const entry = chapters.get(en.target.dataset.chapter);
    entry.visible = en.isIntersecting;
    en.target.classList.toggle('is-visible', en.isIntersecting);
  });
  updateScene();
}, { threshold: 0.2 });
sections.forEach((el) => { preloader.observe(el); visibility.observe(el); });

// Which chapter dominates the viewport? (for sound + nav highlight)
let scene = null;
function updateScene() {
  const mid = innerHeight / 2;
  let best = null, bestD = Infinity;
  const hero = document.querySelector('.hero');
  if (hero) { const r = hero.getBoundingClientRect(); bestD = Math.abs((r.top + r.bottom) / 2 - mid); }
  sections.forEach((el) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs((r.top + r.bottom) / 2 - mid);
    if (d < bestD) { bestD = d; best = el.dataset.chapter; }
  });
  if (best !== scene) {
    scene = best;
    audio.setScene(scene);
    document.body.dataset.scene = scene;
    document.dispatchEvent(new CustomEvent('scene', { detail: scene }));
  }
}
addEventListener('scroll', updateScene, { passive: true });

// ---------- Animation loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  if (!document.hidden) {
    chapters.forEach((entry) => {
      if (entry.mounted && entry.visible && entry.band) {
        try { entry.mod.tick(dt, breath, entry.ctx); } catch (e) { console.error(e); entry.visible = false; }
      }
    });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let resizeT;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    // Mobile URL bars resize the viewport while scrolling; only a real change in shape re-lays-out the scenes.
    const sameShape = innerWidth === lastW && Math.abs(innerHeight - lastH) < 160;
    if (sameShape && narrow.matches) return;
    lastW = innerWidth; lastH = innerHeight;
    sceneH = Math.round(innerHeight * sceneFraction(innerHeight));
    document.documentElement.style.setProperty('--scene-h', sceneH + 'px');
    dpr = dprFor();
    chapters.forEach((entry) => {
      if (!entry.mounted) return;
      entry.ctx.resize();
      entry.mod.resize?.(entry.ctx);
    });
  }, 120);
});

// ---------- Depth layers: LOOK -> DISCOVER -> GO DEEPER ----------
function wireDepth(el) {
  el.querySelectorAll('.depth').forEach((box) => {
    const btn = box.querySelector('.depth-more');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const level = Math.min(3, (parseInt(box.dataset.level || '1', 10)) + 1);
      box.dataset.level = String(level);
      btn.textContent = level === 2 ? 'Go deeper' : level === 3 ? 'That\'s the deep end' : 'Discover';
      if (level === 3) btn.disabled = true;
      audio.plip(1.2);
    });
  });
}

// ---------- Global UI ----------
mountNav(sections.map((el) => ({ name: el.dataset.chapter, label: el.dataset.label || el.dataset.chapter, group: el.dataset.group || 'connects' })));

const soundBtn = document.getElementById('sound-toggle');
soundBtn.addEventListener('click', () => {
  const on = audio.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.querySelector('span').textContent = on ? 'sound on' : 'sound off';
  if (on) audio.setScene(scene);
});

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

// FOLLOW THE WATER — one drop, one enormous loop.
const followBtn = document.getElementById('follow-btn');
const follow = document.getElementById('follow');
const followStep = follow.querySelector('.follow-step');
const followWord = follow.querySelector('.follow-word');
let followI = 0, followTimer = null;
const followNext = follow.querySelector('.follow-next');
const followCount = follow.querySelector('.follow-count');
const LAST = FOLLOW.length - 1;
function armTimer() {
  clearInterval(followTimer);
  followTimer = setInterval(() => {
    if (followI >= LAST) { clearInterval(followTimer); followTimer = null; return; }
    showFollow(followI + 1);
  }, 5200);
}
function showFollow(i) {
  followI = Math.min(i, LAST);
  const s = FOLLOW[followI];
  followWord.textContent = s.word;
  followStep.textContent = s.text;
  followCount.textContent = `${followI + 1} / ${FOLLOW.length}`;
  followWord.classList.remove('pop'); void followWord.offsetWidth; followWord.classList.add('pop');
  if (s.chapter) {
    const target = document.getElementById(s.chapter);
    // On phones, land with the scene band at the top so the overlay never sits over the art.
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: narrow.matches ? 'start' : 'center' });
  }
  audio.plip(1 + followI * 0.05);
  // The loop closes where it began. Offer to go around once more rather than spinning forever.
  const done = followI >= LAST;
  followNext.textContent = done ? 'Begin again' : 'next ↓';
  if (done) { followCount.textContent = 'One loop. Four billion years of them.'; clearInterval(followTimer); followTimer = null; }
}
function stopFollow() { follow.hidden = true; clearInterval(followTimer); followTimer = null; }
followBtn.addEventListener('click', () => {
  follow.hidden = false;
  showFollow(0);
  armTimer();
});
followNext.addEventListener('click', () => {
  if (followI >= LAST) { showFollow(0); armTimer(); return; }
  showFollow(followI + 1);
  armTimer();
});
follow.querySelector('.follow-close').addEventListener('click', stopFollow);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopFollow(); whereCard.hidden = true; } });

// Bottom bar steps aside while the reader scrolls down, and returns on scroll-up or after a pause.
const bar = document.querySelector('.bottom-bar');
let lastY = scrollY, barTimer = null, upAcc = 0;
addEventListener('scroll', () => {
  const y = scrollY;
  const dy = y - lastY;
  lastY = y;
  if (dy > 0) upAcc = 0; else upAcc -= dy;
  if (dy > 4 && y > 80) bar.classList.add('away');
  // A deliberate scroll-up brings it back (a jittery thumb does not).
  else if (dy < 0 && upAcc > (narrow.matches ? 90 : 4)) bar.classList.remove('away');
  clearTimeout(barTimer);
  // On phones the bar does not creep back over the copy on its own: it returns on scroll-up, or at the very top.
  barTimer = setTimeout(() => { if (!narrow.matches || scrollY <= 80) bar.classList.remove('away'); }, 1100);
}, { passive: true });

// Breath hint text under the hero
const hint = document.getElementById('breath-word');
if (hint) breath.onPhase((p) => { hint.textContent = p; });

// The river along the bottom edge grows with the journey.
const river = document.querySelector('#river i');
function updateRiver() {
  const max = document.documentElement.scrollHeight - innerHeight;
  river.style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0).toFixed(2) + '%';
}
addEventListener('scroll', updateRiver, { passive: true });
addEventListener('resize', updateRiver);
updateRiver();

updateScene();
