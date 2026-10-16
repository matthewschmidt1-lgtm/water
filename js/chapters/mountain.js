// Mountain. Layered silhouettes, a snowcap, streams that join into a river.
// "Follow me" releases one drop at the snowline and the camera walks it down to the river.

const PAN = 0;             // the camera stays put (it used to pan with the drop; the owner found it restless)
const STEP = 4;            // polyline sample step in px
const N_STREAMS = 4;
const MAX_SPARK = 18;
const LAYERS = [
  { base: 0.56, amp: 0.09, peakH: 0.08, px: 0.22, seed: 11, par: 0.25, color: '#476e94' },
  { base: 0.64, amp: 0.08, peakH: 0.12, px: 0.42, seed: 23, par: 0.5,  color: '#2b4f74' },
  { base: 0.72, amp: 0.07, peakH: 0.10, px: 0.9,  seed: 37, par: 0.75, color: '#173a5c' },
  { base: 0.84, amp: 0.05, peakH: 0.5,  px: 0.66, seed: 53, par: 1.0,  color: '#0a2038' },
];
// the river is different on every load
const RSEED = ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0) || 1;
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
  buildLife();
}

const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// A branch: sampled centerline with width, normal, tangent, calmness, plus cached ribbon paths.
const FS = 0.42;   // ground seen at a low angle: across-the-slope distances are squeezed vertically
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
    for (let i = 0; i < n; i++) { const hw = W[i] * k / 2 + add; const x = X[i] + TY[i] * hw * -1, y = Y[i] + TX[i] * hw * FS; i ? p.lineTo(x, y) : p.moveTo(x, y); }
    for (let i = n - 1; i >= 0; i--) { const hw = W[i] * k / 2 + add; p.lineTo(X[i] + TY[i] * hw, Y[i] - TX[i] * hw * FS); }
    p.closePath(); return p;
  };
  // Fills are built from one quad per segment, so a tight bend (where the inner bank folds over itself)
  // overlaps instead of punching a hole. `shift` slides the band sideways: the deep channel leans to the outside of bends.
  const band = (k, add, shift) => {
    const p = new Path2D();
    const pt = (i, sgn) => {
      let off = 0;
      if (shift) { const a = Math.max(0, i - 16), b2 = Math.min(n - 1, i + 16); off = Math.max(-0.12, Math.min(0.12, (TX[b2] - TX[a]) * 0.5)) * W[i]; }
      const hw = (W[i] * k / 2 + add) * sgn + off;
      return [X[i] - TY[i] * hw, Y[i] + TX[i] * hw * FS];
    };
    for (let i = 0; i < n - 1; i++) {
      const a = pt(i, 1), b = pt(i + 1, 1), d = pt(i + 1, -1), e = pt(i, -1);
      p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); p.lineTo(d[0], d[1]); p.lineTo(e[0], e[1]); p.closePath();
    }
    return p;
  };
  return { n, X, Y, W, TX, TY, CALM, L, bank: band(1.1, 2.5, false), bed: band(1.0, 0, false), edge: ribbon(1.0, 0), core: band(0.56, 0, true) };
}

// A stone, drawn once: an irregular rounded outline, lit from the upper left by the sky, darker and wet toward
// the waterline, with a few facets and mineral specks. Kept as a sprite so each frame is one drawImage.
function rockSprite(r, rnd, wet) {
  const S = 2, pad = 4, size = Math.ceil(r * 2.9 + pad * 2);
  const cv = document.createElement('canvas'); cv.width = size * S; cv.height = size * S;
  const g = cv.getContext('2d'); g.scale(S, S); g.translate(size / 2, size / 2);
  const n = 9 + Math.floor(rnd() * 4), pts = [];
  const squash = 0.62 + rnd() * 0.16, lean = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (rnd() - 0.5) * 0.35, rad = r * (0.86 + rnd() * 0.42);
    pts.push([Math.cos(a) * rad + Math.sin(a) * lean * r * 0.3, Math.sin(a) * rad * squash]);
  }
  const outline = () => {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo((pts[n - 1][0] + p[0]) / 2, (pts[n - 1][1] + p[1]) / 2);
      g.quadraticCurveTo(p[0], p[1], mx, my);
    }
    g.closePath();
  };
  // body: warm-grey stone under a cool sky
  const tone = 0.85 + rnd() * 0.3, warm = rnd() * 14;
  const col = (v, a = 1) => `rgba(${Math.round((v + warm * 0.5) * tone)},${Math.round((v + 2) * tone)},${Math.round((v + 8 - warm * 0.3) * tone)},${a})`;
  const body = g.createLinearGradient(-r, -r * squash, r * 0.7, r * squash);
  body.addColorStop(0, col(128)); body.addColorStop(0.45, col(86)); body.addColorStop(1, col(34));
  outline(); g.fillStyle = body; g.fill();
  g.save(); outline(); g.clip();
  // facets: a couple of planes catching less light
  for (let k = 0; k < 3; k++) {
    const a = rnd() * 6.283, d = r * (0.15 + rnd() * 0.5);
    g.fillStyle = `rgba(10,16,22,${0.1 + rnd() * 0.14})`;
    g.beginPath(); g.moveTo(Math.cos(a) * d, Math.sin(a) * d * squash);
    g.lineTo(Math.cos(a + 0.9) * r * 1.4, Math.sin(a + 0.9) * r * 1.4); g.lineTo(Math.cos(a + 2.2) * r * 1.4, Math.sin(a + 2.2) * r * 1.4); g.closePath(); g.fill();
  }
  // a hairline crack
  g.strokeStyle = 'rgba(8,12,18,0.35)'; g.lineWidth = 0.6;
  g.beginPath(); let cx = -r * 0.5 + rnd() * r * 0.4, cy = -r * squash * 0.5; g.moveTo(cx, cy);
  for (let k = 0; k < 4; k++) { cx += r * (0.1 + rnd() * 0.25); cy += r * squash * (0.15 + rnd() * 0.3); g.lineTo(cx, cy); } g.stroke();
  // mineral specks and lichen
  for (let k = 0; k < Math.round(14 + r * 1.6); k++) {
    const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r * 1.1;
    g.fillStyle = rnd() < 0.5 ? `rgba(210,220,226,${0.07 + rnd() * 0.12})` : `rgba(8,12,16,${0.1 + rnd() * 0.16})`;
    g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d * squash, 0.35 + rnd() * Math.max(0.6, r * 0.05), 0, 7); g.fill();
  }
  // the top takes the sky's light
  const lit = g.createRadialGradient(-r * 0.35, -r * squash * 0.55, 0, -r * 0.35, -r * squash * 0.55, r * 1.05);
  lit.addColorStop(0, 'rgba(205,224,238,0.38)'); lit.addColorStop(1, 'rgba(205,224,238,0)');
  g.fillStyle = lit; g.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
  // wet and dark where the water has been
  const wetG = g.createLinearGradient(0, r * squash * (wet ? 0.05 : 0.45), 0, r * squash * 1.05);
  wetG.addColorStop(0, 'rgba(6,14,22,0)'); wetG.addColorStop(1, `rgba(6,14,22,${wet ? 0.72 : 0.5})`);
  g.fillStyle = wetG; g.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
  if (wet) {   // a thin gleam just above the dark band: the wet line
    g.strokeStyle = 'rgba(190,235,245,0.22)'; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(0, r * squash * 0.42, r * 0.95, r * squash * 0.22, 0, 0.15, Math.PI - 0.15); g.stroke();
  }
  g.restore();
  // rim light on the upper-left edge
  g.save(); outline(); g.clip();
  g.strokeStyle = 'rgba(214,232,244,0.4)'; g.lineWidth = 1.6; g.translate(1.2, 1.4); outline(); g.stroke();
  g.restore();
  return { cv, size, squash };
}

