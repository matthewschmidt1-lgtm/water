// Sky. A stylized cloud drifts across a dawn sky.
// Inhale gathers it; exhale loosens it and lets a few drops go. On each exhale one drop lets go and says where it has been.
// Nothing here needs a touch. A touch is welcome anyway.

const LINES = [
  'I\'ve been here before.',
  'This water may have been ocean.',
  'It may have been snow.',
  'It may have passed through a tree.',
  'It may have been inside you.',
];

// Puff layout in cloud units: [ox, oy, r]. Fixed so the cloud is the same cloud every frame.
const PUFFS = [
  [0, 0, 1.0], [-0.9, 0.15, 0.78], [0.85, 0.1, 0.82], [-1.6, 0.38, 0.56], [1.6, 0.32, 0.6],
  [-0.45, -0.55, 0.7], [0.4, -0.62, 0.72], [-0.2, 0.45, 0.7], [0.9, 0.5, 0.6], [-1.1, 0.52, 0.5],
  [2.2, 0.55, 0.4], [-2.25, 0.6, 0.38], [1.3, -0.3, 0.52],
];
const WISP = [[0, 0, 0.62], [0.62, 0.12, 0.46], [-0.58, 0.14, 0.42], [0.08, -0.3, 0.42]];
const MAX_DROPS = 28;

let c, w, h, reduced, audio;
let sky = null, sun = null, cloudLoose = null, cloudTight = null, wisp = null, dropSpr = null, glowSpr = null;
let S = 1;                     // sprite scale (device px per css px)
let unit = 40;                 // cloud unit size in px
let high = false;              // sharing the sky with a tree: the cloud sits high and speaks above itself
let anchorX = 0, cy = 0;       // where the cloud lives
let t = 0, glow = 0.5;
let sayEl = null, sayIdx = 0, inside = false;
let offPhase = null;

// Preallocated droplet pool.
const drops = [];
for (let i = 0; i < MAX_DROPS; i++) drops.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, delay: 0, r: 3, bright: false, active: false });

const canvasOf = (cw, ch) => { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(cw)); cv.height = Math.max(1, Math.ceil(ch)); return cv; };

