// ONE WATER — one droplet that behaves believably.
// Gravity along a surface you can tilt. Drops run, pin, pool in the low place, merge into one,
// split around a rock, bead on a leaf, spread on glass, sink into soil, freeze, melt, evaporate, condense.
// No explanation until the visitor asks. Everything here is physics or the visitor's hand.

const G = 0.0016;                   // px / ms^2 along the surface, scaled by slope
const MAX_DROPS = 48, MAX_RIPPLES = 24, MAX_VAPOR = 70, MAX_ROCKS = 4;

// Material behavior: how water clings, slides, spreads and sinks.
const MAT = {
  glass: { mu: 0.0022, pin: 0.05, spread: 1.55, flat: 0.55, absorb: 0,      color: '#1a2d44', grain: 0,   label: 'glass' },
  leaf:  { mu: 0.0010, pin: 0.09, spread: 0.85, flat: 0.95, absorb: 0,      color: '#1f4a2e', grain: 0.4, label: 'leaf'  },
  rock:  { mu: 0.0045, pin: 0.16, spread: 1.15, flat: 0.75, absorb: 0,      color: '#3a3f44', grain: 0.8, label: 'rock'  },
  soil:  { mu: 0.0040, pin: 0.12, spread: 1.30, flat: 0.70, absorb: 0.0035, color: '#3b2a1c', grain: 1,   label: 'soil'  },
};

let el, ctx, c, w, h, goo, gc, reduced, audio, breathRef;
let mat = MAT.glass, T = 20, tilt = 0.10, humidity = 0;
let drops = [], rocks = [], ripples = [], vapor = [];
let time = 0, script = 0, scriptT = 0, merged = false, revealed = false;
let bgCanvas = null, dragging = false, dragX = 0, dragMoved = false, downT = 0, downX = 0, downY = 0;
let seen = { ice: false, bead: false, soak: false, split: false, steam: false, dew: false };
let ui = {}, tapHint = 0;

// ---------- surface ----------
function baseY() { return h * 0.66; }
function dipX() { return w * 0.62; }
function surfY(x) {
  const d = (x - dipX()) / (w * 0.13);
  return baseY() + tilt * (x - w * 0.5) + h * 0.06 * Math.exp(-d * d);
}
function slopeAt(x) { return (surfY(x + 2) - surfY(x - 2)) / 4; }
function radiusOf(m) { return Math.sqrt(m / Math.PI); }

// ---------- pools ----------
function newDrop(x, y, m, vx = 0, vy = 0, air = true) {
  if (drops.length >= MAX_DROPS) drops.shift();
  const d = { x, y, vx, vy, m, r: radiusOf(m), air, ice: 0, still: 0, alive: true, hot: 0 };
  drops.push(d);
  return d;
}
function ripple(x, y, big) {
  if (ripples.length >= MAX_RIPPLES) ripples.shift();
  ripples.push({ x, y, t: 0, big });
}
function puff(x, y) {
  if (vapor.length >= MAX_VAPOR) vapor.shift();
  vapor.push({ x, y, t: 0, life: 2200 + Math.random() * 1600, vx: (Math.random() - 0.5) * 0.01 });
}

