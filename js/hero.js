// The living lake. An almost-empty page. One droplet appears, falls, plip. The ripple becomes a puddle that starts to flow.
// Then the world goes on without you: a cloud, a gust, rain, mist on the inhale. Your presence is noticed, never required.
import breath from './breath.js';
import audio from './audio.js';
import { presence, updatePresence } from './presence.js';

const canvas = document.getElementById('hero-canvas');
const c = canvas.getContext('2d');
const hero = document.querySelector('.hero');
const narrowQ = matchMedia('(max-width: 820px)');
let dpr = Math.min(devicePixelRatio || 1, narrowQ.matches ? 1.5 : 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FAST = new URLSearchParams(location.search).has('fast');   // ?fast=1 compresses the weather schedule (testing)
const K = FAST ? 0.2 : 1;
let w = 0, h = 0;
let surf = new Float32Array(2);   // sampled surface heights, refilled each frame

// ---------- tiny seeded random: the first two minutes are alike for everyone, never identical ----------
let seed = (Date.now() % 100000) + 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };

function resize() {
  const r = hero.getBoundingClientRect();
  const nw = Math.round(r.width), nh = Math.round(r.height);
  const nd = Math.min(devicePixelRatio || 1, narrowQ.matches ? 1.5 : 2);
  if (nw === w && nh === h && nd === dpr) return;   // mobile URL bars fire resize while scrolling
  w = nw; h = nh; dpr = nd;
  canvas.width = w * dpr; canvas.height = h * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  surf = new Float32Array(Math.ceil(w / 8) + 2);
}
resize();
addEventListener('resize', resize);

let inView = true;
if ('IntersectionObserver' in window) new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; }).observe(hero);

// ---------- stars ----------
const STARS = 140;
const stars = [];
{
  let s = 42;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < STARS; i++) {
    stars.push({ u: r(), v: r() * r() * 0.55, r: 0.4 + r() * 1.1, ph: r() * Math.PI * 2, sp: 0.4 + r() * 1.4, big: r() < 0.08 });
  }
}
let starGlass = 0, starDim = 0;
function drawStars(t, level) {
  const glow = (0.55 + breath.value * 0.35) * (1 + 0.35 * starGlass) * (1 - 0.7 * starDim);
  c.fillStyle = '#dffbff'; c.strokeStyle = '#dffbff';
  for (let i = 0; i < STARS; i++) {
    const s = stars[i];
    const x = s.u * w, y = s.v * h;
    const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
    const a = Math.min(1, (0.25 + tw * 0.75) * glow * (1 - s.v / 0.6));
    c.globalAlpha = a;
    c.beginPath(); c.arc(x, y, s.r, 0, Math.PI * 2); c.fill();
    if (starGlass > 0.02 && s.r > 0.9) {   // still water holds a faint mirror of the brightest stars
      const ry = level + (level - y) * 0.5;
      if (ry < h) { c.globalAlpha = a * 0.28 * starGlass; c.fillRect(x - 0.6, ry, 1.4, 1.4); }
    }
    if (s.big && tw > 0.75) {
      const L = 3 + tw * 5;
      c.globalAlpha = a * 0.6; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(x - L, y); c.lineTo(x + L, y); c.moveTo(x, y - L); c.lineTo(x, y + L); c.stroke();
    }
  }
  c.globalAlpha = 1;
}