// A lit cumulus, drawn once: pale lit tops, cool shaded underside, a faint dawn bounce below.
// k = 0 loose and soft-edged, k = 1 gathered: puffs pulled in, edges firm.
function renderCloud(list, bw, bh, k) {
  const cw = bw * unit * S, ch = bh * unit * S, u = unit * S;
  const cv = canvasOf(cw, ch), g = cv.getContext('2d');
  const ox = cv.width / 2, oy = cv.height * 0.5;
  const spread = 1 - 0.17 * k, rad = 1 - 0.035 * k;
  const order = list.slice().sort((a, b) => b[1] - a[1]);          // lower puffs first, upper puffs in front
  for (const p of order) {
    const x = ox + p[0] * u * spread, y = oy + p[1] * u * spread, r = p[2] * u * rad * 1.12;
    const gr = g.createRadialGradient(x - r * 0.28, y - r * 0.42, r * 0.08, x, y, r);
    gr.addColorStop(0, 'rgba(255,251,244,0.97)');
    gr.addColorStop(0.45 + 0.06 * k, 'rgba(240,240,248,0.93)');
    gr.addColorStop(0.78 + 0.08 * k, `rgba(196,205,228,${0.55 + 0.4 * k})`);
    gr.addColorStop(1, 'rgba(170,182,214,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-atop';
  const top = oy - 1.25 * u, bot = oy + 0.95 * u;
  let sh = g.createLinearGradient(0, oy - 0.25 * u, 0, bot);
  sh.addColorStop(0, 'rgba(96,108,166,0)'); sh.addColorStop(1, `rgba(88,100,160,${0.5 + 0.2 * k})`);
  g.fillStyle = sh; g.fillRect(0, 0, cv.width, cv.height);
  const rim = g.createLinearGradient(0, top, 0, oy - 0.35 * u);
  rim.addColorStop(0, 'rgba(255,238,214,0.4)'); rim.addColorStop(1, 'rgba(255,238,214,0)');
  g.fillStyle = rim; g.fillRect(0, 0, cv.width, cv.height);
  const bounce = g.createRadialGradient(ox - 1.2 * u, bot, 0, ox - 1.2 * u, bot, 2.4 * u);
  bounce.addColorStop(0, 'rgba(255,168,140,0.22)'); bounce.addColorStop(1, 'rgba(255,168,140,0)');
  g.fillStyle = bounce; g.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

function glowSprite(r, rgb, a) {
  const cv = canvasOf(r * 2, r * 2), g = cv.getContext('2d');
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.4, `rgba(${rgb},${a * 0.4})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  return cv;
}

function layout(ctx) {
  w = ctx.w; h = ctx.h;
  S = Math.min(ctx.dpr || 1, 2);
  unit = w < 900 ? Math.min(w * 0.15, h * 0.14) : Math.min(w, h) * 0.115;
  anchorX = w < 900 ? w * 0.5 : w * 0.7;
  cy = w < 900 ? h * 0.62 : h * 0.4;
  high = !!ctx.high;
  if (ctx.high) { unit *= 0.72; anchorX = w < 900 ? w * 0.5 : w * 0.7; cy = w < 900 ? h * 0.2 : h * 0.22; }   // sharing the sky with a tree below

  // Dawn sky, once.
  sky = canvasOf(w * S, h * S);
  const g = sky.getContext('2d'); g.scale(S, S);
  const sg = g.createLinearGradient(0, 0, 0, h);
  sg.addColorStop(0, '#0c1a38'); sg.addColorStop(0.4, '#2f437a'); sg.addColorStop(0.72, '#7d6c98');
  sg.addColorStop(0.9, '#d4917a'); sg.addColorStop(1, '#f0b98a');
  g.fillStyle = sg; g.fillRect(0, 0, w, h);
  const hz = g.createRadialGradient(w * 0.3, h * 0.98, 0, w * 0.3, h * 0.98, h * 0.55);
  hz.addColorStop(0, 'rgba(255,214,160,0.5)'); hz.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = hz; g.fillRect(0, h * 0.35, w, h * 0.65);
  let seed = 7;
  for (let i = 0; i < 46; i++) {                                    // a few last stars, fading toward the light
    seed = (seed * 16807) % 2147483647;
    const sx = (seed / 2147483647) * w;
    seed = (seed * 16807) % 2147483647;
    const sy = (seed / 2147483647) * h * 0.45;
    g.fillStyle = `rgba(244,249,251,${0.5 * (1 - sy / (h * 0.45))})`;
    g.beginPath(); g.arc(sx, sy, i % 5 === 0 ? 1.2 : 0.7, 0, Math.PI * 2); g.fill();
  }

  cloudLoose = renderCloud(PUFFS, 6.4, 3.6, 0);
  cloudTight = renderCloud(PUFFS, 6.4, 3.6, 1);
  wisp = renderCloud(WISP, 2.6, 1.6, 0.4);
  sun = glowSprite(Math.round(3.6 * unit * S), '255,206,150', 0.55);
  dropSpr = glowSprite(8 * S, '219,233,242', 0.95);
  glowSpr = glowSprite(18 * S, '127,242,255', 1);
}

function cloudX() { return anchorX + Math.sin(t * 0.00022) * w * 0.09; }
function cloudY() { return cy + Math.sin(t * 0.0004) * 6; }

function spawn(x, y, bright, delay) {
  for (let i = 0; i < MAX_DROPS; i++) {
    const d = drops[i];
    if (d.active) continue;
    d.active = true; d.x = x; d.y = y; d.vx = (Math.random() - 0.5) * 0.01; d.vy = 0.02;
    d.life = 0; d.max = bright ? 3200 : 2200 + Math.random() * 900; d.delay = delay;
    d.r = bright ? 5 : 2.5 + Math.random() * 1.5; d.bright = bright;
    return;
  }
}

function release(n) {
  const x = cloudX(), y = cloudY();
  for (let i = 0; i < n; i++) spawn(x + (Math.random() - 0.5) * 3.6 * unit, y + (0.5 + Math.random() * 0.5) * unit, false, i * 260 + Math.random() * 200);
}

let sayTimer = null;
function speak() {
  if (!sayEl) return;
  const dx = (Math.random() - 0.5) * 2 * unit;
  spawn(cloudX() + dx, cloudY() + 0.8 * unit, true, 0);
  sayEl.textContent = LINES[sayIdx % LINES.length];
  sayIdx++;
  // beside the drop that let go, just under the cloud; kept inside the scene
  if (high) {
    sayEl.style.left = Math.round(cloudX()) + 'px';
    sayEl.style.top = Math.max(14, Math.round(cloudY() - 2.1 * unit)) + 'px';
    sayEl.style.transform = 'translateX(-50%)';
  } else {
    const left = Math.max(12, Math.min(w - 12, cloudX() + dx + 18));
    sayEl.style.left = left + 'px';
    sayEl.style.top = Math.min(h - 40, cloudY() + 1.7 * unit) + 'px';
    if (left > w * 0.6) { sayEl.style.transform = 'translateX(-100%)'; sayEl.style.left = (left - 36) + 'px'; } else sayEl.style.transform = '';
  }
  sayEl.classList.add('show');
  clearTimeout(sayTimer); sayTimer = setTimeout(() => sayEl.classList.remove('show'), 9500);
  audio.plip(0.9 + Math.random() * 0.5);
}

function hit(px, py) {
  const dx = (px - cloudX()) / (2.7 * unit), dy = (py - cloudY()) / (1.35 * unit);
  return dx * dx + dy * dy < 1;
}

export default {
  mount(el, ctx) {
    c = ctx.c2d; reduced = ctx.reduced; audio = ctx.audio;
    const style = document.createElement('style');
    style.textContent = `
      #cloud .cloud-say { position: absolute; z-index: 2; margin: 0; pointer-events: none; white-space: nowrap;
        font-family: var(--serif); font-style: italic; font-size: clamp(1.05rem, 2vw, 1.3rem); color: var(--mist);
        text-shadow: 0 1px 12px rgba(4,17,31,0.9); opacity: 0; transition: opacity 1.6s ease; }
      #cloud .cloud-say.show { opacity: 1; }
      #cloud .chapter-canvas { cursor: pointer; touch-action: manipulation; }
    `;
    el.appendChild(style);
    const body = document.createElement('div');
    body.className = 'chapter-body left';
    body.innerHTML = `
      <p class="chapter-kicker">Sky</p>
      <h2>Every drop has been somewhere.</h2>
      <p class="lede">A cloud is a crowd of tiny drops, floating together. Every one of them has been somewhere.</p>
      <div class="depth" data-level="1">
        <p class="l1">Look: a cloud is made of tiny drops of water, too small to fall.</p>
        <div class="l2"><span class="term">Discover</span><p>Each drop is smaller than a speck of dust, so the air holds it up the way it holds up dust in a sunbeam. Warm air is always rising, too, and it carries the drops with it. When drops bump into each other they join. Join enough times and a drop gets heavy. Then it falls, and we call it rain.</p></div>
        <div class="l3"><span class="term">Condensation nuclei</span><p>Water vapor does not condense in clean air. It needs something to cling to: a grain of dust, a fleck of sea salt, a particle of smoke. These are condensation nuclei. A cloud droplet grown on one is about 0.02 mm across. A raindrop is about 2 mm. That is a hundred times wider and a million times the volume, so it takes roughly a million cloud droplets colliding and merging to make one raindrop.</p><p class="source">Source: <a href="https://www.usgs.gov/special-topics/water-science-school/science/condensation-and-water-cycle" target="_blank" rel="noopener">USGS Water Science School: Condensation</a></p></div>
        <button class="depth-more">Discover</button>
      </div>`;
    el.appendChild(body);
    sayEl = document.createElement('p'); sayEl.className = 'cloud-say'; sayEl.setAttribute('aria-live', 'polite');
    el.appendChild(sayEl);
    layout(ctx);

    // Listen on the whole section so the cloud is touchable even where the copy overlaps it.
    const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button, a')) return; const [x, y] = pos(e); if (hit(x, y)) { speak(); inside = true; }
      else if (y < h) { spawn(x, y, false, 0); spawn(x + 10, y + 4, false, 140); audio.plip(0.8 + Math.random() * 0.6); } });
    offPhase = ctx.breath.onPhase((p) => {
      if (p !== 'exhale') return;
      if (!reduced) release(3 + Math.floor(Math.random() * 3));
      speak();
    });
  },

  tick(dt, breath, ctx) {
    t += reduced ? dt * 0.25 : dt;
    const g = reduced ? 0.5 : breath.value;
    // The sun behind the cloud brightens on the hold.
    const gt = 0.42 + 0.28 * g + (!reduced && breath.phase === 'hold' ? 0.3 : 0);
    glow += (gt - glow) * Math.min(1, dt / 600);

    c.globalAlpha = 1;
    c.drawImage(sky, 0, 0, w, h);
    const x = cloudX(), y = cloudY();
    const sr = 3.6 * unit;
    c.globalAlpha = Math.min(1, glow);
    c.drawImage(sun, x - 0.5 * unit - sr, y + 0.1 * unit - sr, sr * 2, sr * 2);

    // Two small wisps drift on their own slower clocks.
    const ww = wisp.width / S, wh = wisp.height / S;
    c.globalAlpha = 0.4 + 0.2 * g;
    c.drawImage(wisp, x - 3.9 * unit + Math.sin(t * 0.00031 + 1) * 0.5 * unit - ww / 2, y + 1.05 * unit + Math.sin(t * 0.0005) * 4 - wh / 2, ww, wh);
    c.globalAlpha = 0.45 + 0.2 * g;
    c.drawImage(wisp, x + 3.7 * unit + Math.sin(t * 0.00027 + 3) * 0.6 * unit - ww * 0.4, y + 0.2 * unit + Math.sin(t * 0.00044 + 2) * 4 - wh * 0.4, ww * 0.8, wh * 0.8);

    // The cloud: the loose state gives way to the gathered one as the breath comes in.
    const cw = cloudLoose.width / S, ch = cloudLoose.height / S, k = 1 - 0.025 * g;
    c.globalAlpha = 1 - g;
    c.drawImage(cloudLoose, x - cw * k / 2, y - ch * k / 2, cw * k, ch * k);
    c.globalAlpha = Math.min(1, g * 1.6);
    c.drawImage(cloudTight, x - cw * k / 2, y - ch * k / 2, cw * k, ch * k);

    // Droplets
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = drops[i];
      if (!d.active) continue;
      if (d.delay > 0) { d.delay -= dt; continue; }
      d.life += dt;
      if (d.life >= d.max) { d.active = false; continue; }
      d.vy += 0.00006 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      const q = d.life / d.max;
      const a = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85;
      c.globalAlpha = d.bright ? a : a * 0.85;
      if (d.bright) c.drawImage(glowSpr, d.x - d.r * 3.6, d.y - d.r * 3.6, d.r * 7.2, d.r * 7.2);
      else c.drawImage(dropSpr, d.x - d.r * 0.9, d.y - d.r * 1.2, d.r * 1.8, d.r * 2.4);
    }
    c.globalAlpha = 1;
  },

  resize(ctx) { layout(ctx); },

  unmount() { offPhase?.(); },
};
