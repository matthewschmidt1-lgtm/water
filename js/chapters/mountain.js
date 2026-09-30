// 03 — Mountain. Layered silhouettes, a snowcap, streams that join into a river.
// "Follow me" releases one drop at the snowline and the camera walks it down to the river.

const PAN = 90;            // max camera travel in px
const STEP = 4;            // polyline sample step in px
const N_STREAMS = 4;
const MAX_SPARK = 18;
const LAYERS = [
  { base: 0.56, amp: 0.09, peakH: 0.08, px: 0.22, seed: 11, par: 0.25, color: '#476e94' },
  { base: 0.64, amp: 0.08, peakH: 0.12, px: 0.42, seed: 23, par: 0.5,  color: '#2b4f74' },
  { base: 0.72, amp: 0.07, peakH: 0.10, px: 0.9,  seed: 37, par: 0.75, color: '#173a5c' },
  { base: 0.84, amp: 0.05, peakH: 0.5,  px: 0.66, seed: 53, par: 1.0,  color: '#0a2038' },
];
const STAGES = ['snow', 'melt', 'stream', 'creek', 'river'];

let c, w, h, reduced, audio;
let skyGrad = null, glowGrad = null;
let paths = [];              // Path2D per layer
let frontPath = null, snowPath = null;
let peakX = 0, peakY = 0, snowY = 0, mergeX = 0, mergeY = 0;
let streams = [];            // Float32Array of [x,y,...] per stream
let river = null;            // Float32Array
let streamPaths = [], riverPath = null;
let flowOff = 0;
let camX = 0, t = 0;
let readout = null, offPhase = null;
let x0 = 0, x1 = 0;          // horizontal extent of the generated scene

// Drop journey
const drop = { active: false, route: null, nStream: 0, i: 0, u: 0, x: 0, y: 0, stage: '' };
const sparks = [];
for (let i = 0; i < MAX_SPARK; i++) sparks.push({ x: 0, y: 0, life: 0, max: 1, active: false });

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; }; }

// A stable ridge: baseline minus one big peak minus a few seeded sines.
function makeRidge(L) {
  const r = rng(L.seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  const fq = [1.3 + r(), 2.7 + r() * 2, 5.5 + r() * 3, 11 + r() * 5, 23 + r() * 8];
  return (x) => {
    const u = x / w;
    const peak = L.peakH * h * Math.exp(-(((u - L.px) / 0.14) ** 2));
    let n = 0;
    for (let k = 0; k < 5; k++) n += Math.sin(u * fq[k] * 6.28 + ph[k]) * (L.amp * h) / (k + 1.6);
    return L.base * h - peak - n;
  };
}

function layerPath(f) {
  const p = new Path2D();
  p.moveTo(x0, h + 60);
  for (let x = x0; x <= x1; x += STEP) p.lineTo(x, f(x));
  p.lineTo(x1, h + 60); p.closePath();
  return p;
}

function toPath(a) { const p = new Path2D(); p.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); return p; }