function buildBrook(front) {
  const phone = w < 620;
  const maxW = w * (phone ? 0.84 : 0.7);
  const ytop = snowY + (h - snowY) * 0.2, yend = h + 12;
  const M = 220, r = rng(RSEED);
  const ph0 = r() * 6.28, ph1 = r() * 6.28, ph2 = r() * 6.28, ph3 = r() * 6.28, ph4 = r() * 6.28, startX = peakX - w * 0.01;
  const f1 = 1.7 + r() * 1.0, f2 = 1.13 + r() * 0.8, fw = 0.5 + r() * 0.9;   // two unrelated meander frequencies and a slow warp of the first
  // bend amplitude changes along the length: a tight bend or two, and a long lazy reach
  const bumps = [];
  const nb = 2 + Math.floor(r() * 2);
  for (let k = 0; k < nb; k++) bumps.push({ c: 0.12 + r() * 0.7, wd: 0.05 + r() * 0.07, a: k === 0 ? 0.5 + r() * 0.4 : (r() < 0.55 ? -(0.3 + r() * 0.25) : 0.35 + r() * 0.4) });
  const X = new Float32Array(M + 1), Y = new Float32Array(M + 1), W = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) {
    const s = i / M;
    const base = startX + (w / 2 - startX) * Math.pow(s, 0.8);
    const amp = w * ((phone ? 0.028 : 0.034) + (phone ? 0.1 : 0.15) * Math.pow(s, 1.15));
    let env = 0.85;
    for (const bp of bumps) env += bp.a * (1 - 0.65 * bp.c) * Math.exp(-(((s - bp.c) / bp.wd) ** 2));
    env = Math.max(0.4, Math.min(1.3, env));
    const phase = ph0 + 6.283 * f1 * Math.pow(s, 0.62) + 0.9 * Math.sin(6.283 * fw * s + ph4);   // uneven spacing: quick turns up high, long sweeps lower
    const phase2 = ph3 + 6.283 * f2 * Math.pow(s, 0.85);
    const wander = (Math.sin(phase) + 0.45 * Math.sin(phase2) + 0.28 * Math.sin(phase * 1.7 + ph1) + 0.1 * (1 - s) * Math.sin(phase * 3.3 + ph2)) / 1.25;
    let xx = base + amp * env * wander * (1 - smooth(0.7, 1, s)) * smooth(0, 0.04, s);   // the last reach turns and comes straight at you
    const m = (7 + (maxW - 7) * Math.pow(s, 1.35)) * 0.32 + 10;
    X[i] = Math.max(m, Math.min(w - m, xx));
    // a little slower on the high slope, then it runs out toward you
    Y[i] = ytop + (0.6 * s + 0.4 * Math.pow(s, 1.3)) * (yend - ytop);
  }
  // tightness of the bend at each sample (second difference of the path), smoothed along the river
  const cv = new Float32Array(M + 1);
  for (let i = 1; i < M; i++) cv[i] = Math.abs(X[i + 1] - 2 * X[i] + X[i - 1]) / Math.max(4, w * 0.004 + Math.pow(i / M, 1.2) * w * 0.02);
  const cs = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) { let a = 0, n = 0; for (let j = Math.max(0, i - 7); j <= Math.min(M, i + 7); j++) { a += cv[j]; n++; } cs[i] = a / n; }
  for (let i = 0; i <= M; i++) {
    const s = i / M, tight = Math.min(1, cs[i] * 1.1);
    // narrower and quicker where it turns hard, wider in the straights; it widens early and keeps widening
    W[i] = (7 + (maxW - 7) * Math.pow(s, 1.35)) * (1.18 - 0.4 * tight) * (1 + 0.1 * Math.sin(s * 31 + ph1) + 0.06 * Math.sin(s * 71 + ph2));
  }
  main = makeBranch(X, Y, W);
  brookTop = ytop;
  bedGrad = c.createLinearGradient(0, ytop, 0, h);
  bedGrad.addColorStop(0, '#5d86a3'); bedGrad.addColorStop(0.35, '#3b6a86'); bedGrad.addColorStop(1, '#17485c');
  branches = [main];
  const starts = [-0.055, 0.045, 0.1], joins = [0, 0, 24];
  for (let k = 0; k < 3; k++) {
    const sx = peakX + starts[k] * w, j = joins[k], ex = X[j], ey = Y[j];
    const sy = Math.max(front(sx), snowY - 6) + 2, m = 34, wig = r() * 6.28;
    const sX = new Float32Array(m + 1), sY = new Float32Array(m + 1), sW = new Float32Array(m + 1);
    for (let i = 0; i <= m; i++) {
      const s = i / m;
      sX[i] = sx + (ex - sx) * s + w * (0.026 * Math.sin(s * 9 + wig) + 0.011 * Math.sin(s * 21 + wig * 2)) * Math.sin(Math.PI * s);
      sY[i] = Math.max(sy + (ey - sy) * Math.pow(s, 0.9), front(sX[i]) + 2);
      sW[i] = 1.2 + s * s * (W[j] * 0.5 + 0.8);
    }
    const br = makeBranch(sX, sY, sW); br.join = j; streamsB[k] = br;
    branches.push(br);
  }
  // glints advected along each branch
  glints = [];
  const add = (br, cnt, bias) => { for (let i = 0; i < cnt; i++) glints.push({ br, t: Math.random(), lat: (Math.random() * 2 - 1) * 0.86, sp: 0.8 + Math.random() * 0.5, a: 0.4 + Math.random() * 0.6, span: 5 + Math.random() * 9, dark: Math.random() < 0.32, ph: Math.random() * 6.28 }); void bias; };
  add(main, phone ? 70 : 110, 0);
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
    rocks.push({ x: X[i] - main.TY[i] * side * hw * (wet ? 0.9 : 1) - main.TY[i] * (wet ? 0 : Math.sign(side) * rr * 0.3), y: Y[i] + main.TX[i] * side * hw * FS, r: rr, wet, ang: Math.atan2(-main.TX[i], main.TY[i]), ph: r() * 6.28, z, spr: rockSprite(rr, r, wet) });
  }
}

