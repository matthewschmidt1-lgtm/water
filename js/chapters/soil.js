// 04 — Soil. A cutaway of the ground. Paint rain with your finger and watch it
// run off, soak in, or go back to the sky. The aquifer fills as a water table.

const MAX = 250;
const MIST_MAX = 60;
const GROUNDS = {
  sand: { infil: 0.72, runoff: 0.13, sink: 1.7, label: 'Sand', top: '#b99a6a', grain: 'rgba(244,236,214,0.55)', grains: 700, gsize: 1.6,
          note: 'Sand: big grains, big gaps. Rain sinks fast.' },
  loam: { infil: 0.50, runoff: 0.35, sink: 1.0, label: 'Loam', top: '#6b4f3a', grain: 'rgba(217,199,163,0.28)', grains: 350, gsize: 1.2,
          note: 'Loam: a mix of sand, silt and clay. Some runs off, most soaks in.' },
  clay: { infil: 0.14, runoff: 0.71, sink: 0.35, label: 'Clay', top: '#7a4a3c', grain: 'rgba(60,30,25,0.45)', grains: 120, gsize: 0.9,
          note: 'Clay: tiny grains packed tight. Water sits on top and slides away.' },
};

let el, ctx, c, w, h;
let stat = null;               // offscreen static layer (gravel dots, bedrock, grass, tree)
let ground = GROUNDS.loam;
let pointerDown = false, px = 0, spawnAcc = 0;
let table = 0;                 // 0..1 fill of the aquifer band
let counts = { run: 0, soak: 0, evap: 0 };
let shown = { run: -1, soak: -1, evap: -1, table: -1 };
let readout = {};
let mistAcc = 0, time = 0;

// Preallocated particles: type 0 fall, 1 runoff, 2 infiltrate, 3 evaporate
const P = new Array(MAX);
for (let i = 0; i < MAX; i++) P[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, type: 0, age: 0, a: 1 };
const M = new Array(MIST_MAX);
for (let i = 0; i < MIST_MAX; i++) M[i] = { alive: false, x: 0, y: 0, age: 0, life: 1 };

// Layout (all in CSS px, recomputed on resize)
let L = {};
function layout() {
  const s = h * 0.36;
  L.surfL = s; L.surfR = s + h * 0.07;               // left high, right low
  L.top = L.surfR + h * 0.11;                         // bottom of topsoil (flat)
  L.sub = L.surfR + h * 0.27;                         // bottom of subsoil
  L.aqB = h * 0.84;                                   // bottom of aquifer band
  L.rockB = h;
}
function surfaceAt(x) { return L.surfL + (L.surfR - L.surfL) * (x / w); }
function tableY() { return L.aqB - (L.aqB - L.sub) * table; }