function layout(ctx) {
  w = ctx.w; h = ctx.h;
  x0 = -PAN - 8; x1 = w + PAN + 8;
  skyGrad = c.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#08192e'); skyGrad.addColorStop(0.5, '#1f4a70'); skyGrad.addColorStop(0.62, '#2f5f86'); skyGrad.addColorStop(1, '#071a2e');
  const fns = LAYERS.map(makeRidge);
  paths = fns.map(layerPath);
  const front = fns[3];
  frontPath = paths[3];
  peakX = LAYERS[3].px * w; peakY = front(peakX);
  snowY = peakY + h * 0.11;
  glowGrad = c.createRadialGradient(peakX, peakY + h * 0.04, 0, peakX, peakY + h * 0.04, w * 0.2);
  glowGrad.addColorStop(0, 'rgba(244,249,251,1)'); glowGrad.addColorStop(1, 'rgba(244,249,251,0)');
  snowPath = new Path2D();
  snowPath.moveTo(peakX - w * 0.3, peakY - 10);
  for (let x = peakX - w * 0.3; x <= peakX + w * 0.3; x += STEP) snowPath.lineTo(x, snowY + Math.sin(x * 0.05) * 5 + Math.sin(x * 0.013) * 9);
  snowPath.lineTo(peakX + w * 0.3, peakY - 10); snowPath.closePath();

  // Streams start on the snowline and run to a merge point on the lower right slope.
  mergeX = Math.min(peakX + w * 0.2, w * 0.9); mergeY = h * 0.88;
  const r = rng(101);
  streams = [];
  for (let s = 0; s < N_STREAMS; s++) {
    const side = s < 2 ? -1 : 1;
    let x = peakX + side * (0.04 + s % 2 * 0.045) * w + (r() - 0.5) * 10;
    let y = Math.max(front(x), snowY - 6) + 2;
    const pts = [x, y];
    const wig = r() * 6.28;
    let guard = 0;
    while (y < mergeY - 3 && guard++ < 400) {
      const dx = mergeX - x, dy = mergeY - y;
      const ang = Math.atan2(dy, dx);
      x += Math.cos(ang) * 7 + Math.sin(y * 0.045 + wig) * 2.2;
      y += Math.max(3.5, Math.sin(ang) * 7);
      if (y > mergeY) y = mergeY;
      y = Math.max(y, front(x) + 3);
      pts.push(x, y);
    }
    streams.push(Float32Array.from(pts));
  }
  const rv = [mergeX, mergeY];
  for (let x = mergeX, y = mergeY; x < x1 + 20; x += 8) { y += (h + 30 - mergeY) / ((x1 - mergeX) / 8); rv.push(x, y + Math.sin(x * 0.03) * 4); }
  river = Float32Array.from(rv);
  streamPaths = streams.map(toPath);
  riverPath = toPath(river);
}

function startDrop(k) {
  const s = streams[k % streams.length];
  const route = new Float32Array(s.length + river.length);
  route.set(s, 0); route.set(river, s.length);
  drop.route = route; drop.nStream = s.length / 2; drop.i = 0; drop.u = 0; drop.active = true; drop.stage = '';
  drop.x = s[0]; drop.y = s[1];
  audio.plip(1.4);
}

function setStage(name) {
  if (name === drop.stage) return;
  drop.stage = name;
  if (readout) readout.textContent = name;
  if (name === 'river') audio.plip(0.7);
}

function advanceDrop(dt) {
  const r = drop.route, n = r.length / 2;
  const f = drop.i / drop.nStream;
  const speed = f < 0.25 ? 0.08 + f * 0.6 : drop.i < drop.nStream ? 0.2 : 0.32;
  let dist = speed * dt;
  while (dist > 0 && drop.i < n - 1) {
    const ax = r[drop.i * 2], ay = r[drop.i * 2 + 1], bx = r[drop.i * 2 + 2], by = r[drop.i * 2 + 3];
    const seg = Math.hypot(bx - ax, by - ay) || 0.001;
    const rem = (1 - drop.u) * seg;
    if (dist < rem) { drop.u += dist / seg; dist = 0; } else { dist -= rem; drop.i++; drop.u = 0; }
  }
  if (drop.i >= n - 1) { drop.active = false; if (readout) readout.textContent = 'gone to sea'; return; }
  const i2 = drop.i * 2;
  drop.x = r[i2] + (r[i2 + 2] - r[i2]) * drop.u;
  drop.y = r[i2 + 1] + (r[i2 + 3] - r[i2 + 1]) * drop.u;
  const g = drop.i / drop.nStream;
  setStage(drop.i >= drop.nStream ? STAGES[4] : g < 0.08 ? STAGES[0] : g < 0.22 ? STAGES[1] : g < 0.6 ? STAGES[2] : STAGES[3]);
}

function spark() {
  for (let i = 0; i < MAX_SPARK; i++) {
    const s = sparks[i];
    if (s.active) continue;
    s.active = true; s.x = peakX + (Math.random() - 0.5) * w * 0.22; s.y = peakY + Math.random() * (snowY - peakY);
    s.life = 0; s.max = 1500 + Math.random() * 1200; return;
  }
}

