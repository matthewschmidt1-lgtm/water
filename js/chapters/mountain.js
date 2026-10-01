// Mountain. Layered silhouettes, a snowcap, streams that join into a river.
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
let main = null, branches = [], streamsB = [], brookTop = 0, bedGrad = null, glints = [], rocks = [];
let camX = 0, t = 0;
let readout = null, offPhase = null;
let x0 = 0, x1 = 0;          // horizontal extent of the generated scene

// Drop journey
const drop = { active: false, route: null, nStream: 0, i: 0, u: 0, x: 0, y: 0, stage: '' };
const sparks = [];
for (let i = 0; i < MAX_SPARK; i++) sparks.push({ x: 0, y: 0, vy: 0, life: 0, max: 1, active: false });

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

    buildBrook(front);
}

const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// A branch: sampled centerline with width, normal, tangent, calmness, plus cached ribbon paths.
function makeBranch(X, Y, W) {
  const n = X.length, TX = new Float32Array(n), TY = new Float32Array(n), CALM = new Float32Array(n);
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = X[b] - X[a], dy = Y[b] - Y[a]; const m = Math.hypot(dx, dy) || 1;
    TX[i] = dx / m; TY[i] = dy / m;
    if (i) L += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4); CALM[i] = Math.max(0, 1 - Math.hypot(TX[b] - TX[a], TY[b] - TY[a]) * 1.6); }
  const ribbon = (k, add) => {
    const p = new Path2D();
    for (let i = 0; i < n; i++) { const hw = W[i] * k / 2 + add; const x = X[i] + TY[i] * hw * -1, y = Y[i] + TX[i] * hw; i ? p.lineTo(x, y) : p.moveTo(x, y); }
    for (let i = n - 1; i >= 0; i--) { const hw = W[i] * k / 2 + add; p.lineTo(X[i] + TY[i] * hw, Y[i] - TX[i] * hw); }
    p.closePath(); return p;
  };
  return { n, X, Y, W, TX, TY, CALM, L, bank: ribbon(1.0, 1.6), bed: ribbon(1.0, 0), core: ribbon(0.5, 0) };
}

function buildBrook(front) {
  const phone = w < 620;
  const maxW = w * (phone ? 0.36 : 0.21);
  const ytop = snowY + (h - snowY) * 0.2, yend = h + 12;
  const M = 150, r = rng(7);
  const ph0 = r() * 6.28, startX = peakX - w * 0.01;
  const X = new Float32Array(M + 1), Y = new Float32Array(M + 1), W = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) {
    const s = i / M;
    const base = startX + (w / 2 - startX) * Math.pow(s, 0.8);
    const amp = w * ((phone ? 0.03 : 0.04) + (phone ? 0.09 : 0.13) * Math.pow(s, 1.1));
    const phase = ph0 + 6.283 * 2.6 * Math.pow(s, 0.65);
    X[i] = base + amp * Math.sin(phase) * (1 - smooth(0.84, 1, s)) * smooth(0, 0.06, s);
    Y[i] = ytop + s * (yend - ytop);
    W[i] = 2.2 + (maxW - 2.2) * Math.pow(s, 1.7);
  }
  main = makeBranch(X, Y, W);
  brookTop = ytop;
  bedGrad = c.createLinearGradient(0, ytop, 0, h);
  bedGrad.addColorStop(0, '#0c3347'); bedGrad.addColorStop(1, '#0f5266');
  branches = [main];
  const starts = [-0.055, 0.045, 0.1], joins = [0, 0, 16];
  for (let k = 0; k < 3; k++) {
    const sx = peakX + starts[k] * w, j = joins[k], ex = X[j], ey = Y[j];
    const sy = Math.max(front(sx), snowY - 6) + 2, m = 34, wig = r() * 6.28;
    const sX = new Float32Array(m + 1), sY = new Float32Array(m + 1), sW = new Float32Array(m + 1);
    for (let i = 0; i <= m; i++) {
      const s = i / m;
      sX[i] = sx + (ex - sx) * s + w * 0.018 * Math.sin(s * 9 + wig) * Math.sin(Math.PI * s);
      sY[i] = Math.max(sy + (ey - sy) * Math.pow(s, 0.9), front(sX[i]) + 2);
      sW[i] = 1.2 + s * s * (W[j] * 0.5 + 0.8);
    }
    const br = makeBranch(sX, sY, sW); br.join = j; streamsB[k] = br;
    branches.push(br);
  }
  // glints advected along each branch
  glints = [];
  const add = (br, cnt, bias) => { for (let i = 0; i < cnt; i++) glints.push({ br, t: Math.random(), lat: (Math.random() * 2 - 1) * 0.82, sp: 0.8 + Math.random() * 0.5, a: 0.4 + Math.random() * 0.6 }); void bias; };
  add(main, phone ? 46 : 64, 0);
  for (let k = 0; k < 3; k++) add(streamsB[k], 5, 0);
  for (const g of glints) if (g.br === main) g.t = Math.pow(g.t, 0.7);
  // rocks
  const spec = [[0.14, -0.3], [0.26, 0.45], [0.37, -1.25], [0.46, 0.2], [0.55, 1.2], [0.63, -0.4], [0.72, 0.35], [0.8, -1.2], [0.86, 0.1], [0.93, -0.45], [0.95, 1.15]];
  const pick = phone ? [1, 3, 5, 6, 8, 9] : spec.map((_, i) => i);
  rocks = [];
  for (const q of pick) {
    const [t0, side] = spec[q], i = Math.round(t0 * M), z = t0;
    const hw = W[i] / 2, rr = (2.4 + z * 20) * (0.8 + r() * 0.5) * (phone ? 0.68 : 1);
    const wet = Math.abs(side) < 1;
    rocks.push({ x: X[i] - main.TY[i] * side * hw * (wet ? 0.9 : 1) - main.TY[i] * (wet ? 0 : Math.sign(side) * rr * 0.3), y: Y[i] + main.TX[i] * side * hw, r: rr, wet, ang: Math.atan2(-main.TX[i], main.TY[i]), ph: r() * 6.28, z });
  }
}