// ---- Life: wildflowers on the banks, a butterfly, a dragonfly, a far eagle ----
const FPAL = {
  yel: ['#e6dc96', '#b89a3c'], wht: ['#e4ecef', '#c9b05a'], pnk: ['#c88ca2', '#e8d49a'], blu: ['#8da4dc', '#e4e8c0'],
};
const FMIX = [['yel'], ['wht'], ['pnk'], ['blu'], ['wht', 'yel'], ['pnk', 'wht'], ['blu', 'wht'], ['yel', 'pnk']];
let fSprites = null, flowers = [], bfAnch = [], beeAnch = [];
const mkBf = (o) => Object.assign({ x: 0, y: 0, tx: 0, ty: 0, mode: 0, wait: 0, rest: false, amp: 1, lean: 0, fp: 0, rp: 0, p: 0, big: false, dip: false, nextDip: 10000 + Math.random() * 15000, hold: 0 }, o);
// two butterflies share one drawing routine: a pale cabbage white and a small orange-brown one with its own rhythm
const bfs = [
  mkBf({ wing: 'rgba(236,234,212,0.92)', edge: 'rgba(84,98,112,0.55)', spot: 'rgba(160,196,228,0.5)', size: 1, speed: 1, flap: 1, wob: 1 }),
  mkBf({ wing: 'rgba(204,126,62,0.92)', edge: 'rgba(52,30,18,0.7)', spot: 'rgba(250,226,170,0.55)', size: 0.78, speed: 1.18, flap: 1.35, wob: 1.4, p: 3100, wait: 1800 }),
];
const bee = { x: 0, y: 0, tx: 0, ty: 0, mode: 0, wait: 0, p: 0, ang: 0, f: null, dip: false, nextDip: 10000 + Math.random() * 15000, hold: 0, zig: 0 };
const droplets = [], rings = [];
for (let i = 0; i < 28; i++) droplets.push({ x: 0, y: 0, vx: 0, vy: 0, y0: 0, life: -1, r: 1 });
for (let i = 0; i < 6; i++) rings.push({ x: 0, y: 0, t: -1, s: 1 });
const df = { x: 0, y: 0, tx: 0, ty: 0, mode: 1, wait: 600, ang: 0.3, p: 0 };
const eagle = { p: 4000 };