// ---------- physics ----------
function step(dt, breath) {
  const b = breath.value;
  // rocks sit on the surface
  for (const k of rocks) k.y = surfY(k.x) - k.r * 0.55;

  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (!d.alive) continue;
    d.r = radiusOf(d.m);

    // ---- temperature: freeze / melt / evaporate ----
    if (T < 0) { d.ice = Math.min(1, d.ice + dt / (1800 + d.m * 4)); if (d.ice >= 1 && !seen.ice) { seen.ice = true; say('It froze. Slowly, from the outside in.'); } }
    else if (d.ice > 0) { d.ice = Math.max(0, d.ice - dt / 1400); }
    if (T > 35 && d.ice === 0) {
      const rate = (T - 35) * 0.00018 * dt;
      d.m -= rate * Math.max(2, d.r * 0.4);
      d.hot += dt;
      if (d.hot > 120 - Math.min(90, T)) { d.hot = 0; puff(d.x + (Math.random() - 0.5) * d.r, d.y - d.r); humidity = Math.min(1, humidity + 0.02); if (!seen.steam) { seen.steam = true; say('It is leaving. Not gone, just up.'); } }
      if (d.m < 2) { d.alive = false; continue; }
    }
    if (d.ice >= 1) { d.vx = 0; d.vy = 0; d.air = false; continue; }

    if (d.air) {
      d.vy += G * 1.4 * dt; d.y += d.vy * dt; d.x += d.vx * dt;
      const sy = surfY(d.x);
      if (d.y >= sy - d.r * 0.6) {
        d.y = sy; d.air = false;
        const hit = pooledAt(d.x, d);
        if (hit) { ripple(d.x, sy, hit.m > 400); d.vx += hit.vx * 0.3; }
        else if (d.m > 60) ripple(d.x, sy, false);
        d.vx *= 0.3; d.vy = 0;
        audio.plip?.(0.8 + Math.min(0.8, d.m / 600));
      }
      continue;
    }

    // ---- on the surface: gravity along the slope, pinning, friction ----
    const s = slopeAt(d.x);
    const drive = G * s * dt * (1 + d.m / 900);
    const pinned = Math.abs(s) * (d.m + 40) < mat.pin * 60 && Math.abs(d.vx) < 0.004;
    if (!pinned) {
      d.vx += drive;
      d.vx *= 1 - mat.mu * dt * (1 + 12 / Math.sqrt(d.m));
    } else d.vx *= 0.6;
    // wobble with the breath while sitting still: the surface of a resting drop is never quite still
    d.x += d.vx * dt;
    d.y = surfY(d.x);
    // the world has edges: water gathers against them instead of vanishing
    if (d.x < d.r * 0.8) { d.x = d.r * 0.8; d.vx = 0; } else if (d.x > w - d.r * 0.8) { d.x = w - d.r * 0.8; d.vx = 0; }

    // ---- rocks: deflect, and split a fast big drop ----
    for (const k of rocks) {
      const dx = d.x - k.x, dy = d.y - k.y, dist = Math.hypot(dx, dy), minD = k.r + d.r * 0.7;
      if (dist < minD) {
        if (d.m > 260 && Math.abs(d.vx) > 0.05 && drops.length < MAX_DROPS - 1) {
          const side = Math.sign(d.vx) || 1;
          const a = newDrop(k.x - side * (k.r + d.r * 0.4), 0, d.m * 0.5, d.vx * 0.55, 0, false);
          a.x = k.x + side * (k.r + d.r * 0.5) ; a.y = surfY(a.x) ; a.vx = d.vx * 0.6;
          d.m *= 0.5; d.x = k.x + side * (k.r + d.r * 0.5); d.y = surfY(d.x); d.vx *= 0.45;
          d.r = radiusOf(d.m);
          if (!seen.split) { seen.split = true; say('It went around. Both ways.'); }
          audio.plip?.(1.4);
        } else {
          d.x = k.x + (dx < 0 ? -1 : 1) * minD; d.y = surfY(d.x); d.vx *= -0.15;
        }
      }
    }

    // ---- soil drinks ----
    if (mat.absorb > 0) {
      d.m -= mat.absorb * dt * Math.max(1, d.r * 0.25) * (1 + (1 - b) * 0.5);
      if (d.m < 3) { d.alive = false; soak(d.x); if (!seen.soak) { seen.soak = true; say('Gone. Into the ground, not away.'); } }
    }
    if (!seen.bead && mat === MAT.leaf && time > 4000 && Math.abs(d.vx) < 0.002) { seen.bead = true; say('It pulled itself into a bead.'); }
  }

  // ---- merging: when two drops touch, they become one ----
  for (let i = 0; i < drops.length; i++) {
    const a = drops[i]; if (!a.alive || a.air || a.ice >= 1) continue;
    for (let j = i + 1; j < drops.length; j++) {
      const bd = drops[j]; if (!bd.alive || bd.air || bd.ice >= 1) continue;
      const dist = Math.abs(a.x - bd.x);
      if (dist < (a.r + bd.r) * 0.85) {
        const m = a.m + bd.m;
        a.x = (a.x * a.m + bd.x * bd.m) / m; a.vx = (a.vx * a.m + bd.vx * bd.m) / m;
        a.m = m; a.r = radiusOf(m); a.y = surfY(a.x); a.ice = Math.min(a.ice, bd.ice);
        bd.alive = false;
        ripple(a.x, a.y, m > 500);
        if (!merged) { merged = true; onMerge(); }
      }
    }
  }
  drops = drops.filter((d) => d.alive);

  // ---- condensation: humid air over a cool surface gives dew ----
  if (humidity > 0.15 && T < 22) {
    humidity -= dt * 0.00004;
    if (Math.random() < dt * 0.0012 * humidity && drops.length < MAX_DROPS) {
      const x = w * 0.12 + Math.random() * w * 0.76;
      newDrop(x, surfY(x), 6 + Math.random() * 10, 0, 0, false);
      if (!seen.dew) { seen.dew = true; say('Back. As dew.'); }
    }
  }
  humidity = Math.max(0, humidity - dt * 0.000004);

  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 2200) ripples.splice(i, 1); }
  for (let i = vapor.length - 1; i >= 0; i--) {
    const v = vapor[i]; v.t += dt; v.y -= (0.018 + b * 0.01) * dt; v.x += v.vx * dt + Math.sin(v.t * 0.003 + i) * 0.02;
    if (v.t > v.life) vapor.splice(i, 1);
  }
}
function pooledAt(x, self) {
  for (const d of drops) if (d !== self && d.alive && !d.air && Math.abs(d.x - x) < d.r) return d;
  return null;
}
const stains = [];
function soak(x) { stains.push({ x, t: 0 }); if (stains.length > 12) stains.shift(); }