// ---------- pre-rendered sprites (built once, drawn with drawImage) ----------
function blobCloud(cw, ch, n, rgb, alpha, spread) {
  const oc = document.createElement('canvas'); oc.width = cw; oc.height = ch;
  const g = oc.getContext('2d');
  for (let i = 0; i < n; i++) {
    const x = cw * (0.12 + rnd() * 0.76), y = ch * (0.5 + (rnd() + rnd() - 1) * spread);
    const rx = cw * (0.07 + rnd() * 0.16), ry = rx * (0.16 + rnd() * 0.2);
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  return oc;
}
let wispSprite = null, rainSprite = null, mistSprite = null;
if (!reduced) {
  wispSprite = blobCloud(560, 150, 30, '175,210,228', 0.13, 0.28);
  rainSprite = blobCloud(1100, 220, 56, '78,108,132', 0.17, 0.3);
  mistSprite = document.createElement('canvas'); mistSprite.width = mistSprite.height = 64;
  const g = mistSprite.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(200,228,240,1)'); gr.addColorStop(1, 'rgba(200,228,240,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}

// ---------- ripple pool (cap 40, no allocation) ----------
const RN = 40;
const rp = [];
for (let i = 0; i < RN; i++) rp.push({ on: false, x: 0, y: 0, t: 0, spd: 90, life: 3.2, a: 0.6, lw: 1.5 });
let rpNext = 0;
// t starts at -delay. soft ripples (rain, wake, splash) are dropped rather than stealing a slot.
function addRipple(x, y, delay = 0, spd = 90, life = 3.2, a = 0.6, lw = 1.5, soft = false) {
  let s = null;
  for (let k = 0; k < RN; k++) { const q = rp[(rpNext + k) % RN]; if (!q.on) { s = q; rpNext = (rpNext + k + 1) % RN; break; } }
  if (!s) { if (soft) return; s = rp[rpNext]; rpNext = (rpNext + 1) % RN; }
  s.on = true; s.x = x; s.y = y; s.t = -delay; s.spd = spd; s.life = life; s.a = a; s.lw = lw;
}

// ---------- splash drops (cap 24) ----------
const SN = 24;
const sp = [];
for (let i = 0; i < SN; i++) sp.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, ly: 0 });
function splash(x, y) {
  const n = 3 + Math.floor(rnd() * 4);
  for (let k = 0, made = 0; k < SN && made < n; k++) {
    const d = sp[k]; if (d.on) continue;
    d.on = true; d.x = x + (rnd() - 0.5) * 8; d.y = y; d.ly = y;
    d.vx = (rnd() - 0.5) * 0.22; d.vy = -(0.2 + rnd() * 0.2); made++;
  }
}

// ---------- rain (cap 300) ----------
const RAIN = 300;
const rd = [];
for (let i = 0; i < RAIN; i++) rd.push({ on: false, x: 0, y: 0, vy: 0, ly: 0, len: 0 });
let rdNext = 0, rainAcc = 0;

// ---------- sheen: the current that goes somewhere ----------
const SH = 16;
const sheen = [];
for (let i = 0; i < SH; i++) sheen.push({ xf: rnd() * 1.2 - 0.1, d: rnd(), len: 40 + rnd() * 90, ph: rnd() * 6.28 });

// ---------- mist (cap 80) ----------
const MN = 80;
const mist = [];
for (let i = 0; i < MN; i++) mist.push({ u: rnd(), o: rnd(), r: 40 + rnd() * 70, vx: (rnd() - 0.5) * 7, ph: rnd() * 6.28 });
const mistS = { on: false, level: 0, target: 0, last: -1e9 };

// ---------- weather state ----------
const wisp = { on: false, t0: 0, dur: 0, y: 0, k: 1 };
const rcloud = { on: false, t0: 0, dur: 0, dx: 0 };
const gust = { on: false, t0: 0, dur: 0, dir: 1 };
const rain = { on: false, armed: false, t0: 0, dur: 0, peak: 0.6, r: 0, soundOn: false };
let lastRainEnd = -1e9, lastEnd = 0, wasBusy = false, nextAt = -1, queue = null, qi = 0;
const EV_WISP = 0, EV_GUST = 1, EV_RAIN = 2;

function fire(type, t) {
  if (type === EV_WISP) { wisp.on = true; wisp.t0 = t; wisp.dur = 22 + rnd() * 6; wisp.y = 0.07 + rnd() * 0.13; wisp.k = 0.8 + rnd() * 0.5; }
  else if (type === EV_GUST) { gust.on = true; gust.t0 = t; gust.dur = 11 + rnd() * 5; gust.dir = 1; }
  else if (type === EV_RAIN && !rcloud.on) {
    rcloud.on = true; rcloud.t0 = t; rcloud.dur = 6 + 15 + rnd() * 8 + 5; rcloud.dx = (rnd() - 0.5) * 60;
    rain.armed = true; rain.t0 = t + 6; rain.dur = 15 + rnd() * 8; rain.peak = 0.5 + rnd() * 0.4;
  }
}
function planNext(t) {
  let type;
  if (t - lastRainEnd > 75 * K && rnd() < 0.4) type = EV_RAIN; else type = rnd() < 0.5 ? EV_WISP : EV_GUST;
  queue[qi] = { at: t + (20 + rnd() * 20) * K, type };
}