function startDrop(k) {
  const sb = streamsB[k % streamsB.length], pts = [];
  for (let i = 0; i < sb.n; i++) pts.push(sb.X[i], sb.Y[i]);
  const ns = sb.n;
  for (let i = sb.join + 1; i < main.n; i++) pts.push(main.X[i], main.Y[i]);
  drop.route = Float32Array.from(pts); drop.nStream = ns; drop.i = 0; drop.u = 0; drop.active = true; drop.stage = '';
  drop.x = sb.X[0]; drop.y = sb.Y[0];
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
  const zz = Math.max(0, Math.min(1, (drop.y - brookTop) / (h - brookTop)));
  const speed = 0.07 + 0.2 * zz + (drop.i < 6 ? 0 : 0.03);
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
  const g = drop.i / n;
  setStage(g < 0.03 ? STAGES[0] : g < 0.12 ? STAGES[1] : g < 0.3 ? STAGES[2] : g < 0.55 ? STAGES[3] : STAGES[4]);
}

function spark() {
  for (let i = 0; i < MAX_SPARK; i++) {
    const s = sparks[i];
    if (s.active) continue;
    s.active = true; s.x = peakX + (Math.random() - 0.5) * w * 0.22; s.y = peakY + Math.random() * (snowY - peakY);
    s.life = 0; s.vy = 0.004; s.max = 1500 + Math.random() * 1200; return;
  }
}


// Touch the water: a thin ring in the accent colour, like the ripples in hero.js.
const TAPS = [];
for (let i = 0; i < 4; i++) TAPS.push({ x: 0, y: 0, t: -1, col: '#7ff2ff' });
let tapHead = 0;
function addTap(canvas, e, audio) {
  const r = canvas.getBoundingClientRect();
  const tp = TAPS[tapHead]; tapHead = (tapHead + 1) % TAPS.length;
  tp.x = e.clientX - r.left; tp.y = e.clientY - r.top; tp.t = 0;
  tp.col = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7ff2ff';
  audio.plip(0.7 + Math.random() * 0.6);
  return tp;
}
function drawTaps(c, dt) {
  c.lineWidth = 1.5;
  for (let i = 0; i < TAPS.length; i++) {
    const tp = TAPS[i];
    if (tp.t < 0) continue;
    tp.t += dt / 1000;
    const a = 1 - tp.t / 2.2;
    if (a <= 0) { tp.t = -1; continue; }
    const R = 6 + tp.t * 46;
    c.strokeStyle = tp.col;
    c.globalAlpha = a * 0.7; c.beginPath(); c.arc(tp.x, tp.y, R, 0, 7); c.stroke();
    if (tp.t > 0.4) { c.globalAlpha = a * 0.35; c.beginPath(); c.arc(tp.x, tp.y, R * 0.55, 0, 7); c.stroke(); }
  }
  c.globalAlpha = 1;
}


