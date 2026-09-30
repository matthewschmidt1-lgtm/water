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
// Never explain before the visitor has had a chance to wonder: nothing shows until they ask "Why?".
// 0 nothing -> 1 LOOK -> 2 DISCOVER -> 3 GO DEEPER
const DEPTH_LABELS = ['Why?', 'Discover', 'Go deeper', 'That\'s the deep end'];
function wireDepth(el) {
  el.querySelectorAll('.depth').forEach((box) => {
    const btn = box.querySelector('.depth-more');
    if (!btn) return;
    box.dataset.level = '0';
    btn.textContent = DEPTH_LABELS[0];
    btn.addEventListener('click', () => {
      const level = Math.min(3, (parseInt(box.dataset.level || '0', 10)) + 1);
      box.dataset.level = String(level);
      btn.textContent = DEPTH_LABELS[level];
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

// FOLLOW THE WATER: one glowing drop leads the page, one enormous loop.
// The drop is a fixed canvas overlay. Each step it glides (with the scroll riding along) to a point over the
// chapter's scene, leaves a fading trail, and names where it is. Arrival: a thin ring and a plip.
const followBtn = document.getElementById('follow-btn');
const follow = document.getElementById('follow');
const fCanvas = document.getElementById('follow-canvas');
const fc = fCanvas.getContext('2d');
const fLabel = follow.querySelector('.follow-label');
const followStep = follow.querySelector('.follow-step');
const followWord = follow.querySelector('.follow-word');
const followNext = follow.querySelector('.follow-next');
const LAST = FOLLOW.length - 1;
const GLIDE = 1900, STEP_MS = 5200, SENTENCE_MS = 3000;
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const F = {
  on: false, i: 0, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t0: 0, arrived: false, sentenceOn: false,
  scrollFrom: 0, bend: 1, ring: -1, color: '#7ff2ff', origin: null, raf: 0, timer: null, labelT: null, fade: 1,
};
const trail = []; let trailAt = 0;

function sizeFollowCanvas() {
  const d = Math.min(devicePixelRatio || 1, 2);
  fCanvas.width = Math.round(innerWidth * d); fCanvas.height = Math.round(innerHeight * d);
  fc.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', () => { if (F.on) sizeFollowCanvas(); });

// Where the scroll should end for a chapter (live, because chapters mount and change height as we pass).
function followScrollFor(el) {
  const top = el.getBoundingClientRect().top + scrollY;
  const max = document.documentElement.scrollHeight - innerHeight;
  const y = narrow.matches ? top : top + el.offsetHeight / 2 - innerHeight / 2;
  return Math.max(0, Math.min(max, y));
}
// The point over the scene where the drop rests: about 35% down the visible scene area.
function followTarget(i, el) {
  const w = innerWidth;
  const body = el.querySelector('.chapter-body');
  const areaH = narrow.matches ? sceneH : innerHeight;
  let fx = narrow.matches ? 0.5 : body?.classList.contains('left') ? 0.7 : body?.classList.contains('right') ? 0.3 : 0.5;
  fx += Math.sin(i * 2.1) * (narrow.matches ? 0.16 : 0.12);
  return [w * fx, areaH * (0.35 + Math.cos(i * 1.7) * 0.08)];
}

function startStep(i) {
  F.i = Math.min(i, LAST);
  const s = FOLLOW[F.i];
  const el = document.getElementById(s.chapter);
  F.color = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7ff2ff';
  F.sx = F.x; F.sy = F.y; F.scrollFrom = scrollY; F.t0 = performance.now();
  F.arrived = false; F.sentenceOn = false; F.el = el; F.bend = -F.bend;
  // The loop closes where it began: the last step returns to the first step's point.
  if (F.i === LAST && F.origin) [F.tx, F.ty] = F.origin;
  else { [F.tx, F.ty] = followTarget(F.i, el); if (F.i === 0) F.origin = [F.tx, F.ty]; }
  followStep.classList.remove('on');
  fLabel.classList.remove('show');
  clearTimeout(F.labelT);
  F.labelT = setTimeout(() => {
    followWord.textContent = s.word;
    followStep.textContent = s.text;
    fLabel.classList.toggle('flip', F.tx > innerWidth * 0.55);
    fLabel.classList.add('show');
  }, reduced ? 0 : 260);
  const done = F.i >= LAST;
  followNext.textContent = done ? 'Begin again' : 'next';
  followNext.classList.toggle('again', done);
  clearTimeout(F.timer);
  F.timer = done ? null : setTimeout(() => startStep(F.i + 1), STEP_MS);
  if (reduced) { F.x = F.tx; F.y = F.ty; window.scrollTo({ top: followScrollFor(el), behavior: 'instant' }); arrive(); }
}

function arrive() {
  F.arrived = true; F.arrivedAt = performance.now(); F.ring = F.arrivedAt;
  audio.plip(1 + F.i * 0.05);
}

function followFrame(now) {
  if (!F.on) return;
  F.raf = requestAnimationFrame(followFrame);
  const W = innerWidth, H = innerHeight;
  fc.clearRect(0, 0, W, H);
  const bv = breath.value;
  if (!F.arrived) {
    const p = Math.min(1, (now - F.t0) / GLIDE), e = ease(p);
    const dx = F.tx - F.sx, dy = F.ty - F.sy, dist = Math.hypot(dx, dy) || 1;
    const bend = Math.sin(Math.PI * e) * dist * 0.14 * F.bend;
    F.x = F.sx + dx * e + (-dy / dist) * bend;
    F.y = F.sy + dy * e + (dx / dist) * bend;
    if (F.el) window.scrollTo({ top: F.scrollFrom + (followScrollFor(F.el) - F.scrollFrom) * e, behavior: 'instant' });
    if (now - trailAt > 34) { trail.push({ x: F.x, y: F.y, t: now, r: 2 + Math.random() * 1.6 }); trailAt = now; }
    if (p >= 1) arrive();
  } else {
    if (F.el && Math.abs(scrollY - followScrollFor(F.el)) > 1 && now - F.arrivedAt < 600) window.scrollTo({ top: followScrollFor(F.el), behavior: 'instant' });
    const since = now - F.arrivedAt;
    if (!F.sentenceOn && since > 250) { F.sentenceOn = true; followStep.classList.add('on'); }
    if (F.sentenceOn && since > SENTENCE_MS + 250) { F.sentenceOn = null; followStep.classList.remove('on'); }
  }
  const bob = F.arrived && !reduced ? Math.sin(now / 900) * 2.5 : 0;
  const dy0 = F.y + bob;
  fLabel.style.transform = `translate3d(${F.x.toFixed(1)}px,${dy0.toFixed(1)}px,0)`;
  // trail of tiny drops
  fc.fillStyle = F.color;
  for (let k = trail.length - 1; k >= 0; k--) {
    const a = 1 - (now - trail[k].t) / 700;
    if (a <= 0) { trail.splice(k, 1); continue; }
    fc.globalAlpha = a * 0.55; fc.beginPath(); fc.arc(trail[k].x, trail[k].y, trail[k].r * (0.4 + a * 0.6), 0, 6.2832); fc.fill();
  }
  // arrival ring, the same thin accent ring the chapters use
  if (F.ring > 0) {
    const rp = (now - F.ring) / 1400;
    if (rp >= 1) F.ring = -1;
    else {
      fc.globalAlpha = (1 - rp) * 0.7; fc.strokeStyle = F.color; fc.lineWidth = 1.2;
      fc.beginPath(); fc.arc(F.x, dy0, 8 + (1 - Math.pow(1 - rp, 3)) * 78, 0, 6.2832); fc.stroke();
    }
  }
  // the drop: layered glow, bright core
  const r = 6 + bv * 1.5;
  fc.fillStyle = F.color;
  fc.globalAlpha = 0.07 * F.fade; fc.beginPath(); fc.arc(F.x, dy0, r * 4.2, 0, 6.2832); fc.fill();
  fc.globalAlpha = 0.14 * F.fade; fc.beginPath(); fc.arc(F.x, dy0, r * 2.6, 0, 6.2832); fc.fill();
  fc.globalAlpha = 0.35 * F.fade; fc.beginPath(); fc.arc(F.x, dy0, r * 1.6, 0, 6.2832); fc.fill();
  fc.globalAlpha = F.fade; fc.fillStyle = '#f4f9fb';
  fc.beginPath(); fc.ellipse(F.x, dy0, r * 0.62, r * 0.78, 0, 0, 6.2832); fc.fill();
  fc.globalAlpha = 1;
}

function stopFollow() {
  if (!F.on) return;
  F.on = false; cancelAnimationFrame(F.raf);
  clearTimeout(F.timer); clearTimeout(F.labelT); F.timer = null;
  follow.classList.add('leaving'); document.body.classList.remove('following');
  setTimeout(() => { if (!F.on) { follow.hidden = true; follow.classList.remove('leaving'); fc.clearRect(0, 0, innerWidth, innerHeight); } }, 650);
}
function beginFollow() {
  if (F.on) return;
  F.on = true; follow.classList.remove('leaving'); follow.hidden = false;
  document.body.classList.add('following');
  sizeFollowCanvas(); trail.length = 0; F.ring = -1; F.origin = null; F.el = null;
  const b = followBtn.getBoundingClientRect();
  F.x = b.left + b.width / 2; F.y = Math.min(b.top + b.height / 2, innerHeight - 30);
  fLabel.classList.remove('show'); followStep.classList.remove('on');
  F.raf = requestAnimationFrame(followFrame);
  startStep(0);
}
followBtn.addEventListener('click', beginFollow);
followNext.addEventListener('click', () => {
  if (F.i >= LAST) { F.origin = null; startStep(0); } else startStep(F.i + 1);
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

// The front door shows nothing but the water. The rest of the interface appears once you enter.
function checkEntered() {
  if (scrollY > innerHeight * 0.45) { document.body.classList.add('entered'); removeEventListener('scroll', checkEntered); }
}
addEventListener('scroll', checkEntered, { passive: true });
checkEntered();

// The cycle: three lines, one thread that curves back to where it began.
const cycle = document.getElementById('cycle');
if (cycle) {
  new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting || cycle.classList.contains('is-visible')) return;
      cycle.classList.add('is-visible');
      const motion = cycle.querySelector('animateMotion');
      setTimeout(() => { try { motion.beginElement(); } catch (_) {} }, 600);
    });
  }, { threshold: 0.5 }).observe(cycle);
}

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