// ---------- the scripted first minute: one drop, then another, then one water ----------
function runScript(dt) {
  scriptT += dt;
  if (script === 0 && scriptT > 1400) { script = 1; newDrop(w * 0.30, -10, 300, 0, 0); }
  if (script === 1 && scriptT > 6500) { script = 2; newDrop(w * 0.36, -10, 260, 0, 0); }
  if (script === 2 && scriptT > 14000 && !merged) { script = 3; newDrop(w * 0.58, -10, 220, 0, 0); }
}
function onMerge() {
  setTimeout(() => { ui.one.classList.add('on'); }, 900);
  setTimeout(() => { ui.one.classList.remove('on'); reveal(); }, 6500);
}
function reveal() {
  if (revealed) return;
  revealed = true;
  el.querySelector('.one-controls').classList.add('on');
  el.querySelector('.one-hint').classList.add('on');
}
let sayT = null;
function say(text) {
  const line = ui.line; line.textContent = text; line.classList.add('on');
  clearTimeout(sayT); sayT = setTimeout(() => line.classList.remove('on'), 4200);
}

// ---------- drawing ----------
function drawSurface(b) {
  // the surface, in the material's color, with grain
  c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) c.lineTo(x, surfY(x));
  c.lineTo(w, h); c.closePath();
  c.fillStyle = mat.color; c.fill();
  c.strokeStyle = 'rgba(244,249,251,0.35)'; c.lineWidth = 1;
  c.beginPath(); for (let x = 0; x <= w; x += 6) x === 0 ? c.moveTo(x, surfY(x)) : c.lineTo(x, surfY(x)); c.stroke();
  if (mat.grain > 0) {
    c.fillStyle = mat === MAT.leaf ? 'rgba(120,200,140,0.18)' : mat === MAT.soil ? 'rgba(217,199,163,0.16)' : 'rgba(200,205,210,0.14)';
    let seed = 11;
    const n = Math.round(mat.grain * 220);
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807) % 2147483647; const x = (seed / 2147483647) * w;
      seed = (seed * 16807) % 2147483647; const yy = surfY(x) + 4 + (seed / 2147483647) * (h - surfY(x) - 8);
      c.fillRect(x, yy, mat === MAT.leaf ? 6 : 1.5, mat === MAT.leaf ? 0.8 : 1.5);
    }
    if (mat === MAT.leaf) { // a midrib
      c.strokeStyle = 'rgba(160,220,170,0.25)'; c.beginPath(); for (let x = 0; x <= w; x += 8) x === 0 ? c.moveTo(x, surfY(x) + 18) : c.lineTo(x, surfY(x) + 18); c.stroke();
    }
  }
  for (const s of stains) { s.t += 16; const a = Math.max(0, 0.35 - s.t / 12000); c.fillStyle = `rgba(20,40,60,${a})`; c.beginPath(); c.ellipse(s.x, surfY(s.x) + 10, 16 + s.t / 400, 8 + s.t / 900, 0, 0, Math.PI * 2); c.fill(); }
  for (const k of rocks) {
    c.fillStyle = '#5a6068'; c.beginPath(); c.ellipse(k.x, k.y, k.r, k.r * 0.8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(244,249,251,0.15)'; c.beginPath(); c.ellipse(k.x - k.r * 0.3, k.y - k.r * 0.35, k.r * 0.35, k.r * 0.2, 0, 0, Math.PI * 2); c.fill();
  }
}
function draw(breath) {
  const b = breath.value;
  c.clearRect(0, 0, w, h);
  drawSurface(b);
  // ripples: rings on the surface where water met water
  for (const r of ripples) {
    const k = r.t / 2200, R = 6 + k * (r.big ? 70 : 40), a = (1 - k) * 0.55;
    c.strokeStyle = `rgba(127,242,255,${a})`; c.lineWidth = 1;
    c.beginPath(); c.ellipse(r.x, r.y, R, R * 0.28, 0, 0, Math.PI * 2); c.stroke();
  }
  // vapor
  for (const v of vapor) {
    const k = v.t / v.life, a = (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * 0.28;
    c.fillStyle = `rgba(219,233,242,${a})`; c.beginPath(); c.arc(v.x, v.y, 3 + k * 9, 0, Math.PI * 2); c.fill();
  }
  // ice crystals draw on the scene layer, drops draw on the goo layer
  gc.clearRect(0, 0, w, h);
  gc.fillStyle = 'rgb(0,190,255)';   // after blur+contrast this lands on a clean cyan; the scene's dark ground softens it
  for (const d of drops) {
    if (d.ice >= 1) { drawIce(d); continue; }
    const wob = 1 + Math.sin(time * 0.006 + d.x) * 0.02 * (d.air ? 0 : 1);
    const spread = d.air ? 1 : mat.spread * (1 + Math.min(0.9, d.m / 900));
    const rx = d.r * spread * wob, ry = d.air ? d.r * 1.15 : d.r * mat.flat / (1 + Math.min(0.6, d.m / 1500));
    const cy = d.air ? d.y : d.y - ry * 0.85;
    gc.globalAlpha = 1 - d.ice * 0.6;
    gc.beginPath();
    if (d.air) { gc.moveTo(d.x, cy - ry * 1.5); gc.bezierCurveTo(d.x + rx * 1.1, cy - ry * 0.2, d.x + rx, cy + ry, d.x, cy + ry); gc.bezierCurveTo(d.x - rx, cy + ry, d.x - rx * 1.1, cy - ry * 0.2, d.x, cy - ry * 1.5); }
    else gc.ellipse(d.x, cy, rx, ry, 0, 0, Math.PI * 2);
    gc.fill();
    if (d.ice > 0 && d.ice < 1) { // frost creeping in from the edge
      c.strokeStyle = `rgba(230,245,255,${d.ice * 0.8})`; c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(d.x, cy, rx * (1 - d.ice * 0.1), ry * (1 - d.ice * 0.1), 0, 0, Math.PI * 2); c.stroke();
    }
    // highlight: light on the top of every drop (scene layer, above the goo visually via order in DOM)
    c.fillStyle = `rgba(255,255,255,${0.35 + b * 0.25})`;
    c.beginPath(); c.ellipse(d.x - rx * 0.3, cy - ry * 0.45, Math.max(1.2, rx * 0.22), Math.max(0.8, ry * 0.16), -0.4, 0, Math.PI * 2); c.fill();
  }
  gc.globalAlpha = 1;
}
function drawIce(d) {
  const R = d.r * 1.15;
  c.save(); c.translate(d.x, d.y - R * 0.5);
  c.fillStyle = 'rgba(225,242,255,0.85)'; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1;
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; i ? c.lineTo(Math.cos(a) * R, Math.sin(a) * R * 0.6) : c.moveTo(Math.cos(a) * R, Math.sin(a) * R * 0.6); } c.closePath(); c.fill(); c.stroke();
  c.restore();
}