// A clump of stems and small rosette heads, drawn once, cooled toward the night-blue so it sits in the scene.
function flowerSprite(rnd, keys) {
  const S = 2, W = 44, H = 48;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d'); g.scale(S, S); g.translate(W / 2, H - 3);
  g.lineCap = 'round';
  for (let k = 0; k < 4; k++) {   // leaf blades at the base
    const a = (k / 3 - 0.5) * 2.2 + (rnd() - 0.5) * 0.4;
    g.fillStyle = k % 2 ? '#2a5249' : '#23463f';
    g.beginPath(); g.ellipse(Math.sin(a) * 4, -2.5 - rnd() * 2, 1.1, 5 + rnd() * 3, a, 0, 7); g.fill();
  }
  const n = 5 + Math.floor(rnd() * 4), heads = [];
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1) - 0.5) * 1.5 + (rnd() - 0.5) * 0.3, len = (13 + rnd() * 14) * (1 - Math.abs(a) * 0.3);
    const bx = (rnd() - 0.5) * 8, tx = bx + Math.sin(a) * len, ty = -Math.cos(a) * len;
    g.strokeStyle = '#2f5e52'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(bx, 0); g.quadraticCurveTo(bx + Math.sin(a) * len * 0.15, -len * 0.55, tx, ty); g.stroke();
    heads.push([tx, ty, rnd()]);
  }
  for (const [hx, hy, q] of heads) {
    const pal = FPAL[keys[q < 0.72 ? 0 : keys.length - 1]], pr = 2 + rnd() * 1.1, rot = rnd() * 6;
    g.fillStyle = pal[0];
    for (let p = 0; p < 5; p++) {
      const an = p * 1.2566 + rot;
      g.beginPath(); g.ellipse(hx + Math.cos(an) * pr * 0.8, hy + Math.sin(an) * pr * 0.7, pr * 0.62, pr * 0.42, an, 0, 7); g.fill();
    }
    g.fillStyle = pal[1]; g.beginPath(); g.arc(hx, hy, pr * 0.34, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, -H, 0, 3);
  sh.addColorStop(0, 'rgba(20,48,78,0.2)'); sh.addColorStop(1, 'rgba(6,20,34,0.5)');
  g.fillStyle = sh; g.fillRect(-W, -H, W * 2, H + 6);
  return { cv, W, H };
}

function buildLife() {
  const phone = w < 620, r = rng(4242), M = main.n - 1, X = main.X, Y = main.Y, Wd = main.W;
  if (!fSprites) { fSprites = []; for (let v = 0; v < 16; v++) fSprites.push(flowerSprite(r, FMIX[v % 8])); }
  flowers.length = 0;
  const centers = phone ? 20 : 36;
  for (let ci = 0; ci < centers; ci++) {
    const t0 = 0.4 + 0.58 * Math.pow(r(), 0.75), side = r() < 0.5 ? -1 : 1, fac = 1.12 + r() * 0.5, cnt = 2 + Math.floor(r() * 3);
    for (let q = 0; q < cnt; q++) {
      const i = Math.max(0, Math.min(M, Math.round((t0 + (r() - 0.5) * 0.05) * M)));
      const hw = Wd[i] / 2 * (fac + (r() - 0.5) * 0.15) + 3 + r() * 5;
      const x = X[i] - main.TY[i] * side * hw + (r() - 0.5) * 10, y = Y[i] + main.TX[i] * side * hw * FS + (r() - 0.5) * 5;
      if (x < 8 || x > w - 8 || y > h - 4 || y < brookTop) continue;
      let bad = false;
      for (let j = 0; j <= M && !bad; j++) {   // is this point inside the ribbon at sample j? solve across (s) and along (u) in the squeezed frame
        const dx = x - X[j], dy = y - Y[j], tx = main.TX[j], ty = main.TY[j], det = -(ty * ty + FS * tx * tx);
        if (Math.abs((dx * ty - dy * tx) / det) < Wd[j] / 2 * 1.06 && Math.abs((-ty * dy - tx * FS * dx) / det) < main.L / M * 1.3) bad = true;
      }
      for (let j = 0; j < rocks.length && !bad; j++) if (Math.hypot(x - rocks[j].x, (y - rocks[j].y) * 1.6) < rocks[j].r * 1.6) bad = true;
      if (bad) continue;
      const zz = (y - brookTop) / (h - brookTop);
      flowers.push({ x, y, sc: 2 * (0.3 + 0.95 * zz) * (phone ? 0.8 : 1) * (0.85 + r() * 0.3), ph: r() * 6.28, spr: fSprites[Math.floor(r() * 16)] });
    }
  }
  flowers.sort((a, b2) => a.y - b2.y);
  bfAnch.length = 0;
  for (const f of flowers) if (f.y > h * 0.7) bfAnch.push(f);
  if (!bfAnch.length) for (const f of flowers) bfAnch.push(f);
  bfs.forEach((bf, k) => {
    bf.big = !phone;
    const a0 = bfAnch[(k * 7) % Math.max(1, bfAnch.length)];
    bf.x = bf.tx = a0 ? a0.x : w * 0.3; bf.y = bf.ty = a0 ? a0.y - 30 : h * 0.85; bf.mode = 0; bf.rest = false; bf.dip = false;
  });
  beeAnch.length = 0;
  for (const f of flowers) if (f.y > h * 0.6) beeAnch.push(f);
  if (!beeAnch.length) for (const f of flowers) beeAnch.push(f);
  const b0 = beeAnch[beeAnch.length >> 1];
  bee.x = bee.tx = b0 ? b0.x : w * 0.6; bee.y = bee.ty = b0 ? b0.y - 30 : h * 0.85; bee.mode = 0; bee.dip = false; bee.f = null; bee.wait = 0;
  for (const d of droplets) d.life = -1;
  for (const q of rings) q.t = -1;
  const i0 = Math.round(M * 0.9);
  df.x = df.tx = X[i0]; df.y = df.ty = Math.min(h - 14, Y[i0]); df.mode = 1; df.wait = 500;
}

function drawFlowers(b) {
  const sway = reduced ? 0 : 1;
  for (let i = 0; i < flowers.length; i++) {
    const f = flowers[i], sp = f.spr, sk = (Math.sin(t * 0.0012 + f.ph) * 0.025 + b * 0.03 - 0.015) * sway;
    c.save(); c.translate(f.x, f.y); c.transform(1, 0, sk, 1, 0, 0);
    c.drawImage(sp.cv, -sp.W * f.sc / 2, -sp.H * f.sc + 3 * f.sc, sp.W * f.sc, sp.H * f.sc);
    c.restore();
  }
}