function buildStatic() {
  stat = document.createElement('canvas');
  stat.width = Math.round(w * ctx.dpr); stat.height = Math.round(h * ctx.dpr);
  const s = stat.getContext('2d');
  s.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // topsoil grains: size and count depend on the ground type
  for (let i = 0; i < ground.grains; i++) {
    const x = rnd() * w, y = surfaceAt(x) + 3 + rnd() * (L.top - surfaceAt(x) - 4);
    s.fillStyle = ground.grain;
    s.beginPath(); s.arc(x, y, ground.gsize * (0.6 + rnd()), 0, Math.PI * 2); s.fill();
  }
  if (ground.label === 'Clay') {
    s.strokeStyle = 'rgba(40,20,15,0.5)'; s.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const y = L.surfR + 8 + i * ((L.top - L.surfR - 12) / 9); s.beginPath(); s.moveTo(0, y - (L.surfR - L.surfL)); s.lineTo(w, y); s.stroke(); }
  }
  // gravel dots through the aquifer band
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = L.sub + rnd() * (L.aqB - L.sub);
    const r = 0.8 + rnd() * 2.2;
    s.fillStyle = `rgba(217,199,163,${0.12 + rnd() * 0.25})`;
    s.beginPath(); s.arc(x, y, r, 0, Math.PI * 2); s.fill();
  }
  // bedrock: dark slab with a few cracks
  s.fillStyle = '#0d0b0a';
  s.fillRect(0, L.aqB, w, h - L.aqB);
  s.strokeStyle = 'rgba(217,199,163,0.14)'; s.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * w, y = L.aqB + rnd() * (h - L.aqB);
    s.beginPath(); s.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 80; y += rnd() * 30; s.lineTo(x, y); }
    s.stroke();
  }
  s.strokeStyle = 'rgba(217,199,163,0.22)';
  s.beginPath(); s.moveTo(0, L.aqB); s.lineTo(w, L.aqB); s.stroke();
  // grass line + tufts
  s.strokeStyle = '#5c8a4a'; s.lineWidth = 2;
  s.beginPath(); s.moveTo(0, L.surfL); s.lineTo(w, L.surfR); s.stroke();
  s.lineWidth = 1.2;
  for (let x = 6; x < w; x += 9 + rnd() * 26) {
    const y = surfaceAt(x), n = 3 + (rnd() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const dx = (k - n / 2) * 2.2, hgt = 5 + rnd() * 9;
      s.beginPath(); s.moveTo(x + dx, y + 1); s.quadraticCurveTo(x + dx + dx * 0.8, y - hgt * 0.5, x + dx * 2.2, y - hgt); s.stroke();
    }
  }
  // one small tree + a few flowers (silhouettes)
  const tx = w * 0.16, ty = surfaceAt(w * 0.16);
  s.fillStyle = '#233d22';
  s.fillRect(tx - 2.5, ty - 44, 5, 46);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05, r = 14 + (i % 2) * 6;
    s.beginPath(); s.arc(tx + Math.cos(a) * 11, ty - 54 + Math.sin(a) * 8, r, 0, Math.PI * 2); s.fill();
  }
  for (let i = 0; i < 5; i++) {
    const fx = w * (0.3 + i * 0.05), fy = surfaceAt(fx);
    s.strokeStyle = '#3d6b3a'; s.beginPath(); s.moveTo(fx, fy); s.lineTo(fx, fy - 12); s.stroke();
    s.fillStyle = i % 2 ? '#e8b7c9' : '#f2d98a';
    s.beginPath(); s.arc(fx, fy - 14, 3, 0, Math.PI * 2); s.fill();
  }
}

function spawn(x) {
  for (let i = 0; i < MAX; i++) {
    const p = P[i];
    if (p.alive) continue;
    p.alive = true; p.type = 0; p.age = 0; p.a = 1;
    p.x = x + (Math.random() - 0.5) * 24; p.y = -4;
    p.vx = 0; p.vy = 0.25 + Math.random() * 0.15;
    return;
  }
}
function land(p) {
  const r = Math.random();
  if (r < ground.runoff) { p.type = 1; p.vx = 0.05 + Math.random() * 0.05; counts.run++; }
  else if (r < ground.runoff + ground.infil) { p.type = 2; p.vy = 0; p.vx = 0; counts.soak++; }
  else { p.type = 3; p.vy = -0.02 - Math.random() * 0.02; p.vx = (Math.random() - 0.5) * 0.02; counts.evap++; }
  p.age = 0;
}

function step(dt, breath) {
  const inhale = breath.phase === 'inhale';
  const sinkMul = ctx.reduced ? 0.8 : inhale ? 0.12 : 0.9 + (1 - breath.value) * 0.9;
  for (let i = 0; i < MAX; i++) {
    const p = P[i];
    if (!p.alive) continue;
    p.age += dt;
    if (p.type === 0) {
      p.vy += 0.0009 * dt; p.y += p.vy * dt;
      if (p.y >= surfaceAt(p.x)) { p.y = surfaceAt(p.x); land(p); }
    } else if (p.type === 1) {
      p.vx += 0.00004 * dt; p.x += p.vx * dt; p.y = surfaceAt(p.x) - 1;
      if (p.x > w + 4) p.alive = false;
    } else if (p.type === 2) {
      const inClay = p.y > L.top;
      const sp = ground.sink * (inClay ? 0.022 : 0.05) * sinkMul;
      p.y += sp * dt; p.x += Math.sin(p.age * 0.004 + i) * 0.02 * dt;
      if (p.y >= tableY()) { p.alive = false; table = Math.min(1, table + 0.006); }
    } else {
      p.y += p.vy * dt; p.x += p.vx * dt; p.a = Math.max(0, 1 - p.age / 2600);
      if (p.a <= 0) p.alive = false;
    }
  }
  // mist rising from the surface on exhale
  const exhaling = !inhale && !ctx.reduced;
  if (exhaling) {
    mistAcc += dt;
    while (mistAcc > 90) {
      mistAcc -= 90;
      for (let i = 0; i < MIST_MAX; i++) {
        const m = M[i];
        if (m.alive) continue;
        m.alive = true; m.x = Math.random() * w; m.y = surfaceAt(m.x); m.age = 0; m.life = 2200 + Math.random() * 1800;
        break;
      }
    }
  }
  for (let i = 0; i < MIST_MAX; i++) {
    const m = M[i];
    if (!m.alive) continue;
    m.age += dt; m.y -= 0.012 * dt; m.x += Math.sin(m.age * 0.002 + i) * 0.01 * dt;
    if (m.age > m.life) m.alive = false;
  }
}