function drawBrook(dt, b) {
  const flow = reduced ? 0.03 : 1 + 0.55 * (1 - b);
  c.fillStyle = 'rgba(5,18,30,0.55)';
  for (let i = 0; i < branches.length; i++) c.fill(branches[i].bank);
  c.fillStyle = bedGrad;
  for (let i = 0; i < branches.length; i++) c.fill(branches[i].bed);
  c.fillStyle = 'rgba(70,175,190,0.14)';
  for (let i = 0; i < branches.length; i++) c.fill(branches[i].core);

  // glints ride the current: faster downstream, faster on the exhale
  c.lineCap = 'round';
  for (let i = 0; i < glints.length; i++) {
    const g = glints[i], br = g.br, n1 = br.n - 1;
    const fi = Math.min(n1 - 0.001, g.t * n1), k = fi | 0, f = fi - k;
    const z = Math.max(0, (br.Y[k] - brookTop) / (h - brookTop));
    g.t += (0.025 + 0.12 * z) * g.sp * flow * dt / br.L;
    if (g.t >= 1) { g.t = 0; g.lat = (Math.random() * 2 - 1) * 0.82; g.sp = 0.8 + Math.random() * 0.5; }
    const x = br.X[k] + (br.X[k + 1] - br.X[k]) * f, y = br.Y[k] + (br.Y[k + 1] - br.Y[k]) * f;
    const hw = (br.W[k] / 2) * g.lat, tx = br.TX[k], ty = br.TY[k];
    const px = x - ty * hw, py = y + tx * hw, len = 2.5 + z * 16 * g.sp;
    const calm = 0.45 + 0.55 * (1 - br.CALM[k]) + z * 0.2;
    const fade = Math.sin(Math.PI * g.t) ** 0.6;
    c.strokeStyle = `rgba(190,246,252,${(g.a * calm * fade * (reduced ? 0.35 : 0.55 + 0.25 * Math.sin(t * 0.004 + i * 1.7))).toFixed(3)})`;
    c.lineWidth = 0.7 + z * 1.7;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px - tx * len, py - ty * len); c.stroke();
  }

  // rocks: wake, stone, then the foam V on the upstream face
  const sh = reduced ? 0.5 : 0;
  for (let i = 0; i < rocks.length; i++) {
    const k = rocks[i], r = k.r, tw = reduced ? 0.5 : 0.6 + 0.4 * Math.sin(t * 0.007 + k.ph);
    c.save(); c.translate(k.x, k.y); c.rotate(k.ang);
    if (k.wet) {
      c.lineWidth = 0.8 + k.z * 1.2; c.lineCap = 'round';
      for (let j = 0; j < 2; j++) {         // standing ripples behind the stone, fixed in place
        const d = r * (1.5 + j * 1.1);
        c.strokeStyle = `rgba(170,235,245,${(0.16 - j * 0.05) * (reduced ? 0.6 : 0.75 + 0.25 * Math.sin(t * 0.003 + k.ph + j))})`;
        c.beginPath(); c.ellipse(0, d, r * (0.7 + j * 0.2), r * 0.22, 0, 0.3, Math.PI - 0.3); c.stroke();
      }
      for (let j = -1; j <= 1; j++) {       // trailing wake streaks
        const L2 = r * (2.8 + (j ? 0 : 1.5)), wob = reduced ? 0 : Math.sin(t * 0.005 + j + k.ph) * r * 0.08;
        c.strokeStyle = `rgba(200,248,252,${0.28 * tw})`;
        c.beginPath(); c.moveTo(j * r * 0.55, r * 0.5); c.quadraticCurveTo(j * r * 0.7 + wob, r + L2 * 0.5, j * r * 1.05, r * 0.5 + L2); c.stroke();
      }
    }
    c.fillStyle = 'rgba(4,14,24,0.45)';       // shadow
    c.beginPath(); c.ellipse(r * 0.15, r * 0.35, r * 1.3, r * 0.8, 0, 0, 7); c.fill();
    c.fillStyle = '#34506a';
    c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, 7); c.fill();
    c.fillStyle = '#5f8199';
    c.beginPath(); c.ellipse(-r * 0.2, -r * 0.22, r * 0.8, r * 0.5, -0.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(190,225,240,0.35)';
    c.beginPath(); c.ellipse(-r * 0.35, -r * 0.4, r * 0.3, r * 0.16, -0.3, 0, 7); c.fill();
    if (k.wet) {
      c.lineWidth = 1 + k.z * 1.6;
      c.strokeStyle = `rgba(240,252,255,${0.55 * tw})`;
      c.beginPath(); c.moveTo(-r * 0.3, -r * 0.8); c.quadraticCurveTo(-r * 1.2, -r * 1.2, -r * 1.7, -r * 0.4);
      c.moveTo(r * 0.3, -r * 0.8); c.quadraticCurveTo(r * 1.2, -r * 1.2, r * 1.7, -r * 0.4); c.stroke();
      // white-water flecks
      c.fillStyle = `rgba(245,253,255,${0.5 * tw})`;
      const nf = 3 + (k.z * 6 | 0);
      for (let j = 0; j < nf; j++) {
        const a = k.ph * 7 + j * 2.1, rad = r * (1 + (j % 3) * 0.35), fl = reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 0.009 + j * 1.9 + k.ph);
        c.globalAlpha = fl; c.beginPath(); c.arc(Math.cos(a) * rad * 1.2, Math.sin(a) * rad * 0.7 - r * 0.2 + (sh ? 0 : 0), 0.8 + k.z * 1.3, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    c.restore();
  }
}

let runs = 0, idle = 0;

export default {
  mount(el, ctx) {
    c = ctx.c2d; reduced = ctx.reduced; audio = ctx.audio;
    const body = document.createElement('div');
    body.className = 'chapter-body left';
    body.innerHTML = `
      <p class="chapter-kicker">Mountain</p>
      <h2>Follow one drop downhill.</h2>
      <p class="lede">Snow on the peak. Sun in the morning. A drop lets go and starts to slide.</p>
      <div class="controls">
        <label>Right now<span class="value readout">waiting on the peak</span></label>
      </div>
      <div class="depth" data-level="1">
        <p class="l1">Look: snow melts. Water runs downhill. Small streams join to make rivers.</p>
        <div class="l2"><span class="term">Discover</span><p>Every raindrop that lands on this side of the ridge ends up in the same river. The ridge is the divide: one side of it sends water this way, the other side sends it somewhere else entirely. The land that drains into one river is called its watershed, and you are standing in one right now.</p></div>
        <div class="l3"><span class="term">Watershed</span><p>A watershed, or drainage basin, is all the land whose surface water flows to a single outlet. The boundaries are the ridgelines. The river does not carry only water: it carries dissolved minerals from the rock it has touched and grains of sediment it has pried loose. That is erosion, and it is how mountains slowly move to the sea. The Mississippi basin drains about 40% of the contiguous United States into one river mouth.</p><p class="source">Source: <a href="https://www.usgs.gov/special-topics/water-science-school/science/watersheds-and-drainage-basins" target="_blank" rel="noopener">USGS Water Science School: Watersheds</a></p></div>
        <button class="depth-more">Discover</button>
      </div>`;
    el.appendChild(body);
    readout = body.querySelector('.readout');
    // The melt runs on its own: a drop lets go a moment after you arrive, and another whenever the last has reached the sea.
    ctx.canvas.addEventListener('pointerdown', () => { if (!drop.active) startDrop(runs++); });
    layout(ctx);
    ctx.canvas.addEventListener('pointerdown', (e) => addTap(ctx.canvas, e, audio));
    offPhase = ctx.breath.onPhase((p) => { if (p === 'exhale' && !reduced) for (let i = 0; i < 4; i++) spark(); });
  },

  tick(dt, breath, ctx) {
    t += dt;
    const b = breath.value;
    if (!drop.active) { idle += dt; if (idle > (runs === 0 ? 1800 : 14000)) { idle = 0; startDrop(runs++); } } else idle = 0;
    if (drop.active) advanceDrop(dt);
    const camTarget = drop.active && !reduced ? Math.max(-PAN, Math.min(PAN, w / 2 - drop.x)) : 0;
    camX += (camTarget - camX) * Math.min(1, dt * 0.0025);

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

    drawBrook(dt, b);

    // Melt sparkles drifting off the snow on the exhale.
    for (let i = 0; i < MAX_SPARK; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.max) { s.active = false; continue; }
      s.vy = (s.vy || 0) + 0.00004 * dt; s.y += s.vy * dt;   // meltwater drips and accelerates under gravity
      const k = s.life / s.max;
      c.fillStyle = `rgba(219,240,250,${Math.min(1, k * 6) * (1 - k) * 0.8})`;
      c.beginPath(); c.ellipse(s.x, s.y, 1.3, 1.3 + Math.min(3, s.vy * 40), 0, 0, Math.PI * 2); c.fill();
    }

    // The travelling drop.
    if (drop.active) {
      const dz = Math.max(0, Math.min(1, (drop.y - brookTop) / (h - brookTop))), dr = 3 + dz * 4;
      c.fillStyle = 'rgba(127,242,255,0.22)';
      c.beginPath(); c.arc(drop.x, drop.y, dr * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#dffbff';
      c.beginPath(); c.arc(drop.x, drop.y, dr, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    drawTaps(c, dt);
  },

  resize(ctx) { layout(ctx); drop.active = false; camX = 0; },

  unmount() { offPhase?.(); },
};