function pickBf(bf) {
  const n = bfAnch.length; if (!n) return;
  const f = bfAnch[(Math.random() * n) | 0];
  bf.rest = Math.random() < 0.5;
  bf.tx = f.x + (bf.rest ? 0 : (Math.random() - 0.5) * 70); bf.ty = f.y - f.sc * 30 - (bf.rest ? 0 : 12 + Math.random() * 40);
}

// A spot on the river's lowest reach, inside the ribbon (like the dragonfly's).
function pickWater(o) {
  const M = main.n - 1, i = Math.round(M * (0.82 + Math.random() * 0.15));
  o.tx = Math.max(14, Math.min(w - 14, main.X[i] + (Math.random() - 0.5) * main.W[i] * 0.5));
  o.ty = Math.min(h - 16, main.Y[i] + (Math.random() - 0.5) * 8);
}

// The touch: a few droplets that arc up and fall, and a thin ring that spreads on the surface.
function splash(x, y) {
  const zz = Math.max(0, Math.min(1, (y - brookTop) / (h - brookTop))), sc = 0.7 + 0.6 * zz;
  let n = 4 + ((Math.random() * 3) | 0);
  for (const d of droplets) {
    if (!n) break;
    if (d.life >= 0) continue;
    n--; d.x = x + (Math.random() - 0.5) * 3 * sc; d.y = d.y0 = y; d.vx = (Math.random() - 0.5) * 0.05 * sc; d.vy = -(0.07 + Math.random() * 0.07) * sc; d.life = 0; d.r = (0.8 + Math.random() * 0.6) * sc;
  }
  const q = rings.find((o) => o.t < 0) || rings[0];
  q.x = x; q.y = y; q.t = 0; q.s = sc;
}

function drawSplash(dt) {
  c.lineWidth = 1;
  for (const q of rings) {
    if (q.t < 0) continue;
    q.t += dt / 1000;
    const a = 1 - q.t / 1.5;
    if (a <= 0) { q.t = -1; continue; }
    const R = (3 + q.t * 16) * q.s;
    c.strokeStyle = `rgba(226,246,252,${(a * 0.5).toFixed(3)})`;
    c.beginPath(); c.ellipse(q.x, q.y, R, R * 0.38, 0, 0, 7); c.stroke();
    if (q.t > 0.25) { c.strokeStyle = `rgba(226,246,252,${(a * 0.24).toFixed(3)})`; c.beginPath(); c.ellipse(q.x, q.y, R * 0.55, R * 0.38 * 0.55, 0, 0, 7); c.stroke(); }
  }
  for (const d of droplets) {
    if (d.life < 0) continue;
    d.life += dt; d.vy += 0.00028 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.y >= d.y0 && d.vy > 0) { d.life = -1; continue; }
    c.fillStyle = 'rgba(232,248,253,0.8)';
    c.beginPath(); c.ellipse(d.x, d.y, d.r, d.r * (1 + Math.min(1.4, Math.abs(d.vy) * 8)), 0, 0, 7); c.fill();
  }
}

