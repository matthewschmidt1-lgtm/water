// Orchestrator: lazy-loads chapters as they approach, runs one animation loop,
// hands every active chapter the shared breath, and wires the global UI
// (droplet nav, sound toggle, depth layers, WHERE IS WATER?, FOLLOW THE WATER).

import breath from './breath.js';
import audio from './audio.js';
import { mountNav } from './nav.js';
import { mountWhere } from './where.js';
import { mountJourney } from './journey.js';

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
// Reserve a taller band up front for chapters that ask for one, so nothing shifts when they mount.
sections.forEach((el) => { const share = parseFloat(el.dataset.band); if (share && narrow.matches) el.style.setProperty('--scene-h', Math.round(lastH * share) + 'px'); });

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
      // A chapter can ask for a taller band on phones (data-band = share of the screen height).
      const share = parseFloat(el.dataset.band);
      const band = share ? Math.round(lastH * share) : sceneH;
      if (share && narrow.matches) el.style.setProperty('--scene-h', band + 'px'); else if (share) el.style.removeProperty('--scene-h');
      ctx.h = Math.max(1, Math.round(narrow.matches ? band : r.height));
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

function load(name, el) {
  const entry = chapters.get(name);
  if (entry.mounted) return Promise.resolve();
  if (!entry.loading) entry.loading = doLoad(name, el, entry);
  return entry.loading;
}
async function doLoad(name, el, entry) {
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
    if (el.hidden) return;
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

// WHERE IS WATER? and FOLLOW THE WATER live in their own modules.
mountWhere({ narrow, reduced });
mountJourney({ narrow, reduced, getSceneH: () => sceneH });

// Bottom bar steps aside while the reader scrolls down, and returns on scroll-up or after a pause.
const bar = document.querySelector('.bottom-bar');
let lastY = scrollY, barTimer = null, upAcc = 0, barQuietUntil = 0;
// Scrolls the page makes for itself (opening or closing a closer tile) must not toggle the bar.
const quietBar = (ms = 1400) => { barQuietUntil = performance.now() + ms; };
addEventListener('scroll', () => {
  const y = scrollY;
  const dy = y - lastY;
  lastY = y;
  if (performance.now() < barQuietUntil) { upAcc = 0; return; }
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

// The arrow at the front door is an invitation; once the visitor is moving, it steps back.
const heroEl = document.querySelector('.hero');
const arrowWatch = () => heroEl.classList.toggle('scrolled', scrollY > 24);
addEventListener('scroll', arrowWatch, { passive: true });
arrowWatch();
checkEntered();

// The ending: a single drop, silence, breath. Then the word. Then the word itself becomes water:
// it sweats, the letters let go one by one and fall into the sea, and something large rises to look.
const cycle = document.getElementById('cycle');
if (cycle) {
  const cv = document.getElementById('cycle-canvas');
  const cc = cv.getContext('2d');
  const wordEl = cycle.querySelector('.cycle-word'), lastEl = cycle.querySelector('.cycle-last');
  let started = false, running = false, t0 = 0, cw = 0, ch = 0, landed = false, rings = [];
  const sizeCycle = () => { const r = cv.getBoundingClientRect(); cw = Math.round(r.width); ch = Math.round(r.height); cv.width = cw * dpr; cv.height = ch * dpr; cc.setTransform(dpr, 0, 0, dpr, 0, 0); };

  // ---- the melt ----
  const SEQ_AT = 2.4 + 3;                 // WATER begins to appear at 2.4 s; three seconds later it starts to sweat
  let letters = null, sweat = [], splashes = [], drips = [], whale = null, lastSplashT = -1;
  const G = 1500;                         // px/s^2
  function buildLetters() {
    letters = [];
    const sec = cycle.getBoundingClientRect();
    const take = (el, big) => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const spacing = parseFloat(cs.letterSpacing) || 0;
      const text = el.textContent;
      cc.font = font;
      const widths = [...text].map((chr) => cc.measureText(chr).width);
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
      let x = r.left - sec.left + (r.width - total) / 2;
      const y = r.top - sec.top + parseFloat(cs.fontSize) * 0.8;   // baseline
      [...text].forEach((chr, i) => {
        if (chr !== ' ') letters.push({ chr, x, y, w: widths[i], size: parseFloat(cs.fontSize), font, big, vy: 0, vx: 0, rot: 0, vr: 0, state: 0, t: 0, color: big ? 'rgba(244,249,251,1)' : 'rgba(244,249,251,0.62)' });
        x += widths[i] + spacing;
      });
    };
    take(wordEl, true); take(lastEl, false);
    wordEl.style.visibility = 'hidden'; lastEl.style.visibility = 'hidden';
    const bigs = letters.filter((l) => l.big), smalls = letters.filter((l) => !l.big);
    bigs.forEach((l, i) => { l.release = 2.6 + i * 0.55; });
    smalls.forEach((l, i) => { l.release = 2.6 + bigs.length * 0.55 + 0.6 + i * 0.045; });
  }
  function splash(x, level, big, t) {
    splashes.push({ x, t, big });
    const n = big ? 7 : 3;
    for (let i = 0; i < n; i++) drips.push({ x: x + (Math.random() - 0.5) * (big ? 30 : 10), y: level, vx: (Math.random() - 0.5) * (big ? 160 : 60), vy: -(big ? 220 : 110) * (0.5 + Math.random()), r: big ? 2.2 : 1.3, splashed: true });
    audio.plip(big ? 0.7 + Math.random() * 0.3 : 1.4 + Math.random() * 0.4);
    lastSplashT = t;
  }

  const frame = (now) => {
    if (!started) { running = false; return; }
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now;
    cc.clearRect(0, 0, cw, ch);
    const level = ch * 0.68 + (0.5 - breath.value) * 6;
    const surf = (x) => level + Math.sin(x * 0.02 + t * 0.6) * 1.2;

    // ---- the whale: a fluke rising to look, dripping, then sliding back under ----
    if (whale) {
      const u = (t - whale.t0);
      let lift = 0; // 0 under .. 1 fully up
      if (u < 1.6) lift = 1 - Math.pow(1 - u / 1.6, 3);
      else if (u < 3.8) lift = 1;
      else if (u < 5.4) lift = 1 - (u - 3.8) / 1.6;
      else whale = null;
      if (whale) {
        // a smaller fluke, thrown over at an angle the way a diving whale shows it, and leaning further as it goes under
        const hgt = ch * 0.15, wx = whale.x, baseY = level + 8, top = baseY - hgt * lift;
        const tilt = whale.dir * (0.5 + (1 - lift) * 0.35) + Math.sin(t * 0.9) * 0.04;
        cc.save(); cc.translate(wx, baseY); cc.rotate(tilt); cc.translate(-wx, -baseY);
        // fluke: two lobes with a notch, on a tapering stem
        cc.fillStyle = '#12334f';
        cc.strokeStyle = `rgba(127,242,255,${0.55 * lift})`; cc.lineWidth = 1.4;
        cc.beginPath();
        cc.moveTo(wx - hgt * 0.14, baseY);
        cc.bezierCurveTo(wx - hgt * 0.12, baseY - hgt * 0.45 * lift, wx - hgt * 0.1, top + hgt * 0.3, wx - hgt * 0.62, top + hgt * 0.12);
        cc.bezierCurveTo(wx - hgt * 0.5, top - hgt * 0.02, wx - hgt * 0.18, top - hgt * 0.02, wx, top + hgt * 0.12);
        cc.bezierCurveTo(wx + hgt * 0.18, top - hgt * 0.02, wx + hgt * 0.5, top - hgt * 0.02, wx + hgt * 0.62, top + hgt * 0.12);
        cc.bezierCurveTo(wx + hgt * 0.1, top + hgt * 0.3, wx + hgt * 0.12, baseY - hgt * 0.45 * lift, wx + hgt * 0.14, baseY);
        cc.closePath(); cc.fill(); cc.stroke();
        // wet sheen along the top edge
        cc.strokeStyle = `rgba(127,242,255,${0.35 * lift})`; cc.lineWidth = 1.2;
        cc.beginPath(); cc.moveTo(wx - hgt * 0.55, top + hgt * 0.13); cc.bezierCurveTo(wx - hgt * 0.3, top + hgt * 0.02, wx - hgt * 0.1, top + hgt * 0.04, wx, top + hgt * 0.12); cc.stroke();
        cc.restore();
        // water running off the edges while it is up
        if (lift > 0.6 && Math.random() < 0.5) drips.push({ x: wx + (Math.random() - 0.5) * hgt * 1.1, y: top + hgt * 0.16, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 40, r: 1.4, splashed: false });
        if (u > 1.0 && u < 1.05 && !whale.rang) { whale.rang = true; splashes.push({ x: wx, t, big: true }); audio.plip(0.5); }
        if (u > 5.0 && !whale.rang2) { whale.rang2 = true; splashes.push({ x: wx, t, big: true }); audio.plip(0.6); }
      }
    }

    // ---- the still water (drawn after the whale's stem so the body reads as under the surface) ----
    cc.fillStyle = `rgba(47,184,198,${0.22 + breath.value * 0.08})`;
    cc.beginPath(); cc.moveTo(0, ch);
    for (let x = 0; x <= cw; x += 6) cc.lineTo(x, surf(x));
    cc.lineTo(cw, ch); cc.closePath(); cc.fill();
    cc.strokeStyle = `rgba(127,242,255,${0.25 + breath.value * 0.3})`; cc.lineWidth = 1;
    cc.beginPath(); for (let x = 0; x <= cw; x += 6) x ? cc.lineTo(x, surf(x)) : cc.moveTo(x, level); cc.stroke();

    // ---- one drop, once ----
    if (!landed) {
      const fall = Math.max(0, t - 0.6);
      const y = reduced ? level : ch * 0.18 + fall * fall * 260;
      const a = Math.min(1, t / 0.5);
      if (y >= level || reduced) { landed = true; rings.push(t); audio.plip(1); }
      else { cc.globalAlpha = a; cc.fillStyle = '#bff4ff'; cc.beginPath(); cc.ellipse(cw / 2, y, 4, 5.5, 0, 0, Math.PI * 2); cc.fill(); cc.globalAlpha = 1; }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const k = (t - rings[i]) / 4; if (k > 1) { rings.splice(i, 1); continue; }
      cc.strokeStyle = `rgba(127,242,255,${(1 - k) * 0.6})`; cc.beginPath(); cc.ellipse(cw / 2, level, 8 + k * 120, (8 + k * 120) * 0.24, 0, 0, Math.PI * 2); cc.stroke();
    }

    // ---- the word becomes water ----
    if (!reduced && t >= SEQ_AT) {
      if (!letters) buildLetters();
      const s = t - SEQ_AT;
      // sweat: droplets form on the letters, swell, slide, and drip off
      if (s < 2.6 && Math.random() < dt * 9) {
        const held = letters.filter((l) => l.state === 0);
        if (held.length) { const l = held[Math.floor(Math.random() * held.length)]; sweat.push({ l, u: Math.random(), v: 0.2 + Math.random() * 0.6, t: 0, r: 0 }); }
      }
      for (let i = sweat.length - 1; i >= 0; i--) {
        const d = sweat[i]; d.t += dt;
        if (d.l.state !== 0) { sweat.splice(i, 1); continue; }
        d.r = Math.min(d.l.big ? 3.6 : 2.4, d.t * 2.6);
        const slide = Math.max(0, d.t - 0.9) * 28;
        const x = d.l.x + d.l.w * d.u, y = d.l.y - d.l.size * 0.72 + d.l.size * 0.72 * d.v + slide;
        if (y > d.l.y + 6) { drips.push({ x, y, vx: 0, vy: 30, r: d.r * 0.8, splashed: false }); sweat.splice(i, 1); continue; }
        cc.fillStyle = 'rgba(191,244,255,0.9)'; cc.beginPath(); cc.ellipse(x, y, d.r * 0.8, d.r, 0, 0, Math.PI * 2); cc.fill();
      }
      // letters: held, then falling, then gone
      letters.forEach((l) => {
        if (l.state === 0 && s >= l.release) { l.state = 1; l.vr = (Math.random() - 0.5) * 2.2; l.vx = (Math.random() - 0.5) * 30; }
        if (l.state === 1) {
          l.vy += G * dt; l.y += l.vy * dt; l.x += l.vx * dt; l.rot += l.vr * dt;
          if (l.y - l.size * 0.3 >= surf(l.x + l.w / 2)) { l.state = 2; splash(l.x + l.w / 2, level, l.big, t); }
        }
        if (l.state === 2) return;
        cc.save(); cc.font = l.font; cc.fillStyle = l.color; cc.textBaseline = 'alphabetic';
        cc.translate(l.x + l.w / 2, l.y); cc.rotate(l.rot); cc.translate(-(l.x + l.w / 2), -l.y);
        cc.fillText(l.chr, l.x, l.y); cc.restore();
      });
      // the whale comes to look once the last letter has gone under
      if (!whale && lastSplashT > 0 && letters.every((l) => l.state === 2) && t - lastSplashT > 1.6 && !frame.whaleDone) {
        whale = { t0: t, x: cw * (0.5 + (Math.random() - 0.5) * 0.3), dir: Math.random() < 0.5 ? -1 : 1 }; frame.whaleDone = true;
      }
    }

    // ---- drips and splash droplets ----
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i]; d.vy += G * 0.55 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y >= surf(d.x)) { if (!d.splashed) { splashes.push({ x: d.x, t, big: false }); } drips.splice(i, 1); continue; }
      cc.fillStyle = 'rgba(191,244,255,0.85)'; cc.beginPath(); cc.ellipse(d.x, d.y, d.r * 0.8, d.r * 1.2, 0, 0, Math.PI * 2); cc.fill();
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i], k = (t - sp.t) / (sp.big ? 2.6 : 1.4); if (k > 1) { splashes.splice(i, 1); continue; }
      const R = (sp.big ? 10 + 90 * (1 - Math.exp(-k * 3)) : 3 + 26 * (1 - Math.exp(-k * 3)));
      cc.strokeStyle = `rgba(127,242,255,${(1 - k) * (1 - k) * (sp.big ? 0.7 : 0.5)})`; cc.lineWidth = sp.big ? 1.4 : 1;
      cc.beginPath(); cc.ellipse(sp.x, level, R, R * 0.26, 0, 0, Math.PI * 2); cc.stroke();
      if (sp.big && k > 0.15) { cc.strokeStyle = `rgba(127,242,255,${(1 - k) * 0.3})`; cc.beginPath(); cc.ellipse(sp.x, level, R * 0.6, R * 0.16, 0, 0, Math.PI * 2); cc.stroke(); }
    }
    requestAnimationFrame(frame);
  };
  const off = breath.onPhase((p) => { if (started && landed && p === 'exhale') rings.push((performance.now() - t0) / 1000); });
  // The ending plays every time the visitor scrolls down into it, not once per page load.
  // clearStage() puts everything back to the dark, empty water; play() runs the scene from the first drop.
  function clearStage() {
    landed = false; rings = []; letters = null; sweat = []; splashes = []; drips = []; whale = null; lastSplashT = -1;
    frame.whaleDone = false; frame.last = 0;
    wordEl.style.visibility = ''; lastEl.style.visibility = '';
    wordEl.style.transition = 'none'; lastEl.style.transition = 'none';     // back to invisible at once, not on the fade's delay
    cycle.classList.remove('is-visible'); void cycle.offsetWidth;
    wordEl.style.transition = ''; lastEl.style.transition = '';
    cc.clearRect(0, 0, cw, ch);
  }
  function play() {
    clearStage();
    sizeCycle(); started = true; t0 = performance.now(); cycle.classList.add('is-visible');
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  // It starts once the scene is really on screen: half the section (or half of what the viewport can show of it),
  // measured against the upper 65% of the screen so it never starts while the tiles above it are still being read.
  // It re-arms once the visitor has scrolled most of it back out of view.
  const endObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.rootBounds) return;
      const need = Math.min(en.boundingClientRect.height, en.rootBounds.height) * 0.5;
      const seen = en.isIntersecting ? en.intersectionRect.height : 0;
      if (!started && seen >= need - 1) play();
      else if (started && seen < need * 0.3) { started = false; clearStage(); }
    });
  }, { rootMargin: '0px 0px -35% 0px', threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
  endObs.observe(cycle);
  // Keep the canvas matched to its section (rotation, URL bars, late layout).
  new ResizeObserver(() => { if (started) { sizeCycle(); if (letters) { letters = null; sweat = []; } } }).observe(cycle);
}