// ---------- module ----------
export default {
  mount(section, context) {
    el = section; ctx = context; c = ctx.c2d; w = ctx.w; h = ctx.h; reduced = ctx.reduced; audio = ctx.audio; breathRef = ctx.breath;
    goo = document.createElement('canvas'); goo.className = 'one-goo'; gc = goo.getContext('2d');
    ctx.canvas.after(goo);
    el.style.background = 'linear-gradient(#04111f, #0a2238)';
    el.insertAdjacentHTML('beforeend', `
      <style>
        #one .chapter-canvas { z-index: 1; touch-action: none; cursor: crosshair; }
        #one .one-goo { position: absolute; inset: 0; z-index: 0; pointer-events: none; filter: blur(3.5px) contrast(22) saturate(0.6); opacity: 0.92; }
        #one .one-word { position: absolute; left: 0; right: 0; top: 30%; text-align: center; margin: 0; z-index: 2; pointer-events: none;
          font-family: var(--serif); font-size: clamp(1.2rem, 3vw, 1.7rem); letter-spacing: 0.35em; text-transform: lowercase; color: var(--mist);
          opacity: 0; transition: opacity 2.4s ease; }
        #one .one-word.on { opacity: 0.9; }
        #one .one-line { position: absolute; left: 0; right: 0; top: 76%; text-align: center; margin: 0; z-index: 2; pointer-events: none;
          font-family: var(--serif); font-style: italic; color: var(--mist); font-size: clamp(1rem, 2.2vw, 1.25rem); opacity: 0; transition: opacity 1.2s ease; }
        #one .one-line.on { opacity: 1; }
        #one .one-controls { position: absolute; left: 16px; right: 16px; bottom: 84px; z-index: 3; display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; justify-content: center;
          opacity: 0; pointer-events: none; transition: opacity 2s ease; }
        #one .one-controls.on { opacity: 1; pointer-events: auto; }
        #one .one-controls label { font-size: 0.66rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 10px; }
        #one .one-controls input[type=range] { width: 160px; accent-color: var(--accent); }
        #one .one-controls .value { color: var(--accent); font-size: 0.85rem; letter-spacing: 0.05em; text-transform: none; min-width: 3.5em; }
        #one .one-hint { position: absolute; left: 80px; right: 80px; top: 22px; text-align: center; margin: 0; z-index: 2; pointer-events: none;
          font-size: 0.66rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); opacity: 0; transition: opacity 2s ease; }
        #one .one-hint.on { opacity: 0.8; }
        #one .chapter-body { display: none; }
        @media (max-width: 820px) {
          section#one { min-height: var(--scene-h, 62vh) !important; }
          #one .one-controls { bottom: 70px; gap: 8px 14px; }
          #one .one-hint { left: 64px; right: 64px; top: 18px; }
          #one .one-controls input[type=range] { width: 120px; }
          #one .one-word { top: 26%; }
          #one .one-line { top: 72%; }
        }
      </style>
      <p class="one-word">one water</p>
      <p class="one-line"></p>
      <p class="one-hint">tap the sky · drag to tilt · press the ground</p>
      <div class="one-controls">
        <div class="chip-row" role="group" aria-label="Surface">
          <button class="chip" data-m="glass" aria-pressed="true">Glass</button>
          <button class="chip" data-m="leaf" aria-pressed="false">Leaf</button>
          <button class="chip" data-m="rock" aria-pressed="false">Rock</button>
          <button class="chip" data-m="soil" aria-pressed="false">Soil</button>
        </div>
        <label>Cold <input type="range" min="-20" max="90" value="20" step="1" aria-label="Temperature"> Hot <span class="value">20 °C</span></label>
      </div>
      <div class="chapter-body">
        <div class="depth" data-level="0">
          <p class="l1">Water sticks to itself. That is why a drop holds together, why two drops become one, and why it beads on a leaf but spreads on glass.</p>
          <div class="l2"><span class="term">Discover</span><p>On a slope a small drop stays put: its edge grips the surface. Make it bigger and gravity wins. A rock in the way does not stop it; it goes around. Soil drinks it; glass does not. Cold slows the molecules until they lock into a lattice. Heat sends them off one by one as vapor, and a cool surface collects them back as dew.</p></div>
          <div class="l3"><span class="term">Cohesion, adhesion, contact angle</span><p>Water molecules attract each other (cohesion) through hydrogen bonds, and attract many surfaces (adhesion). The balance sets the contact angle: low on clean glass, high on waxy leaves. A drop starts to slide when gravity along the slope overcomes the difference between its advancing and receding contact angles (contact-angle hysteresis), which is why big drops run and small ones cling. Infiltration is water entering the pore spaces of a porous material.</p>
          <p class="source">Source: <a href="https://www.usgs.gov/special-topics/water-science-school/science/adhesion-and-cohesion-water" target="_blank" rel="noopener">USGS Water Science School</a></p></div>
          <button class="depth-more">Why?</button>
        </div>
      </div>`);
    ui.one = el.querySelector('.one-word'); ui.line = el.querySelector('.one-line');
    this.resize(ctx);

    // chips: the surface
    el.querySelectorAll('.chip[data-m]').forEach((btn) => btn.addEventListener('click', () => {
      mat = MAT[btn.dataset.m];
      el.querySelectorAll('.chip[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
      audio.plip?.(1.1);
    }));
    const range = el.querySelector('input[type=range]'), val = el.querySelector('.value');
    range.addEventListener('input', () => { T = parseInt(range.value, 10); val.textContent = `${T} °C`; });

    // the hand: tap the sky to add a drop, drag to tilt the world, press the ground to place (or lift) a rock
    const cv = ctx.canvas;
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(); downX = e.clientX - r.left; downY = e.clientY - r.top; dragX = downX; dragging = true; dragMoved = false; downT = performance.now();
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = cv.getBoundingClientRect(); const x = e.clientX - r.left;
      if (Math.abs(x - downX) > 8) dragMoved = true;
      if (dragMoved) { tilt = Math.max(-0.28, Math.min(0.28, tilt + (x - dragX) * 0.0009)); }
      dragX = x;
    });
    const up = (e) => {
      if (!dragging) return; dragging = false;
      if (dragMoved) return;
      const x = downX, y = downY, held = performance.now() - downT;
      if (y < surfY(x) - 10 && held < 500) { newDrop(x, y, 160 + Math.random() * 220, 0, 0.05); }
      else {
        const hit = rocks.findIndex((k) => Math.hypot(k.x - x, k.y - y) < k.r + 10);
        if (hit >= 0) rocks.splice(hit, 1);
        else if (rocks.length < MAX_ROCKS) rocks.push({ x, y: surfY(x), r: 14 + Math.random() * 8 });
        audio.plip?.(0.6);
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { dragging = false; });
  },
  tick(dt, breath) {
    time += dt;
    if (!reduced) runScript(dt); else if (script === 0) { script = 3; newDrop(w * 0.3, surfY(w * 0.3), 170, 0, 0, false); newDrop(w * 0.62, surfY(w * 0.62), 150, 0, 0, false); }
    step(dt, breath);
    draw(breath);
  },
  resize(context) {
    w = context.w; h = context.h;
    goo.width = Math.round(w * context.dpr); goo.height = Math.round(h * context.dpr);
    goo.style.width = w + 'px'; goo.style.height = h + 'px';
    gc.setTransform(context.dpr, 0, 0, context.dpr, 0, 0);
  },
};