function updateWeather(t, dt, level) {
  // schedule
  if (nextAt < 0) return;
  const busy = wisp.on || rcloud.on || gust.on || mistS.on;
  if (wasBusy && !busy) lastEnd = t;
  wasBusy = busy;
  const ev = queue[qi];
  if (t >= ev.at) { fire(ev.type, t); qi++; if (qi >= queue.length) planNext(t); nextAt = queue[qi].at; }
  // linger long enough and the world carries on without you
  else if (presence.idleMs > 30000 && !busy && ev.at - t > 3 && t - lastEnd > 6) ev.at = t + 1;

  if (wisp.on && t > wisp.t0 + wisp.dur) wisp.on = false;
  if (gust.on && t > gust.t0 + gust.dur) gust.on = false;
  if (rain.armed && t >= rain.t0) {
    rain.armed = false; rain.on = true;
    if (audio.enabled && inView) audio.setScene?.('rain');
  }
  if (rain.on) {
    const e = t - rain.t0;
    rain.r = rain.peak * smooth(e / 4) * smooth((rain.dur - e) / 5);
    if (e > rain.dur) { rain.on = false; rain.r = 0; lastRainEnd = t; if (audio.enabled && inView) audio.setScene?.('default'); }
  }
  if (rcloud.on && t > rcloud.t0 + rcloud.dur) rcloud.on = false;

  // rain drops: spawn according to intensity, one preallocated pool
  if (rain.r > 0.01) {
    rainAcc += rain.r * 520 * Math.max(0.35, Math.min(1, w / 900)) * dt / 1000;
    while (rainAcc >= 1) {
      rainAcc -= 1;
      let d = null;
      for (let k = 0; k < RAIN; k++) { const q = rd[(rdNext + k) % RAIN]; if (!q.on) { d = q; rdNext = (rdNext + k + 1) % RAIN; break; } }
      if (!d) break;
      const depth = rnd();
      d.on = true; d.x = rnd() * (w + 60) - 10; d.y = h * (0.1 + rnd() * 0.12);
      d.ly = level + 3 + depth * depth * (h - level) * 0.55;
      d.vy = 0.55 + depth * 0.5; d.len = 7 + depth * 12;
    }
  }
}

// ---------- state ----------
const start = performance.now();
let tVis = 0;
let dropY = -20, dropV = 0, landed = false, revealed = false, tLanded = 0, tRevealed = 0;
let last = start;
const waterLine = () => h * 0.62;
let glass = 0, flowBoost = 0, lastWake = 0, noticed = true, seenMoves = 0, puddleX = 0;

function drawDrop(x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r * 1.8);
  c.bezierCurveTo(x + r * 1.2, y - r * 0.2, x + r, y + r, x, y + r);
  c.bezierCurveTo(x - r, y + r, x - r * 1.2, y - r * 0.2, x, y - r * 1.8);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.6);
  g.addColorStop(0, '#dffbff'); g.addColorStop(0.5, '#7ff2ff'); g.addColorStop(1, '#2fb8c6');
  c.fillStyle = g; c.fill();
}