export default {
  mount(el, ctx) {
    c = ctx.c2d; reduced = ctx.reduced; audio = ctx.audio;
    const body = document.createElement('div');
    body.className = 'chapter-body left';
    body.innerHTML = `
      <p class="chapter-kicker">03 — Mountain</p>
      <h2>Follow one drop downhill.</h2>
      <p class="lede">Snow on the peak. Sun in the morning. A drop lets go and starts to slide.</p>
      <div class="controls">
        <button class="btn follow-drop">Follow me</button>
        <label>Right now<span class="value readout">waiting on the peak</span></label>
      </div>
      <div class="depth" data-level="1">
        <p class="l1">Look: snow melts. Water runs downhill. Small streams join to make rivers.</p>
        <div class="l2"><span class="term">Discover</span><p>Every raindrop that lands on this side of the ridge ends up in the same river. The ridge is the divide: one side of it sends water this way, the other side sends it somewhere else entirely. The land that drains into one river is called its watershed, and you are standing in one right now.</p></div>
        <div class="l3"><span class="term">Watershed</span><p>A watershed, or drainage basin, is all the land whose surface water flows to a single outlet. The boundaries are the ridgelines. The river does not carry only water: it carries dissolved minerals from the rock it has touched and grains of sediment it has pried loose. That is erosion, and it is how mountains slowly move to the sea. The Mississippi basin drains about 40% of the contiguous United States into one river mouth.</p></div>
        <button class="depth-more">Discover</button>
      </div>`;
    el.appendChild(body);
    readout = body.querySelector('.readout');
    let k = 0;
    body.querySelector('.follow-drop').addEventListener('click', () => startDrop(k++));
    layout(ctx);
    offPhase = ctx.breath.onPhase((p) => { if (p === 'exhale' && !reduced) for (let i = 0; i < 4; i++) spark(); });
  },

  tick(dt, breath, ctx) {
    t += dt;
    const b = breath.value;
    if (drop.active) advanceDrop(dt);
    const camTarget = drop.active && !reduced ? Math.max(-PAN, Math.min(PAN, w / 2 - drop.x)) : 0;
    camX += (camTarget - camX) * Math.min(1, dt * 0.0025);
    flowOff -= (reduced ? 0.008 : 0.03 + 0.045 * b) * dt;

    c.fillStyle = skyGrad; c.fillRect(0, 0, w, h);

    // Back layers with parallax; front layer with full camera.
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(camX * LAYERS[i].par, 0);
      c.fillStyle = LAYERS[i].color; c.fill(paths[i]);
      c.restore();
    }
    c.save(); c.translate(camX, 0);
    c.fillStyle = LAYERS[3].color; c.fill(frontPath);

    // Snowcap, clipped to the front peak; glow rises on inhale.
    c.save(); c.clip(frontPath);
    c.globalAlpha = 0.14 + b * 0.24; c.fillStyle = glowGrad; c.fillRect(peakX - w * 0.2, peakY - 20, w * 0.4, h * 0.3);
    c.globalAlpha = 1; c.fillStyle = '#eef6fb'; c.fill(snowPath);
    c.restore();

    // Streams and river: a faint solid bed, then a moving dashed thread.
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(47,184,198,0.4)';
    c.lineWidth = 2;
    for (let i = 0; i < streamPaths.length; i++) c.stroke(streamPaths[i]);
    c.lineWidth = 5; c.stroke(riverPath);
    c.setLineDash([5, 9]); c.lineDashOffset = flowOff;
    c.strokeStyle = `rgba(127,242,255,${0.6 + b * 0.25})`;
    c.lineWidth = 1.2;
    for (let i = 0; i < streamPaths.length; i++) c.stroke(streamPaths[i]);
    c.lineWidth = 2.4; c.stroke(riverPath);
    c.setLineDash([]);

    // Melt sparkles drifting off the snow on the exhale.
    for (let i = 0; i < MAX_SPARK; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.max) { s.active = false; continue; }
      s.y += 0.018 * dt;
      const k = s.life / s.max;
      c.fillStyle = `rgba(244,249,251,${(1 - k) * (0.5 + 0.5 * Math.sin(s.life * 0.02))})`;
      c.beginPath(); c.arc(s.x, s.y, 1.6, 0, Math.PI * 2); c.fill();
    }

    // The travelling drop.
    if (drop.active) {
      c.fillStyle = 'rgba(127,242,255,0.22)';
      c.beginPath(); c.arc(drop.x, drop.y, 14, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#dffbff';
      c.beginPath(); c.arc(drop.x, drop.y, 4.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  },

  resize(ctx) { layout(ctx); drop.active = false; camX = 0; },

  unmount() { offPhase?.(); },
};
