// 01 — Sky. A stylized cloud drifts across a dawn sky.
// Inhale gathers it; exhale loosens it and lets a few drops go. Touch it and a drop speaks.

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
const MAX_DROPS = 28;

let c, w, h, reduced, audio;
let skyGrad = null, sunGrad = null;
let unit = 40;                 // cloud unit size in px
let anchorX = 0, cy = 0;       // where the cloud lives
let cx = 0;
let t = 0;
let sayEl = null, sayIdx = 0, inside = false;
let offPhase = null;
let drawFn = null;

// Preallocated droplet pool.
const drops = [];
for (let i = 0; i < MAX_DROPS; i++) drops.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, delay: 0, r: 3, bright: false, active: false });

function layout(ctx) {
  w = ctx.w; h = ctx.h;
  unit = Math.min(w, h) * 0.105;
  anchorX = w < 900 ? w * 0.5 : w * 0.7;
  cy = w < 900 ? h * 0.66 : h * 0.4;
  skyGrad = c.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#0a1a33');
  skyGrad.addColorStop(0.45, '#2d3f6e');
  skyGrad.addColorStop(0.78, '#7a6a8a');
  skyGrad.addColorStop(0.93, '#c98b6d');
  skyGrad.addColorStop(1, '#e0a97e');
  sunGrad = c.createRadialGradient(w * 0.3, h * 0.97, 0, w * 0.3, h * 0.97, h * 0.45);
  sunGrad.addColorStop(0, 'rgba(255,205,150,0.45)');
  sunGrad.addColorStop(1, 'rgba(255,205,150,0)');
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

function speak() {
  if (!sayEl) return;
  sayEl.textContent = LINES[sayIdx % LINES.length];
  sayIdx++;
  sayEl.classList.remove('show'); void sayEl.offsetWidth; sayEl.classList.add('show');
  spawn(cloudX() + (Math.random() - 0.5) * 2 * unit, cloudY() + 0.8 * unit, true, 0);
  audio.plip(0.9 + Math.random() * 0.5);
}

function hit(px, py) {
  const dx = (px - cloudX()) / (2.7 * unit), dy = (py - cloudY()) / (1.35 * unit);
  return dx * dx + dy * dy < 1;
}

function puff(x, y, r, gather) {
  // Shadow puff (slightly below), then the lit puff.
  const sg = c.createRadialGradient(x, y + r * 0.35, r * 0.2, x, y + r * 0.35, r * 1.05);
  sg.addColorStop(0, `rgba(120,140,175,${0.35 + gather * 0.25})`);
  sg.addColorStop(1, 'rgba(120,140,175,0)');
  c.fillStyle = sg; c.beginPath(); c.arc(x, y + r * 0.35, r * 1.05, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  const core = 0.82 + gather * 0.16;
  g.addColorStop(0, `rgba(250,246,244,${core})`);
  g.addColorStop(0.55, `rgba(224,228,238,${0.62 + gather * 0.25})`);
  g.addColorStop(1, 'rgba(200,210,228,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

export default {
  mount(el, ctx) {
    c = ctx.c2d; reduced = ctx.reduced; audio = ctx.audio;
    const style = document.createElement('style');
    style.textContent = `
      #cloud .cloud-say { font-family: var(--serif); font-style: italic; font-size: 1.25rem; color: var(--cyan); min-height: 1.8em; margin: 8px 0 0; opacity: 0; }
      #cloud .cloud-say.show { animation: rise 0.8s ease both; }
      #cloud .chapter-canvas { cursor: pointer; touch-action: manipulation; }
      #cloud .hint { color: var(--muted); font-size: 0.8rem; letter-spacing: 0.2em; text-transform: uppercase; margin: 18px 0 0; }
    `;
    el.appendChild(style);
    const body = document.createElement('div');
    body.className = 'chapter-body left';
    body.innerHTML = `
      <p class="chapter-kicker">01 — Sky</p>
      <h2>Every drop has been somewhere.</h2>
      <p class="lede">A cloud is a crowd of tiny drops, floating together. Touch it, and one will tell you where it has been.</p>
      <p class="hint">Touch the cloud</p>
      <p class="cloud-say" aria-live="polite"></p>
      <div class="depth" data-level="1">
        <p class="l1">Look: a cloud is made of tiny drops of water, too small to fall.</p>
        <div class="l2"><span class="term">Discover</span><p>Each drop is smaller than a speck of dust, so the air holds it up the way it holds up dust in a sunbeam. Warm air is always rising, too, and it carries the drops with it. When drops bump into each other they join. Join enough times and a drop gets heavy. Then it falls, and we call it rain.</p></div>
        <div class="l3"><span class="term">Condensation nuclei</span><p>Water vapor does not condense in clean air. It needs something to cling to: a grain of dust, a fleck of sea salt, a particle of smoke. These are condensation nuclei. A cloud droplet grown on one is about 0.02 mm across. A raindrop is about 2 mm. That is a hundred times wider and a million times the volume, so it takes roughly a million cloud droplets colliding and merging to make one raindrop.</p></div>
        <button class="depth-more">Discover</button>
      </div>`;
    el.appendChild(body);
    sayEl = body.querySelector('.cloud-say');
    layout(ctx);
    cx = anchorX;

    // Listen on the whole section so the cloud is touchable even where the copy overlaps it.
    const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const [x, y] = pos(e); if (hit(x, y)) { speak(); inside = true; }
      else if (y < h) { spawn(x, y, false, 0); spawn(x + 10, y + 4, false, 140); audio.plip(0.8 + Math.random() * 0.6); } });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const [x, y] = pos(e);
      const now = hit(x, y);
      if (now && !inside) speak();
      inside = now;
    });
    el.addEventListener('pointerleave', () => { inside = false; });
    offPhase = ctx.breath.onPhase((p) => { if (p === 'exhale' && !reduced) release(3 + Math.floor(Math.random() * 3)); });
  },

  tick(dt, breath, ctx) {
    t += reduced ? dt * 0.25 : dt;
    // Sky
    c.fillStyle = skyGrad; c.fillRect(0, 0, w, h);
    c.fillStyle = sunGrad; c.fillRect(0, h * 0.45, w, h * 0.55);

    // Cloud: puffs pull inward and deepen on inhale.
    const gather = reduced ? 0.5 : breath.value;
    const spread = 1 - 0.17 * gather;
    const rad = 1 - 0.035 * gather;
    cx = cloudX(); const y = cloudY();
    for (let i = PUFFS.length - 1; i >= 0; i--) {
      const p = PUFFS[i];
      const wob = Math.sin(t * 0.0006 + i * 1.7) * 0.03;
      puff(cx + p[0] * unit * spread, y + (p[1] + wob) * unit * spread, p[2] * unit * rad, gather);
    }

    // Droplets
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = drops[i];
      if (!d.active) continue;
      if (d.delay > 0) { d.delay -= dt; continue; }
      d.life += dt;
      if (d.life >= d.max) { d.active = false; continue; }
      d.vy += 0.00006 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      const k = d.life / d.max;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      c.fillStyle = d.bright ? `rgba(127,242,255,${a})` : `rgba(219,233,242,${a * 0.85})`;
      c.beginPath(); c.ellipse(d.x, d.y, d.r * 0.85, d.r * 1.15, 0, 0, Math.PI * 2); c.fill();
      if (d.bright) {
        c.fillStyle = `rgba(127,242,255,${a * 0.25})`;
        c.beginPath(); c.arc(d.x, d.y, d.r * 2.6, 0, Math.PI * 2); c.fill();
      }
    }
  },

  resize(ctx) { layout(ctx); },

  unmount() { offPhase?.(); },
};
