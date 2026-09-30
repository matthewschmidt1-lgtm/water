// Orchestrator: lazy-loads chapters as they approach, runs one animation loop,
// hands every active chapter the shared breath, and wires the global UI
// (droplet nav, sound toggle, depth layers, WHERE IS WATER?, FOLLOW THE WATER).

import breath from './breath.js';
import audio from './audio.js';
import { mountNav } from './nav.js';
import { WHERE, FOLLOW } from './content.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dpr = Math.min(devicePixelRatio || 1, 2);

// ---------- Chapter registry ----------
// Chapter contract (js/chapters/<name>.js):
//   export default {
//     mount(el, ctx) {}   // build DOM into el (canvas + text). ctx = { canvas, c2d, w, h, dpr, audio, breath, reduced, resize() }
//     tick(dt, breath, ctx) {}  // called every frame while visible. dt in ms.
//     resize(ctx) {}      // optional
//     unmount() {}        // optional
//   }
const chapters = new Map(); // name -> { el, mod, ctx, mounted, visible }

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
      ctx.h = Math.max(1, Math.round(r.height));
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
    mod.mount(el, entry.ctx);
    entry.mounted = true;
    el.classList.add('is-mounted');
    wireDepth(el);
  } catch (e) {
    console.error(`chapter ${name} failed`, e);
    el.classList.add('is-failed');
  }
}

sections.forEach((el) => chapters.set(el.dataset.chapter, { el, mounted: false, visible: false }));

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
}, { threshold: 0.35 });
sections.forEach((el) => { preloader.observe(el); visibility.observe(el); });

// Which chapter dominates the viewport? (for sound + nav highlight)
let scene = null;
function updateScene() {
  const mid = innerHeight / 2;
  let best = null, bestD = Infinity;
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
      if (entry.mounted && entry.visible) {
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
mountNav(sections.map((el) => ({ name: el.dataset.chapter, label: el.dataset.label || el.dataset.chapter })));

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
function showFollow(i) {
  followI = i % FOLLOW.length;
  const s = FOLLOW[followI];
  followWord.textContent = s.word;
  followStep.textContent = s.text;
  follow.querySelector('.follow-count').textContent = `${followI + 1} / ${FOLLOW.length}`;
  followWord.classList.remove('pop'); void followWord.offsetWidth; followWord.classList.add('pop');
  if (s.chapter) {
    const target = document.getElementById(s.chapter);
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }
  audio.plip(1 + followI * 0.05);
}
function stopFollow() { follow.hidden = true; clearInterval(followTimer); followTimer = null; }
followBtn.addEventListener('click', () => {
  follow.hidden = false;
  showFollow(0);
  followTimer = setInterval(() => showFollow(followI + 1), 5200);
});
follow.querySelector('.follow-next').addEventListener('click', () => {
  showFollow(followI + 1);
  clearInterval(followTimer);
  followTimer = setInterval(() => showFollow(followI + 1), 5200);
});
follow.querySelector('.follow-close').addEventListener('click', stopFollow);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopFollow(); whereCard.hidden = true; } });

// Breath hint text under the hero
const hint = document.getElementById('breath-word');
if (hint) breath.onPhase((p) => { hint.textContent = p === 'inhale' ? 'inhale' : 'exhale'; });

updateScene();