// Closer: Cup, Lab and You fold into one section. One opens at a time.
const trio = document.getElementById('closer');
if (trio) {
  const tiles = [...trio.querySelectorAll('.tile')];
  const closeBtn = trio.querySelector('.trio-close');
  const folded = ['grove', 'cup', 'lab', 'you'];
  let openName = null;
  let openSeq = 0;
  // Warm the modules while the reader nears the tiles so a tile opens onto a chapter that mounts at once.
  new IntersectionObserver((es, o) => {
    if (es.some((e) => e.isIntersecting)) { folded.forEach((n) => import(`./chapters/${n}.js`).catch(() => {})); o.disconnect(); }
  }, { rootMargin: '150% 0px' }).observe(trio);
  async function openChapter(name, scroll = true) {
    if (!folded.includes(name)) return;
    const seq = ++openSeq;
    folded.forEach((n) => { const sec = document.getElementById(n); sec.hidden = n !== name; });
    tiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.open === name)));
    closeBtn.hidden = false;
    openName = name;
    if (scroll) quietBar();
    const entry = chapters.get(name);
    // Mount first, at its real size, so the page has its final height before anything scrolls.
    await load(name, entry.el);
    if (seq !== openSeq) return;
    if (entry.mounted) { entry.ctx.resize(); entry.mod.resize?.(entry.ctx); }
    updateScene();
    if (scroll) requestAnimationFrame(() => {
      if (seq !== openSeq) return;
      const sec = document.getElementById(name);
      sec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      // Chapters above may finish mounting while the page travels; once it settles, land exactly on the panel.
      let done = false;
      const settle = () => {
        if (done) return; done = true;
        removeEventListener('scrollend', settle);
        if (seq === openSeq && Math.abs(sec.getBoundingClientRect().top) > 3) { quietBar(); sec.scrollIntoView({ behavior: 'auto', block: 'start' }); }
      };
      addEventListener('scrollend', settle);
      setTimeout(settle, reduced ? 100 : 1600);
    });
  }
  function closeChapter() {
    openSeq++;
    quietBar();
    scrollTo({ top: scrollY, behavior: 'instant' });   // stop any smooth scroll still travelling to the panel
    folded.forEach((n) => { document.getElementById(n).hidden = true; });
    tiles.forEach((t) => t.setAttribute('aria-pressed', 'false'));
    closeBtn.hidden = true; openName = null;
    // The panel collapses in the same frame the tiles are placed mid-screen: one change, and the ending stays below the fold.
    trio.scrollIntoView({ behavior: 'instant', block: 'center' });
    updateScene();
  }
  tiles.forEach((t) => t.addEventListener('click', () => { audio.plip(1.1); openName === t.dataset.open ? closeChapter() : openChapter(t.dataset.open); }));
  closeBtn.addEventListener('click', closeChapter);
  // The menu and the journey ask for a chapter before they travel to it.
  document.addEventListener('water:open', (e) => { if (folded.includes(e.detail) && openName !== e.detail) openChapter(e.detail, false); });
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