function drawButterfly(bf, dt) {
  const sp = (reduced ? 0.3 : 1) * bf.speed;
  bf.p += dt * sp;
  bf.nextDip -= dt;
  if (!bf.dip && bf.nextDip <= 0 && !reduced) { bf.dip = true; bf.mode = 0; pickWater(bf); }
  if (bf.mode === 0) {
    const dx = bf.tx - bf.x, dy = bf.ty - bf.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.min(d, (0.012 + 0.01 * (0.5 + 0.5 * Math.sin(bf.p * 0.011))) * dt * sp);
    bf.x += dx / d * v; bf.y += dy / d * v;
    bf.lean += (Math.max(-0.5, Math.min(0.5, dx / d * 0.5)) - bf.lean) * Math.min(1, dt * 0.004);
    if (d < 3) {
      if (bf.dip) { splash(bf.x, bf.y); bf.dip = false; bf.mode = 1; bf.rest = false; bf.wait = 350; bf.nextDip = 10000 + Math.random() * 15000; }
      else if (bf.rest) { bf.mode = 1; bf.wait = 2600 + Math.random() * 3400; } else pickBf(bf);
    }
  } else {
    bf.lean += (0 - bf.lean) * Math.min(1, dt * 0.004);
    bf.wait -= dt * sp; if (bf.wait <= 0) { bf.mode = 0; pickBf(bf); }
  }
  bf.amp += ((bf.dip ? 0.12 : bf.mode === 0 ? 1 : 0) - bf.amp) * Math.min(1, dt * 0.005);
  const p = bf.p, a = bf.amp * bf.wob;
  const ox = (Math.sin(p * 0.0031) * 13 + Math.sin(p * 0.0077) * 6) * a, oy = (Math.sin(p * 0.0052) * 8 + Math.sin(p * 0.011) * 4) * a;
  let sx;
  if (bf.mode === 0 || bf.dip) { bf.fp += dt * 0.018 * sp * bf.flap; sx = reduced ? 0.8 : 0.18 + 0.82 * Math.abs(Math.cos(bf.fp)); }
  else { bf.rp += dt * 0.0035 * sp; sx = reduced ? 0.7 : 0.3 + 0.55 * (0.5 + 0.5 * Math.cos(bf.rp)); }
  const zz = Math.max(0, Math.min(1, (bf.y - brookTop) / (h - brookTop))), k = 2 * (bf.big ? 1.1 : 0.85) * bf.size * (0.75 + 0.5 * zz);
  c.save(); c.translate(bf.x + ox, bf.y + oy); c.rotate(bf.lean); c.scale(k, k);
  for (let sg = -1; sg <= 1; sg += 2) {
    c.save(); c.scale(sg * sx, 1);
    c.fillStyle = bf.wing; c.strokeStyle = bf.edge; c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(3.4, -2.4, 4.4, 3, -0.45, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(2.4, 2.5, 3, 2.4, 0.5, 0, 7); c.fill(); c.stroke();
    c.fillStyle = bf.spot; c.beginPath(); c.ellipse(1.6, -0.6, 1.8, 1.5, 0, 0, 7); c.fill();
    c.restore();
  }
  c.fillStyle = 'rgba(38,42,54,0.9)'; c.beginPath(); c.ellipse(0, 0, 0.9, 3.4, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(38,42,54,0.7)'; c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(-0.3, -3); c.lineTo(-1.8, -6); c.moveTo(0.3, -3); c.lineTo(1.8, -6); c.stroke();
  c.restore();
}

// A small round bee: zig-zags between flower clumps, hovers and bobs, lands on a head, moves on.
function pickBee() {
  const n = beeAnch.length; if (!n) return;
  let f = beeAnch[(Math.random() * n) | 0];
  for (let tries = 0; tries < 6 && (f === bee.f || Math.hypot(f.x - bee.x, f.y - bee.y) < 60); tries++) f = beeAnch[(Math.random() * n) | 0];
  bee.f = f;
  bee.tx = f.x + (Math.random() - 0.5) * 6 * f.sc * 0.5; bee.ty = f.y - f.sc * (16 + Math.random() * 9);
}

function drawBee(dt) {
  const sp = reduced ? 0.3 : 1;
  bee.p += dt * sp; bee.nextDip -= dt;
  if (!bee.dip && bee.nextDip <= 0 && !reduced && bee.mode !== 2) { bee.dip = true; bee.mode = 0; pickWater(bee); }
  let jx = 0, jy = 0, landed = false;
  if (bee.mode === 0) {          // travelling: fast, zig-zagging across the line to the target
    const dx = bee.tx - bee.x, dy = bee.ty - bee.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.min(d, (0.075 + Math.min(0.06, d * 0.0008)) * dt * sp);
    bee.x += dx / d * v; bee.y += dy / d * v;
    const want = Math.atan2(dy, dx); let da = want - bee.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    bee.ang += da * Math.min(1, dt * 0.01);
    const z = Math.sin(bee.p * 0.016) * Math.min(1, d / 50) * 11 * (bee.dip ? 0.5 : 1);
    jx = -dy / d * z; jy = dx / d * z;
    if (d < 1.5) {
      if (bee.dip) { splash(bee.x, bee.y); bee.dip = false; bee.mode = 1; bee.hold = 380; bee.skip = true; bee.nextDip = 10000 + Math.random() * 15000; }
      else { bee.mode = 1; bee.hold = 700 + Math.random() * 700; }   // hover over the head before landing
    }
  } else if (bee.mode === 1) {   // hover: a faint bob
    jx = Math.sin(bee.p * 0.011) * 1.6; jy = Math.sin(bee.p * 0.021) * 1.8 + Math.sin(bee.p * 0.047) * 0.6;
    bee.hold -= dt * sp;
    if (bee.hold <= 0) {
      if (bee.skip || !bee.f) { bee.skip = false; bee.mode = 0; pickBee(); }
      else { bee.mode = 2; bee.wait = 1100 + Math.random() * 1900; }
    }
  } else {                       // landed on the flower head: nearly still, a small wiggle
    landed = true;
    jx = Math.sin(bee.p * 0.03) * 0.5; jy = 2.2 + Math.sin(bee.p * 0.05) * 0.3;
    bee.wait -= dt * sp; if (bee.wait <= 0) { bee.wait = 0; bee.mode = 0; pickBee(); }
  }
  const zz = Math.max(0, Math.min(1, (bee.y - brookTop) / (h - brookTop))), k = 2 * 0.62 * (w < 620 ? 0.85 : 1) * (0.75 + 0.5 * zz);
  c.save(); c.translate(bee.x + jx, bee.y + jy); c.rotate(landed ? Math.sin(bee.p * 0.002) * 0.15 + bee.ang * 0.6 : bee.ang * 0.5); c.scale(k, k);
  // wings first, under the body: two ovals, jittered fast so they blur
  const fly = !landed;
  c.fillStyle = `rgba(226,242,250,${fly ? 0.2 : 0.3})`;
  for (let q = 0; q < (reduced ? 1 : 3); q++) {
    const jit = fly && !reduced ? (Math.random() - 0.5) * 0.9 : 0.1 * q;
    for (let sg = -1; sg <= 1; sg += 2) {
      c.save(); c.translate(0.8, sg * 1.2); c.rotate(sg * (fly ? 1.9 + jit : 2.6 + 0.1 * q)); c.beginPath(); c.ellipse(2.3, 0, 3.4, 1.3, 0, 0, 7); c.fill(); c.restore();
    }
  }
  c.fillStyle = 'rgba(206,168,66,0.97)'; c.beginPath(); c.ellipse(-1.3, 0, 3.4, 2.5, 0, 0, 7); c.fill();       // abdomen
  c.fillStyle = 'rgba(44,34,24,0.9)';
  c.beginPath(); c.ellipse(-0.1, 0, 0.7, 2.3, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(-2.0, 0, 0.7, 2.1, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(-3.9, 0, 0.5, 1.2, 0, 0, 7); c.fill();                                              // tip
  c.fillStyle = 'rgba(78,60,36,0.95)'; c.beginPath(); c.arc(2.1, 0, 2, 0, 7); c.fill();                        // fuzzy thorax
  c.fillStyle = 'rgba(40,32,26,0.95)'; c.beginPath(); c.arc(3.9, 0, 1.15, 0, 7); c.fill();                     // head
  c.restore();
}

function pickDf() {
  const M = main.n - 1;
  for (let tries = 0; tries < 5; tries++) {
    const i = Math.round(M * (0.8 + Math.random() * 0.19));
    const x = Math.max(12, Math.min(w - 12, main.X[i] + (Math.random() - 0.5) * main.W[i] * 0.5)), y = Math.min(h - 14, main.Y[i] + (Math.random() - 0.5) * 10);
    df.tx = x; df.ty = y;
    if (Math.hypot(x - df.x, y - df.y) > 90) break;
  }
  df.ang = Math.atan2(df.ty - df.y, df.tx - df.x);
}

function drawDragonfly(dt) {
  const sp = reduced ? 0.3 : 1;
  df.p += dt * sp;
  let jx = 0, jy = 0;
  if (df.mode === 0) {
    const dx = df.tx - df.x, dy = df.ty - df.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.min(d, Math.min(0.5, 0.05 + d * 0.02) * dt * sp);
    df.x += dx / d * v; df.y += dy / d * v;
    if (d < 2) { df.mode = 1; df.wait = 700 + Math.random() * 1800; }
  } else {
    jx = Math.sin(df.p * 0.05) * 1.1 + Math.sin(df.p * 0.017) * 2; jy = Math.sin(df.p * 0.043) * 1 + Math.sin(df.p * 0.021) * 1.5;
    df.wait -= dt * sp; if (df.wait <= 0) { df.mode = 0; pickDf(); }
  }
  const zz = Math.max(0, Math.min(1, (df.y - brookTop) / (h - brookTop))), k = 2 * (w < 620 ? 0.8 : 1) * (0.7 + 0.5 * zz);
  const px = df.x + jx, py = df.y + jy;
  c.fillStyle = 'rgba(2,14,24,0.14)'; c.beginPath(); c.ellipse(px + 5 * k, py + 13 * k, 8 * k, 2.4 * k, 0, 0, 7); c.fill();
  c.save(); c.translate(px, py); c.rotate(df.ang); c.scale(k, k);
  c.fillStyle = 'rgba(214,242,250,0.2)'; c.strokeStyle = 'rgba(214,242,250,0.35)'; c.lineWidth = 0.4;
  const pass = reduced ? 1 : 2;
  for (let q = 0; q < pass; q++) {
    const jit = reduced ? 0 : Math.sin(df.p * 0.17 + q * 2.4) * 0.16, fl = reduced ? 0 : Math.sin(df.p * 0.11 + q) * 0.1;
    for (let sg = -1; sg <= 1; sg += 2) {
      c.save(); c.rotate(sg * (1.72 + jit + fl)); c.beginPath(); c.ellipse(6, 0, 6.5, 1.25, 0, 0, 7); c.fill(); if (q === 0) c.stroke(); c.restore();
      c.save(); c.translate(-1.6, 0); c.rotate(sg * (1.98 - jit + fl)); c.beginPath(); c.ellipse(5.5, 0, 6, 1.35, 0, 0, 7); c.fill(); c.restore();
    }
  }
  c.lineCap = 'round'; c.strokeStyle = 'rgba(110,206,224,0.95)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-2, 0); c.lineTo(-15, 0); c.stroke();
  c.strokeStyle = 'rgba(30,80,110,0.55)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(-6, 0); c.lineTo(-6.7, 0); c.moveTo(-9.5, 0); c.lineTo(-10.2, 0); c.moveTo(-13, 0); c.lineTo(-13.7, 0); c.stroke();
  c.fillStyle = 'rgba(150,230,238,0.97)'; c.beginPath(); c.arc(0, 0, 2, 0, 7); c.fill();
  c.fillStyle = 'rgba(210,246,250,0.97)'; c.beginPath(); c.arc(2.8, 0, 1.5, 0, 7); c.fill();
  c.restore();
}

// One dark soaring bird, far off, seen from below: broad deep wings held in a shallow V, a fanned tail, and
// separated "fingers" at each tip. The span narrows a little as it turns across the view.
const FT = [[1.0, -0.19, 0.93, -0.12], [0.985, -0.1, 0.915, -0.04], [0.92, -0.02, 0.85, 0.03], [0.82, 0.05, 0.75, 0.09]];
function eagleWing(S) {
  c.beginPath(); c.moveTo(0, -0.03 * S);
  c.quadraticCurveTo(0.5 * S, -0.11 * S, S, -0.19 * S);
  for (let k = 0; k < 4; k++) {
    const f = FT[k];
    if (k) c.lineTo(f[0] * S, f[1] * S);
    c.lineTo(f[2] * S - 0.02 * S, f[3] * S + 0.06 * S);   // the notch between feathers
  }
  c.quadraticCurveTo(0.5 * S, 0.14 * S, 0.12 * S, 0.17 * S);
  c.lineTo(0, 0.13 * S); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(200,218,232,0.5)'; c.lineWidth = Math.max(0.7, S * 0.055);
  c.beginPath();
  for (let k = 0; k < 4; k++) { const f = FT[k]; c.moveTo(f[0] * S - 0.05 * S, f[1] * S + 0.045 * S); c.lineTo(f[0] * S, f[1] * S); }
  c.stroke();
}

function drawEagle(dt) {
  eagle.p += dt * (reduced ? 0.25 : 1);
  // one long glide across the whole sky, then back the other way; it rides a slow swell and banks a little into it
  const p = eagle.p, S = Math.max(34, Math.min(64, w * 0.056)), span = w + S * 6, T = 38000;
  const leg = Math.floor(p / T), u = (p % T) / T, dir = leg % 2 ? -1 : 1;
  const x = dir > 0 ? -S * 3 + span * u : w + S * 3 - span * u;
  const y = h * (0.13 + 0.05 * Math.sin(u * 6.283 * 1.3 + leg)) + Math.sin(p * 0.0011) * 3;
  const ca = dir, sa = Math.cos(u * 6.283 * 1.3 + leg) * 0.6 * dir;
  c.save(); c.translate(x, y); c.rotate(sa * 0.12);
  c.fillStyle = 'rgba(8,20,34,0.88)';
  c.save(); c.scale(0.86 + 0.14 * Math.abs(ca), 1);
  c.save(); eagleWing(S); c.scale(-1, 1); eagleWing(S); c.restore();
  c.restore();
  c.fillStyle = 'rgba(8,20,34,0.93)';
  c.beginPath(); c.ellipse(0, 0.02 * S, 0.075 * S, 0.21 * S, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(-0.06 * S, 0.17 * S); c.lineTo(-0.13 * S, 0.44 * S); c.quadraticCurveTo(0, 0.5 * S, 0.13 * S, 0.44 * S); c.lineTo(0.06 * S, 0.17 * S); c.closePath(); c.fill();
  c.beginPath(); c.arc(-sa * 0.04 * S, -0.22 * S, 0.065 * S, 0, 7); c.fill();
  c.restore();
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
  // the shore: wet gravel, a shade lighter than the slope
  c.fillStyle = 'rgba(92,104,112,0.5)';
  for (let i = 0; i < branches.length; i++) c.fill(branches[i].bank);
  // the water: sky on its far reaches, depth near you
  c.fillStyle = bedGrad;
  for (let i = 0; i < branches.length; i++) c.fill(branches[i].bed);
  // the deep channel, darker, swinging to the outside of each bend
  c.fillStyle = 'rgba(6,26,40,0.2)';
  c.fill(main.core);
  // a thin wet line where water meets gravel
  c.strokeStyle = 'rgba(214,236,244,0.16)'; c.lineWidth = 1;
  for (let i = 0; i < branches.length; i++) c.stroke(branches[i].edge);

  // the current: long soft lines that follow the banks and bend with the river, some bright, some dark
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < glints.length; i++) {
    const g = glints[i], br = g.br, n1 = br.n - 1;
    const fi = Math.min(n1 - 0.001, g.t * n1), k = fi | 0;
    const z = Math.max(0, (br.Y[k] - brookTop) / (h - brookTop));
    g.t += (0.022 + 0.1 * z) * g.sp * flow * dt / br.L;
    if (g.t >= 1) { g.t = 0; g.lat = (Math.random() * 2 - 1) * 0.86; g.sp = 0.8 + Math.random() * 0.5; }
    const span = Math.max(2, Math.min(g.span * (0.5 + z * 1.4), fi));
    const calm = 0.5 + 0.5 * (1 - br.CALM[k]) + z * 0.15;
    const fade = Math.sin(Math.PI * g.t) ** 0.6;
    const alpha = g.a * calm * fade * (g.dark ? 0.2 : 0.17) * (reduced ? 0.8 : 0.8 + 0.2 * Math.sin(t * 0.002 + g.ph));
    c.strokeStyle = g.dark ? `rgba(6,26,40,${alpha.toFixed(3)})` : `rgba(218,240,248,${alpha.toFixed(3)})`;
    c.lineWidth = (g.dark ? 1.2 : 0.7) + z * (g.dark ? 2.6 : 1.5);
    c.beginPath();
    const steps = Math.max(2, Math.ceil(span));
    for (let j = 0; j <= steps; j++) {
      const q = fi - span * (j / steps), qi = Math.max(0, q | 0), qf = q - qi, q2 = Math.min(n1, qi + 1);
      const x = br.X[qi] + (br.X[q2] - br.X[qi]) * qf, y = br.Y[qi] + (br.Y[q2] - br.Y[qi]) * qf;
      const lat = g.lat + 0.05 * Math.sin(q * 0.35 + g.ph);            // a current line drifts a little across the stream
      const hw = (br.W[qi] / 2) * lat;
      const px = x - br.TY[qi] * hw, py = y + br.TX[qi] * hw * FS;
      j ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
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
    // the stone itself keeps its own light: drawn upright, not turned with the current
    c.rotate(-k.ang);
    c.fillStyle = 'rgba(2,10,18,0.5)';        // contact shadow, falling away from the light
    c.beginPath(); c.ellipse(r * 0.28, r * k.spr.squash * 0.72, r * 1.15, r * k.spr.squash * 0.42, 0, 0, 7); c.fill();
    if (k.wet) {                              // its dark reflection in the moving water
      c.globalAlpha = 0.22; c.save(); c.translate(0, r * k.spr.squash * 1.5); c.scale(1, -0.45);
      c.drawImage(k.spr.cv, -k.spr.size / 2, -k.spr.size / 2, k.spr.size, k.spr.size); c.restore(); c.globalAlpha = 1;
    }
    c.drawImage(k.spr.cv, -k.spr.size / 2, -k.spr.size / 2, k.spr.size, k.spr.size);
    c.rotate(k.ang);
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

    const dtc = Math.min(dt, 50);
    c.save(); c.translate(camX * 0.1, 0); drawEagle(dtc); c.restore();

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
    drawFlowers(b);

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
    drawDragonfly(dtc);
    drawSplash(dtc);
    drawBee(dtc);
    for (const b2 of bfs) drawButterfly(b2, dtc);
    c.restore();
    drawTaps(c, dt);
  },

  resize(ctx) { layout(ctx); drop.active = false; camX = 0; },

  unmount() { offPhase?.(); },
};