function frame(now) {
  const dt = Math.min(now - last, 50); last = now;
  // Count only the time the page has been on screen, so an intro opened in a background tab still plays in order.
  tVis += dt / 1000;
  const t = tVis;
  if (!reduced) updatePresence(now);
  if (!inView && revealed) { requestAnimationFrame(frame); return; }
  c.clearRect(0, 0, w, h);
  const cx = w / 2;
  const wl = waterLine();
  const level = wl + (0.5 - breath.value) * 22;

  // presence-driven state
  const idle = reduced ? 0 : presence.idleMs;
  glass += ((idle > 12000 ? clamp((idle - 12000) / 6000, 0, 1) : 0) - glass) * Math.min(1, dt / 1800);
  starGlass = glass;
  const cover = rcloud.on ? Math.min(smooth((t - rcloud.t0) / 5), smooth((rcloud.t0 + rcloud.dur - t) / 5)) : 0;
  starDim = cover;
  drawStars(reduced ? 0 : t, level);

  if (!reduced) {
    if (revealed && nextAt < 0) {
      tRevealed = t;
      queue = [
        { at: t + (8 + rnd() * 4) * K, type: EV_WISP },
        { at: t + (22 + rnd() * 4) * K, type: EV_GUST },
        { at: t + (34 + rnd() * 10) * K, type: EV_RAIN },
      ];
      nextAt = queue[0].at;
    }
    updateWeather(t, dt, level);
    const boostT = Math.min(3, Math.abs(presence.scrollV) / 700);
    flowBoost = Math.max(flowBoost * Math.exp(-dt / 1800), boostT);
  }

  // clouds, high in the sky
  if (wisp.on) {
    const u = (t - wisp.t0) / wisp.dur;
    const cw = Math.min(560, w * 0.9) * wisp.k, ch = cw * 150 / 560;
    c.globalAlpha = Math.sin(Math.PI * clamp(u, 0, 1)) * 0.9;
    c.drawImage(wispSprite, -cw + (w + cw * 2) * u, wisp.y * h - ch / 2 + Math.sin(u * 3) * 6, cw, ch);
    c.globalAlpha = 1;
  }
  if (cover > 0.01) {
    const cw = w * 1.5, ch = cw * 220 / 1100;
    c.globalAlpha = cover * 0.75;
    c.drawImage(rainSprite, (w - cw) / 2 + rcloud.dx + (t - rcloud.t0) * 2, h * 0.14 - ch / 2, cw, ch);
    c.globalAlpha = 1;
  }

  // The water: a surface that rises and falls with the breath.
  const calm = 1 - 0.55 * glass;
  const n = Math.ceil(w / 8) + 1;
  const gx = gust.on ? -260 + (w + 520) * ((t - gust.t0) / gust.dur) : 0;
  const gAmp = gust.on ? Math.sin(Math.PI * clamp((t - gust.t0) / gust.dur, 0, 1)) : 0;
  for (let i = 0; i < n; i++) {
    const x = i * 8;
    let y = level + (Math.sin(x * 0.012 + t * 0.7) * 3 + Math.sin(x * 0.03 - t * 1.1) * 1.5) * calm;
    if (gAmp > 0) { const u = (x - gx) / 130; if (u > -2.6 && u < 2.6) y += Math.exp(-u * u) * gAmp * 3.2 * Math.sin(x * 0.12 - t * 7.5 + Math.sin(x * 0.05) * 2); }
    surf[i] = y;
  }
  const g = c.createLinearGradient(0, level - 10, 0, h);
  g.addColorStop(0, `rgba(47,184,198,${0.35 + breath.value * 0.15})`);
  g.addColorStop(0.35, 'rgba(11,51,82,0.75)');
  g.addColorStop(1, 'rgba(4,17,31,0.95)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, h);
  for (let i = 0; i < n; i++) c.lineTo(i * 8, surf[i]);
  c.lineTo(w, h); c.closePath(); c.fill();
  // surface glint (glassier when nobody is touching the water)
  c.strokeStyle = `rgba(127,242,255,${0.15 + breath.value * 0.25 + glass * 0.12})`;
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < n; i++) i === 0 ? c.moveTo(0, surf[0]) : c.lineTo(i * 8, surf[i]);
  c.stroke();
  if (gAmp > 0.05) {   // a few glints where the chop is
    c.strokeStyle = 'rgba(200,245,255,0.28)'; c.globalAlpha = gAmp;
    c.beginPath();
    const ph = Math.floor(t * 5);
    for (let i = 1; i < n - 1; i++) {
      const u = (i * 8 - gx) / 130;
      if (u > -1.4 && u < 1.4 && (i + ph) % 3 === 0) { c.moveTo(i * 8 - 3, surf[i]); c.lineTo(i * 8 + 4, surf[i] - 0.6); }
    }
    c.stroke(); c.globalAlpha = 1;
  }

  // The droplet: appears after a quiet second, hangs, then falls.
  if (!landed) {
    if (reduced) { landed = true; addRipple(cx, level); }
    else if (t > 1.0) {
      const hang = Math.min(1, (t - 1.0) / 1.6);       // 1.6s to fade in and hang
      const r = 9 + Math.sin(t * 3) * 0.6;
      const y = h * 0.28 + Math.sin(t * 2) * 2;
      if (t < 3.0) {
        c.globalAlpha = hang; drawDrop(cx, y, r); c.globalAlpha = 1; dropY = y;
      } else {
        dropV += 0.0022 * dt; dropY += dropV * dt;
        drawDrop(cx, dropY, r);
        if (dropY >= level - 4) {
          landed = true; tLanded = t;
          addRipple(cx, level); addRipple(cx, level, 0.26);
          audio.plip(1);
        }
      }
    }
  }
  // The drop first. plip. Then the word rises out of the ripples, then the invitation.
  if (landed && !revealed) { revealed = true; hero.classList.add('revealed'); hero.classList.add('landed'); }

  // The puddle spreads from where the drop landed, and begins to flow toward the right edge.
  if (landed && !reduced) {
    const pt = t - tLanded;
    const spread = 1 - Math.exp(-pt / 5);
    const flow = smooth((pt - 2.5) / 6);
    const rx = spread * w * 0.26 + 12, ry = rx * 0.11;
    puddleX = cx + spread * w * 0.05;
    c.fillStyle = 'rgb(127,242,255)';
    c.globalAlpha = 0.07 + 0.03 * breath.value;
    c.beginPath(); c.ellipse(puddleX, level + ry * 0.7 + 4, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha *= 0.8;
    c.beginPath(); c.ellipse(puddleX + rx * 0.12, level + ry * 0.7 + 4, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    // sheen streaks slide right; nearer (lower) ones are longer and quicker; scrolling and gusts push harder
    if (flow > 0.01) {
      const push = 1 + flowBoost * 2.5 + gAmp * 1.5;
      c.strokeStyle = 'rgb(170,240,250)'; c.lineCap = 'round';
      for (let i = 0; i < SH; i++) {
        const s = sheen[i];
        const px = s.xf * w;
        s.xf += ((16 + s.d * 46) * push / w) * dt / 1000;
        if (px > w + s.len) { s.xf = -s.len / w; s.d = rnd(); s.len = 40 + rnd() * 90; }
        const y = level + 10 + s.d * s.d * (h - level) * 0.5 + Math.sin(t * 0.5 + s.ph) * 2;
        const edge = Math.min(1, (px + s.len) / (w * 0.12)) * Math.min(1, (w + s.len - px) / (w * 0.1));
        const a = (0.05 + 0.06 * s.d) * (0.6 + 0.4 * Math.sin(t * 0.8 + s.ph)) * (0.55 + 0.45 * px / w) * flow * edge * (1 + glass * 0.6);
        if (a < 0.004) continue;
        c.globalAlpha = a; c.lineWidth = 1 + s.d * 2.2;
        c.beginPath(); c.moveTo(px, y); c.lineTo(px + s.len * (0.7 + s.d * 0.6), y - 0.4); c.stroke();
      }
      c.globalAlpha = 1; c.lineCap = 'butt';
    }
  }

  // Wake: a path of small ripples behind a moving mouse; the water notices when it stops.
  if (!reduced && revealed && presence.pointerType === 'mouse') {
    const r = hero.getBoundingClientRect();
    const px = presence.x - r.left, py = presence.y - r.top;
    const inHero = px >= 0 && px <= w && py >= 0 && py <= h;
    if (inHero && presence.speed > 40 && py >= level - 6 && t - lastWake > 0.17 - Math.min(0.12, presence.speed / 14000)) {
      lastWake = t;
      const amp = Math.min(1, 0.25 + presence.speed / 1600);
      addRipple(px, Math.min(Math.max(py, level), h - 4), 0, 30 + amp * 34, 1.2 + amp * 1.0, 0.14 + amp * 0.24, 1, true);
    }
    if (presence.moves !== seenMoves) { seenMoves = presence.moves; noticed = false; }
    if (!noticed && presence.idleMs > 1800) {
      noticed = true;
      if (inHero) addRipple(px, Math.min(Math.max(py, level), h - 4), 0, 44, 3.4, 0.4, 1.3);
    }
  }

  // Ripples: ellipses expanding on the surface, fading.
  c.strokeStyle = 'rgb(127,242,255)';
  for (let i = 0; i < RN; i++) {
    const q = rp[i];
    if (!q.on) continue;
    q.t += dt / 1000;
    if (q.t < 0) continue;
    const a = 1 - q.t / q.life;
    if (a <= 0) { q.on = false; continue; }
    const R = q.t * q.spd;
    c.globalAlpha = a * q.a; c.lineWidth = q.lw;
    c.beginPath(); c.ellipse(q.x, q.y, R, R * 0.22, 0, 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = 1;

  // Splash droplets: arc up, fall back, leave a tiny ring.
  if (!reduced) {
    let any = false;
    c.fillStyle = '#bff6ff'; c.globalAlpha = 0.85; c.beginPath();
    for (let i = 0; i < SN; i++) {
      const d = sp[i]; if (!d.on) continue;
      d.vy += 0.0011 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.vy > 0 && d.y >= d.ly) { d.on = false; addRipple(d.x, d.ly, 0, 26, 1.0, 0.38, 1, true); continue; }
      c.moveTo(d.x + 1.7, d.y); c.arc(d.x, d.y, 1.7, 0, Math.PI * 2); any = true;
    }
    if (any) c.fill();
    c.globalAlpha = 1;
  }

  // Mist gathers over the water on the inhale and lifts on the exhale.
  if (mistS.on) {
    mistS.level += (mistS.target - mistS.level) * Math.min(1, dt / (mistS.target ? 1800 : 2200));
    if (mistS.target === 0 && mistS.level < 0.01) { mistS.on = false; mistS.level = 0; }
    const L = mistS.level;
    for (let i = 0; i < MN; i++) {
      const m = mist[i];
      m.u += m.vx * dt / 1000 / w; if (m.u > 1.2) m.u = -0.2; else if (m.u < -0.2) m.u = 1.2;
      const rr = m.r * (1 + 0.15 * Math.sin(t * 0.3 + m.ph));
      c.globalAlpha = L * 0.085;
      c.drawImage(mistSprite, m.u * w - rr, level - 8 - m.o * 60 - (1 - L) * 26 - rr * 0.3, rr * 2, rr * 0.9);
    }
    c.globalAlpha = 1;
  }

  // Rain darkens the water a little, then the drops themselves.
  if (rain.r > 0.005) {
    c.fillStyle = `rgba(2,10,20,${(rain.r * 0.32).toFixed(3)})`;
    c.fillRect(0, level - 10, w, h - level + 10);
    c.strokeStyle = 'rgb(190,225,240)'; c.lineWidth = 1; c.globalAlpha = 0.16 + rain.r * 0.3;
    c.beginPath();
    for (let i = 0; i < RAIN; i++) {
      const d = rd[i]; if (!d.on) continue;
      d.y += d.vy * dt;
      if (d.y >= d.ly) {
        d.on = false;
        if (rnd() < 0.4) addRipple(d.x, d.ly, 0, 28, 1.0, 0.4, 1, true);
        continue;
      }
      c.moveTo(d.x, d.y); c.lineTo(d.x - d.len * 0.12, d.y - d.len);
    }
    c.stroke(); c.globalAlpha = 1;
  } else if (rain.on === false && !rain.armed) {
    for (let i = 0; i < RAIN; i++) rd[i].on = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

breath.onPhase((p) => {
  if (!revealed) return;
  if (p === 'exhale') {
    addRipple(w / 2, waterLine());
    mistS.target = 0;
  } else if (p === 'inhale' && !reduced && nextAt >= 0 && !mistS.on && !rain.on && !rain.armed) {
    const t = tVis;
    if (t - mistS.last > 30 * K && t > tRevealed + 18 * K && rnd() < 0.5) { mistS.on = true; mistS.target = 1; mistS.last = t; }
  }
});

// A tap on the hero makes a drop land there; a few droplets leap and fall back.
hero.addEventListener('pointerdown', (e) => {
  if (!revealed) return;
  const r = hero.getBoundingClientRect();
  const level = waterLine() + (0.5 - breath.value) * 22;
  const y = Math.min(Math.max(e.clientY - r.top, level), h - 4);
  addRipple(e.clientX - r.left, y);
  if (!reduced) splash(e.clientX - r.left, y);
  audio.plip(0.9 + Math.random() * 0.4);
});