function draw(breath) {
  // sky
  const sky = c.createLinearGradient(0, 0, 0, L.surfR);
  sky.addColorStop(0, '#0b2a44'); sky.addColorStop(1, '#3a6f8a');
  c.fillStyle = sky; c.fillRect(0, 0, w, L.surfR + 2);
  // ground bands
  c.fillStyle = ground.top;
  c.beginPath(); c.moveTo(0, L.surfL); c.lineTo(w, L.surfR); c.lineTo(w, L.top); c.lineTo(0, L.top); c.closePath(); c.fill();
  c.fillStyle = '#2e2117'; c.fillRect(0, L.top, w, L.sub - L.top);
  c.fillStyle = '#3b2c20'; c.fillRect(0, L.sub, w, L.aqB - L.sub);
  // the water table: turquoise fill rising through the gravel, glowing on inhale
  const ty = tableY();
  if (table > 0) {
    const g = c.createLinearGradient(0, ty, 0, L.aqB);
    g.addColorStop(0, `rgba(127,242,255,${0.35 + breath.value * 0.2})`);
    g.addColorStop(1, `rgba(47,184,198,${0.55 + breath.value * 0.15})`);
    c.fillStyle = g; c.fillRect(0, ty, w, L.aqB - ty);
    c.strokeStyle = `rgba(127,242,255,${0.4 + breath.value * 0.4})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, ty); c.lineTo(w, ty); c.stroke();
  }
  c.drawImage(stat, 0, 0, w, h);
  // particles
  for (let i = 0; i < MAX; i++) {
    const p = P[i];
    if (!p.alive) continue;
    if (p.type === 0) { c.fillStyle = '#7ff2ff'; c.fillRect(p.x - 0.7, p.y - 5, 1.4, 6); }
    else if (p.type === 1) { c.fillStyle = 'rgba(127,242,255,0.85)'; c.fillRect(p.x - 2, p.y - 1, 4, 2); }
    else if (p.type === 2) { c.fillStyle = 'rgba(127,242,255,0.6)'; c.beginPath(); c.arc(p.x, p.y, 1.6, 0, Math.PI * 2); c.fill(); }
    else { c.fillStyle = `rgba(219,233,242,${p.a * 0.7})`; c.beginPath(); c.arc(p.x, p.y, 2 + p.age / 900, 0, Math.PI * 2); c.fill(); }
  }
  for (let i = 0; i < MIST_MAX; i++) {
    const m = M[i];
    if (!m.alive) continue;
    const k = m.age / m.life, a = (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7) * 0.12;
    c.fillStyle = `rgba(219,233,242,${a})`;
    c.beginPath(); c.arc(m.x, m.y, 6 + k * 14, 0, Math.PI * 2); c.fill();
  }
}

function updateReadout() {
  if (counts.run !== shown.run) readout.run.textContent = (shown.run = counts.run);
  if (counts.soak !== shown.soak) readout.soak.textContent = (shown.soak = counts.soak);
  if (counts.evap !== shown.evap) readout.evap.textContent = (shown.evap = counts.evap);
  const t = Math.round(table * 200) / 2;
  if (t !== shown.table) { shown.table = t; readout.bar.style.width = t + '%'; }
}

export default {
  mount(section, context) {
    el = section; ctx = context; c = ctx.c2d; w = ctx.w; h = ctx.h;
    layout(); buildStatic();
    el.style.background = '#0b2a44';
    el.insertAdjacentHTML('beforeend', `
      <style>
        #soil .chapter-canvas { touch-action: none; cursor: crosshair; -webkit-touch-callout: none; }
        @media (max-width: 820px) { #soil .chapter-canvas { touch-action: pan-y; } #soil .soil-readout { width: 100%; gap: 6px 12px; letter-spacing: 0.14em; } #soil .table-wrap { max-width: none; } }
        #soil .soil-readout { display: grid; grid-template-columns: repeat(3, auto); gap: 6px 22px; margin-top: 18px; font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); width: max-content; }
        #soil .soil-readout b { display: block; color: var(--cyan); font-size: 1.2rem; font-weight: 400; letter-spacing: 0.05em; }
        #soil .ground-note { margin: 8px 0 0; color: var(--mist); font-size: 0.9rem; min-height: 1.4em; }
        #soil .table-wrap { margin-top: 14px; font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); max-width: 320px; }
        #soil .table-bar { height: 6px; margin-top: 6px; border-radius: 3px; background: rgba(244,249,251,0.1); overflow: hidden; }
        #soil .table-bar i { display: block; height: 100%; width: 0; background: var(--turquoise); transition: width 0.3s; }
        #soil .paint-hint { font-size: 0.8rem; color: var(--muted); font-style: italic; }
      </style>
      <div class="chapter-body right">
        <p class="chapter-kicker">04 — Soil</p>
        <h2>Where does the rain go?</h2>
        <p class="lede">Press and hold on the sky to make it rain. Then watch the ground decide.</p>
        <div class="chip-row" role="group" aria-label="Ground type">
          <button class="chip" data-g="sand" aria-pressed="false">Sand</button>
          <button class="chip" data-g="loam" aria-pressed="true">Loam</button>
          <button class="chip" data-g="clay" aria-pressed="false">Clay</button>
        </div>
        <p class="ground-note">${GROUNDS.loam.note}</p>
        <div class="soil-readout">
          <span>ran off<b data-r="run">0</b></span>
          <span>soaked in<b data-r="soak">0</b></span>
          <span>evaporated<b data-r="evap">0</b></span>
        </div>
        <div class="table-wrap">water table<div class="table-bar"><i></i></div></div>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: some water runs away. Some soaks in. Some goes back to the sky.</p>
          <div class="l2"><span class="term">Discover</span><p>Sandy ground drinks fast because its grains are big, with big gaps between them. Clay grains are tiny and packed tight, so water waits on top and slides away. A paved city is like clay everywhere: more runoff, more floods.</p></div>
          <div class="l3"><span class="term">Infiltration</span><p>The rate depends on porosity (how much empty space the ground holds) and permeability (how well the spaces connect). Water that gets through recharges groundwater; the top of that saturated zone is the water table. Aquifers supply drinking water for about half the world's people.</p></div>
          <button class="depth-more">Discover</button>
        </div>
      </div>`);
    readout.run = el.querySelector('[data-r="run"]');
    readout.soak = el.querySelector('[data-r="soak"]');
    readout.evap = el.querySelector('[data-r="evap"]');
    readout.bar = el.querySelector('.table-bar i');
    el.querySelectorAll('.chip[data-g]').forEach((b) => b.addEventListener('click', () => {
      ground = GROUNDS[b.dataset.g];
      buildStatic();
      el.querySelector('.ground-note').textContent = ground.note;
      el.querySelectorAll('.chip[data-g]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      ctx.audio.plip(1.1);
    }));
    const cv = ctx.canvas;
    cv.addEventListener('pointerdown', (e) => { pointerDown = true; px = e.clientX - cv.getBoundingClientRect().left; for (let k = 0; k < 6; k++) spawn(px); try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
    cv.addEventListener('pointermove', (e) => { if (pointerDown) px = e.clientX - cv.getBoundingClientRect().left; });
    const up = () => { pointerDown = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
  },
  tick(dt, breath) {
    time += dt;
    if (pointerDown) {
      spawnAcc += dt;
      const gap = ctx.reduced ? 120 : 34;
      while (spawnAcc > gap) { spawnAcc -= gap; spawn(px); }
    }
    step(dt, breath);
    draw(breath);
    updateReadout();
  },
  resize(context) {
    w = context.w; h = context.h; layout(); buildStatic();
  },
};
