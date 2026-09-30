// WHERE IS WATER? — a treasure hunt, then a living window into Earth.
// First press: the screen empties, one point at a time appears ("Here."), then they multiply until
// the visitor sees: It's everywhere. After that (and every later press this session): tiny procedural
// scenes, ~5 s each. All on one canvas, all breathing with the shared breath.
import audio from './audio.js';
import breath from './breath.js';

const TAU = Math.PI * 2;
const SEEN_KEY = 'water.hunt.seen';

// ---- text (lives here, not in content.js) ----
const HUNT = [
  ['Here.', 'inside a cloud'],
  ['And here.', 'beneath your feet'],
  ['And here.', 'inside a tree'],
  ['And here.', 'inside you'],
  ['And here.', "in the air you're breathing"],
  ['And here.', 'frozen at the top of a mountain'],
  ['And here.', 'in the ocean, one wave from shore'],
  ['And here.', 'in a blueberry'],
  ['And here.', 'under the Sahara, ten thousand years old'],
  ['And here.', 'in your next breath'],
];
// seconds after the hunt starts at which each story point appears; multiplying begins after the 7th
const HUNT_AT = [0.8, 3.3, 5.8, 8.3, 10.8, 13.3, 15.8, 18.0, 19.8, 21.2];
const MULTIPLY_FROM = 15.8;
const POOL = 600, STORY = HUNT.length;
const SCENE_TEXT = [
  'Right now, somewhere, water is falling.',
  'Right now, somewhere, water is freezing.',
  'Right now, somewhere, water is moving through soil.',
  'Right now, somewhere, a wave is breaking.',
  'Right now, somewhere, water is leaving a leaf.',
  'Right now, somewhere, water is inside you.',
  'Right now, somewhere, water is rising off the sea.',
  'Right now, somewhere, water is falling as snow.',
];
const SCENE_SECONDS = 5, XFADE = 1;

export function mountWhere({ reduced } = {}) {
  const btn = document.getElementById('where-btn');
  const root = document.getElementById('where-card');
  if (!btn || !root) return;
  reduced = reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- DOM ----
  root.innerHTML = '<canvas class="where-canvas" aria-hidden="true"></canvas>' +
    '<div class="where-tag" aria-live="polite"><b></b><i></i></div>' +
    '<div class="where-tag" aria-live="polite"><b></b><i></i></div>' +
    '<p class="where-big"></p><p class="where-title" aria-live="polite"></p>' +
    '<div class="where-ctl"><button class="ghost where-close">close</button><button class="btn where-next" hidden>next</button></div>';
  const cv = root.querySelector('canvas');
  const c = cv.getContext('2d');
  const tags = [...root.querySelectorAll('.where-tag')];
  const big = root.querySelector('.where-big');
  const title = root.querySelector('.where-title');
  const nextBtn = root.querySelector('.where-next');
  const closeBtn = root.querySelector('.where-close');

  let w = 1, h = 1, dpr = 1, ACC = '#7ff2ff';
  let open = false, raf = 0, last = 0, mode = 'hunt', G = 1, closeTimer = 0, titleTimer = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    if (open && mode === 'scenes') { cur.init(); if (prev) prev.init(); }
  }
  addEventListener('resize', () => { if (open) resize(); });

  // ================= THE HUNT =================
  const PX = new Float32Array(POOL), PY = new Float32Array(POOL), PB = new Float32Array(POOL);
  let count = 0, hT = 0, nextStory = 0, spawnAcc = 0, lastPlip = 0, tagIdx = 0;
  let phaseEnd = -1, nextShown = false;

  function huntReset() {
    count = STORY; hT = 0; nextStory = 0; spawnAcc = 0; tagIdx = 0; phaseEnd = -1; nextShown = false;
    tags.forEach((t) => t.classList.remove('on'));
    big.classList.remove('on');
    nextBtn.hidden = true; nextBtn.classList.remove('on');
  }
  function place(story) {
    let x, y, tries = 0;
    const px = nextStory ? PX[nextStory - 1] : 0.5, py = nextStory ? PY[nextStory - 1] : 0.5;
    const wide = w > 820;
    do {
      if (story) { x = (wide ? 0.12 : 0.2) + Math.random() * (wide ? 0.76 : 0.6); y = 0.14 + Math.random() * 0.62; }
      else { x = 0.02 + Math.random() * 0.96; y = 0.04 + Math.random() * 0.92; }
      tries++;
    } while (story && tries < 20 && Math.hypot((x - px) * w, (y - py) * h) < Math.min(w, h) * 0.3);
    return [x, y];
  }
  function addPoint(story) {
    if (count >= POOL) return;
    const [x, y] = place(story);
    const i = story ? nextStory : count++;
    PX[i] = x; PY[i] = y; PB[i] = hT;
    return [x, y];
  }
  function showTag(i, x, y) {
    const t = tags[tagIdx++ % 2];
    const other = tags[tagIdx % 2];
    other.classList.remove('on');
    t.classList.remove('on');
    t.querySelector('b').textContent = HUNT[i][0];
    t.querySelector('i').textContent = HUNT[i][1];
    const px = x * w, py = y * h;
    const right = px < w * 0.55;
    const room = right ? w - px : px;
    t.style.width = Math.max(120, Math.min(300, room - 30)) + 'px';
    t.classList.toggle('left', !right);
    t.style.left = right ? (px + 16) + 'px' : 'auto';
    t.style.right = right ? 'auto' : (w - px + 16) + 'px';
    t.style.top = (py - 20) + 'px';
    void t.offsetWidth;
    t.classList.add('on');
  }
  function plip(p) {
    const now = performance.now();
    if (now - lastPlip < 220) return;
    lastPlip = now; audio.plip(p);
  }

  function huntStep(dt) {
    hT += dt;
    while (nextStory < STORY && hT >= HUNT_AT[nextStory]) {
      const p = addPoint(true);
      if (p) showTag(nextStory, p[0], p[1]);
      plip(0.8 + Math.random() * 0.5);
      nextStory++;
    }
    if (hT > MULTIPLY_FROM && count < POOL && phaseEnd < 0) {
      // points begin to multiply on their own, faster and faster
      spawnAcc += 3 * Math.exp(0.6 * (hT - MULTIPLY_FROM)) * dt;
      while (spawnAcc >= 1 && count < POOL) {
        spawnAcc -= 1;
        addPoint(false);
        if (Math.random() < 0.02) plip(1.2 + Math.random() * 0.8);
      }
    }
    if (phaseEnd < 0 && nextStory >= STORY && count >= POOL - 20) {
      phaseEnd = hT;
      tags.forEach((t) => t.classList.remove('on'));
      big.textContent = "It's everywhere."; big.classList.add('on');
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    }
    if (phaseEnd >= 0 && !nextShown && hT - phaseEnd > 3) {
      nextShown = true; nextBtn.hidden = false; void nextBtn.offsetWidth; nextBtn.classList.add('on');
    }
  }

  function huntDraw() {
    const b = breath.value;
    c.fillStyle = ACC; c.strokeStyle = ACC;
    // the field: faint points breathing together
    const field = Math.min(1, (count - STORY) / 120);
    c.globalAlpha = (0.4 + 0.5 * b) * (0.6 + 0.4 * field);
    c.beginPath();
    for (let i = STORY; i < count; i++) {
      const age = Math.max(0, hT - PB[i]);
      const r = (1.2 + 0.7 * b) * Math.min(1, age / 0.5);
      const x = PX[i] * w, y = PY[i] * h;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
    }
    c.fill();
    // the story points: bright, with a halo
    c.globalAlpha = 0.16 + 0.1 * b;
    c.beginPath();
    for (let i = 0; i < nextStory; i++) {
      const x = PX[i] * w, y = PY[i] * h;
      c.moveTo(x + 9, y); c.arc(x, y, 9, 0, TAU);
    }
    c.fill();
    c.globalAlpha = 0.95; c.fillStyle = '#eafcff';
    c.beginPath();
    for (let i = 0; i < nextStory; i++) {
      const age = Math.max(0, hT - PB[i]);
      const r = 2.6 * Math.min(1, age / 0.35);
      const x = PX[i] * w, y = PY[i] * h;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
    }
    c.fill();
    // rings: one short breath of ripple as each point arrives
    if (!reduced) {
      c.lineWidth = 1;
      for (let i = 0; i < count; i++) {
        if (i >= nextStory && i < STORY) continue;
        if (i >= STORY && i < count - 90) continue;
        const age = Math.max(0, hT - PB[i]);
        const life = i < STORY ? 2.2 : 1.4;
        if (age < 0 || age > life) continue;
        const k = age / life;
        c.globalAlpha = (1 - k) * (1 - k) * (i < STORY ? 0.7 : 0.4);
        c.beginPath(); c.arc(PX[i] * w, PY[i] * h, 3 + k * (i < STORY ? 34 : 18), 0, TAU); c.stroke();
      }
    }
  }

  // ================= THE LIVING WINDOW =================
  const A = (a) => { c.globalAlpha = Math.max(0, Math.min(1, a * G)); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const scenes = [];
  let sdt = 0;

  // 1 falling — rain streaks and rings
  scenes.push((() => {
    const N = 46, X = new Float32Array(N), Y = new Float32Array(N), S = new Float32Array(N), D = new Float32Array(N);
    const R = 16, RX = new Float32Array(R), RY = new Float32Array(R), RT = new Float32Array(R).fill(9);
    let head = 0, t = 0, gy = 0;
    const seed = (i, top) => { X[i] = rnd(0, w); Y[i] = top ? rnd(-h * 0.5, gy) : rnd(-60, 0); S[i] = rnd(0.7, 1.15); D[i] = rnd(0, 0.16) * h; };
    return {
      init() { t = 0; gy = h * 0.72; RT.fill(9); for (let i = 0; i < N; i++) seed(i, true); },
      draw(dt) {
        t += dt;
        const sp = h * (0.85 + 0.25 * breath.value);
        c.strokeStyle = ACC; c.lineWidth = 1.2; A(0.5); c.beginPath();
        for (let i = 0; i < N; i++) {
          Y[i] += sp * S[i] * dt;
          if (Y[i] > gy + D[i]) {
            if (!reduced) { RX[head] = X[i]; RY[head] = gy + D[i]; RT[head] = 0; head = (head + 1) % R; }
            seed(i, false);
          }
          c.moveTo(X[i], Y[i]); c.lineTo(X[i] - 3, Y[i] - 16 * S[i]);
        }
        c.stroke();
        for (let i = 0; i < R; i++) {
          if (RT[i] > 1) continue; RT[i] += dt / 1.4;
          A((1 - RT[i]) * 0.55); c.beginPath(); c.ellipse(RX[i], RY[i], 3 + RT[i] * 30, (3 + RT[i] * 30) * 0.28, 0, 0, TAU); c.stroke();
        }
        A(0.06); c.fillStyle = ACC; c.fillRect(0, gy, w, h - gy);
        A(0.25); c.beginPath(); c.moveTo(0, gy); c.lineTo(w, gy); c.stroke();
      },
    };
  })());

  // 2 freezing — a hex crystal grows from a point
  scenes.push((() => {
    let t = 0;
    return {
      init() { t = 0; },
      draw(dt) {
        t += dt;
        const cx = w / 2, cy = h * 0.5, m = Math.min(w, h);
        const k = Math.min(1, t / 4.2), L = m * 0.26 * (1 - Math.pow(1 - k, 3)), rot = t * 0.03, b = breath.value;
        c.strokeStyle = ACC; c.lineWidth = 1.4; A(0.85); c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + rot, dx = Math.cos(a), dy = Math.sin(a);
          c.moveTo(cx, cy); c.lineTo(cx + dx * L, cy + dy * L);
          for (const f of [0.34, 0.6, 0.82]) {
            const bx = cx + dx * L * f, by = cy + dy * L * f, bl = L * 0.3 * (1 - f * 0.5);
            for (const s of [-1, 1]) { const a2 = a + s * Math.PI / 3; c.moveTo(bx, by); c.lineTo(bx + Math.cos(a2) * bl, by + Math.sin(a2) * bl); }
          }
        }
        c.stroke();
        // lattice dots
        const d = m * 0.05; c.fillStyle = '#eafcff'; A(0.2 + 0.35 * b); c.beginPath();
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          if (Math.abs(i + j) > 3) continue;
          const x = d * (i + j / 2), y = d * j * 0.866, xr = x * Math.cos(rot) - y * Math.sin(rot), yr = x * Math.sin(rot) + y * Math.cos(rot);
          if (Math.hypot(xr, yr) > L * 1.05) continue;
          c.moveTo(cx + xr + 1.8, cy + yr); c.arc(cx + xr, cy + yr, 1.8, 0, TAU);
        }
        c.fill();
        A(0.9); c.beginPath(); c.arc(cx, cy, 2.5, 0, TAU); c.fill();
        A(0.4 - 0.2 * b); c.strokeStyle = ACC; c.beginPath(); c.arc(cx, cy, 8 + 10 * b, 0, TAU); c.stroke();
      },
    };
  })());

  // 3 soil — a cutaway band, water seeping down
  scenes.push((() => {
    const N = 48, X = new Float32Array(N), Y = new Float32Array(N), V = new Float32Array(N), Ph = new Float32Array(N);
    const GN = 70, GX = new Float32Array(GN), GY = new Float32Array(GN);
    let t = 0, x0, x1, y0, y1;
    return {
      init() {
        t = 0; x0 = w * 0.1; x1 = w * 0.9; y0 = h * 0.3; y1 = h * 0.78;
        for (let i = 0; i < N; i++) { X[i] = rnd(x0 + 8, x1 - 8); Y[i] = rnd(y0, y1); V[i] = rnd(12, 26); Ph[i] = rnd(0, TAU); }
        for (let i = 0; i < GN; i++) { GX[i] = rnd(x0, x1); GY[i] = rnd(y0, y1); }
      },
      draw(dt) {
        t += dt;
        c.fillStyle = '#fff'; A(0.035); c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.strokeStyle = '#fff'; c.lineWidth = 1; A(0.12); c.strokeRect(x0, y0, x1 - x0, y1 - y0);
        A(0.07); c.beginPath();
        for (let i = 1; i < 5; i++) {
          const y = y0 + (y1 - y0) * i / 5; c.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 24) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
        }
        c.stroke();
        A(0.16); c.beginPath();
        for (let i = 0; i < GN; i++) { c.moveTo(GX[i] + 1.4, GY[i]); c.arc(GX[i], GY[i], 1.4, 0, TAU); }
        c.fill();
        c.fillStyle = ACC; A(0.8); c.beginPath();
        const sp = 0.7 + 0.6 * breath.value;
        for (let i = 0; i < N; i++) {
          Y[i] += V[i] * sp * dt; if (Y[i] > y1) { Y[i] = y0; X[i] = rnd(x0 + 8, x1 - 8); }
          const x = X[i] + Math.sin(t * 0.8 + Ph[i]) * 5;
          c.moveTo(x + 2, Y[i]); c.arc(x, Y[i], 2, 0, TAU);
        }
        c.fill();
        c.strokeStyle = ACC; A(0.35); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke();
      },
    };
  })());

  // 4 a wave is breaking — one crest rolling and foaming
  scenes.push((() => {
    const N = 40, FX = new Float32Array(N), FY = new Float32Array(N), FVX = new Float32Array(N), FVY = new Float32Array(N), FL = new Float32Array(N).fill(0);
    let t = 0, head = 0, acc = 0;
    return {
      init() { t = 0; FL.fill(0); },
      draw(dt) {
        t += dt;
        const base = h * 0.64, k = Math.min(1, t / 2.8), out = t > 4.2 ? (t - 4.2) / 0.8 * 0.4 : 0;
        const Amp = h * 0.17 * k * (1 - out), xc = -w * 0.12 + (t / 5) * w * 1.3;
        const pts = [];
        c.beginPath();
        for (let x = 0; x <= w + 8; x += 8) {
          const dx = x - xc, wd = dx < 0 ? w * 0.16 : w * 0.05;
          const y = base + Math.sin(x * 0.012 + t * 1.2) * 5 * (0.7 + 0.3 * breath.value) - Amp * Math.exp(-(dx / wd) * (dx / wd));
          x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.strokeStyle = ACC; c.lineWidth = 1.6; A(0.9); c.stroke();
        c.lineTo(w + 8, h); c.lineTo(0, h); c.closePath(); c.fillStyle = ACC; A(0.08); c.fill();
        // a quieter swell behind it
        c.beginPath();
        for (let x = 0; x <= w + 8; x += 12) { const y = base + 34 + Math.sin(x * 0.008 - t * 0.9) * 8; x === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.lineWidth = 1; A(0.25); c.stroke();
        // foam thrown from the crest
        if (Amp > h * 0.07) {
          acc += dt * 34;
          while (acc >= 1) { acc--; const i = head; head = (head + 1) % N; FX[i] = xc + rnd(-8, 20); FY[i] = base - Amp + rnd(0, 8); FVX[i] = rnd(20, 90); FVY[i] = rnd(-110, -30); FL[i] = 1; }
        }
        c.fillStyle = '#eafcff'; A(0.8); c.beginPath();
        for (let i = 0; i < N; i++) {
          if (FL[i] <= 0) continue; FL[i] -= dt * 0.9; FVY[i] += 220 * dt; FX[i] += FVX[i] * dt; FY[i] += FVY[i] * dt;
          if (FY[i] > base + 10) FL[i] = 0;
          c.moveTo(FX[i] + 1.6, FY[i]); c.arc(FX[i], FY[i], 1.6, 0, TAU);
        }
        c.fill();
      },
    };
  })());

  // 5 leaving a leaf — silhouette with vapor from its edge
  scenes.push((() => {
    const N = 34, VX = new Float32Array(N), VY = new Float32Array(N), VL = new Float32Array(N), VS = new Float32Array(N), VP = new Float32Array(N);
    let t = 0, cx, cy, len, rot;
    const hw = (u) => len * 0.26 * Math.sin(Math.PI * Math.pow(u, 0.85)) * (1 - 0.25 * u);
    const world = (lx, ly) => [cx + lx * Math.cos(rot) - ly * Math.sin(rot), cy + lx * Math.sin(rot) + ly * Math.cos(rot)];
    const spawn = (i) => { const u = rnd(0.05, 0.95), s = Math.random() < 0.5 ? -1 : 1, p = world(s * hw(u), len / 2 - u * len); VX[i] = p[0]; VY[i] = p[1]; VL[i] = 0; VS[i] = rnd(0.18, 0.34); VP[i] = rnd(0, TAU); };
    return {
      init() { t = 0; cx = w / 2; cy = h * 0.56; len = Math.min(w * 0.9, h * 0.5); rot = 0.4; for (let i = 0; i < N; i++) { spawn(i); VL[i] = Math.random(); } },
      draw(dt) {
        t += dt;
        c.save(); c.translate(cx, cy); c.rotate(rot);
        c.beginPath(); c.moveTo(0, len / 2);
        for (let i = 0; i <= 20; i++) { const u = i / 20; c.lineTo(hw(u), len / 2 - u * len); }
        for (let i = 20; i >= 0; i--) { const u = i / 20; c.lineTo(-hw(u), len / 2 - u * len); }
        c.closePath(); c.fillStyle = ACC; A(0.07); c.fill();
        c.strokeStyle = ACC; c.lineWidth = 1.4; A(0.6); c.stroke();
        c.beginPath(); c.moveTo(0, len / 2 + len * 0.12); c.lineTo(0, -len / 2 + len * 0.05);
        for (let i = 1; i < 6; i++) { const u = i / 6.5, y = len / 2 - u * len; c.moveTo(0, y); c.lineTo(hw(u + 0.08) * 0.8, y - len * 0.08); c.moveTo(0, y); c.lineTo(-hw(u + 0.08) * 0.8, y - len * 0.08); }
        c.lineWidth = 1; A(0.25); c.stroke();
        c.restore();
        const up = 0.4 + 0.9 * breath.value; c.fillStyle = '#eafcff'; c.beginPath();
        for (let i = 0; i < N; i++) {
          VL[i] += VS[i] * dt * (0.5 + up * 0.7); if (VL[i] >= 1) spawn(i);
          VY[i] -= 26 * up * dt; const x = VX[i] + Math.sin(t * 1.1 + VP[i]) * 6 * VL[i];
          c.moveTo(x + 1.8, VY[i]); c.arc(x, VY[i], 1.8, 0, TAU);
        }
        A(0.6); c.fill();
      },
    };
  })());

  // 6 inside you — a faint figure with a breathing level line
  scenes.push((() => {
    const N = 26, DX = new Float32Array(N), DY = new Float32Array(N), DV = new Float32Array(N);
    let t = 0, fig, cx, top, H, bottom;
    const rr = (p, x, y, ww, hh, r) => (p.roundRect ? p.roundRect(x, y, ww, hh, r) : p.rect(x, y, ww, hh));
    return {
      init() {
        t = 0; cx = w / 2; H = Math.min(h * 0.54, w * 0.95); bottom = h * 0.8; top = bottom - H;
        const r = H * 0.075; fig = new Path2D();
        fig.moveTo(cx + r, top + r); fig.arc(cx, top + r, r, 0, TAU);
        rr(fig, cx - H * 0.11, top + 2.5 * r, H * 0.22, H * 0.36, H * 0.06);
        rr(fig, cx - H * 0.175, top + 2.6 * r, H * 0.055, H * 0.33, H * 0.03);
        rr(fig, cx + H * 0.12, top + 2.6 * r, H * 0.055, H * 0.33, H * 0.03);
        rr(fig, cx - H * 0.105, top + H * 0.5, H * 0.095, H * 0.5, H * 0.04);
        rr(fig, cx + H * 0.01, top + H * 0.5, H * 0.095, H * 0.5, H * 0.04);
        for (let i = 0; i < N; i++) { DX[i] = cx + rnd(-H * 0.18, H * 0.18); DY[i] = rnd(top, bottom); DV[i] = rnd(6, 16); }
      },
      draw(dt) {
        t += dt;
        const b = breath.value, level = bottom - H * (0.6 + 0.07 * b);
        c.save(); c.clip(fig);
        c.fillStyle = ACC; A(0.2); c.fillRect(cx - H, level, H * 2, bottom - level + 4);
        c.beginPath(); c.moveTo(cx - H * 0.3, level);
        for (let x = -H * 0.3; x <= H * 0.3; x += 6) c.lineTo(cx + x, level + Math.sin(x * 0.05 + t * 1.5) * 2.5);
        c.strokeStyle = ACC; c.lineWidth = 1.6; A(0.85); c.stroke();
        c.fillStyle = '#eafcff'; A(0.55); c.beginPath();
        for (let i = 0; i < N; i++) { DY[i] -= DV[i] * dt; if (DY[i] < level) DY[i] = bottom; c.moveTo(DX[i] + 1.5, DY[i]); c.arc(DX[i], DY[i], 1.5, 0, TAU); }
        c.fill();
        c.restore();
        c.strokeStyle = ACC; c.lineWidth = 1.2; A(0.5); c.stroke(fig);
      },
    };
  })());

  // 7 rising off the sea — mist lifting on the inhale
  scenes.push((() => {
    const N = 34, X = new Float32Array(N), Y = new Float32Array(N), R = new Float32Array(N), L = new Float32Array(N), S = new Float32Array(N);
    let t = 0, hy;
    const spawn = (i, warm) => { X[i] = rnd(0, w); Y[i] = hy - (warm ? rnd(0, h * 0.35) : rnd(-4, 10)); R[i] = rnd(16, 44); L[i] = warm ? rnd(0, 1) : 0; S[i] = rnd(0.12, 0.25); };
    return {
      init() { t = 0; hy = h * 0.6; for (let i = 0; i < N; i++) spawn(i, true); },
      draw(dt) {
        t += dt;
        c.fillStyle = ACC; A(0.07); c.fillRect(0, hy, w, h - hy);
        c.strokeStyle = ACC; c.lineWidth = 1; A(0.3); c.beginPath();
        for (let j = 0; j < 4; j++) { const y = hy + 14 + j * 22 + j * j * 4; c.moveTo(0, y); for (let x = 0; x <= w; x += 20) c.lineTo(x, y + Math.sin(x * 0.02 + t * 0.8 + j) * 2.5); }
        c.stroke();
        A(0.6); c.beginPath(); c.moveTo(0, hy); c.lineTo(w, hy); c.stroke();
        const lift = 8 + 70 * Math.max(0, breath.velocity * 1000) + 10 * breath.value;
        c.fillStyle = '#cfefff';
        for (let i = 0; i < N; i++) {
          Y[i] -= lift * dt; L[i] += S[i] * dt * (0.6 + breath.value); if (L[i] >= 1) spawn(i, false);
          A(Math.sin(Math.PI * L[i]) * 0.07); c.beginPath(); c.arc(X[i], Y[i], R[i], 0, TAU); c.fill();
        }
        c.fillStyle = '#eafcff'; A(0.55); c.beginPath();
        for (let i = 0; i < N; i += 2) { const x = X[i] + Math.sin(t + i) * 4; c.moveTo(x + 1.5, Y[i]); c.arc(x, Y[i] - 10, 1.5, 0, TAU); }
        c.fill();
      },
    };
  })());

  // 8 falling as snow
  scenes.push((() => {
    const N = 64, X = new Float32Array(N), Y = new Float32Array(N), V = new Float32Array(N), Ph = new Float32Array(N), Sz = new Float32Array(N);
    let t = 0;
    return {
      init() { t = 0; for (let i = 0; i < N; i++) { X[i] = rnd(0, w); Y[i] = rnd(-20, h); V[i] = rnd(28, 62); Ph[i] = rnd(0, TAU); Sz[i] = i < 12 ? rnd(3, 5) : rnd(1, 2.2); } },
      draw(dt) {
        t += dt;
        const sp = 0.8 + 0.4 * (1 - breath.value);
        c.fillStyle = '#eafcff'; c.strokeStyle = '#eafcff'; c.lineWidth = 1;
        A(0.85); c.beginPath();
        for (let i = 12; i < N; i++) { step(i, sp, dt); const x = X[i] + Math.sin(t * 0.7 + Ph[i]) * 14; c.moveTo(x + Sz[i], Y[i]); c.arc(x, Y[i], Sz[i], 0, TAU); }
        c.fill();
        A(0.7); c.beginPath();
        for (let i = 0; i < 12; i++) {
          step(i, sp, dt); const x = X[i] + Math.sin(t * 0.7 + Ph[i]) * 14, r = Sz[i] * 1.6, a0 = t * 0.2 + Ph[i];
          for (let k = 0; k < 3; k++) { const a = a0 + k * Math.PI / 3; c.moveTo(x - Math.cos(a) * r, Y[i] - Math.sin(a) * r); c.lineTo(x + Math.cos(a) * r, Y[i] + Math.sin(a) * r); }
        }
        c.stroke();
        const g = h * 0.9 - Math.min(1, t / 5) * h * 0.035;
        c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w; x += 16) c.lineTo(x, g + Math.sin(x * 0.006 + 1) * 10 + Math.sin(x * 0.02) * 2);
        c.lineTo(w, h); c.closePath(); A(0.12); c.fill();
      },
    };
    function step(i, sp, dt) { Y[i] += V[i] * sp * dt; if (Y[i] > h + 8) { Y[i] = -8; X[i] = rnd(0, w); } }
  })());

  // ---- scene director ----
  let cur, prev, curIdx = 0, curT = 0, prevT = 0;
  function startScene(i, first) {
    if (!first) { prev = cur; prevT = 0; }
    curIdx = i % scenes.length; cur = scenes[curIdx]; cur.init(); curT = 0;
    clearTimeout(titleTimer);
    title.classList.remove('on');
    titleTimer = setTimeout(() => { title.textContent = SCENE_TEXT[curIdx]; title.classList.add('on'); }, first ? 200 : 550);
    if (!first || true) audio.plip(0.9 + (curIdx % 4) * 0.12);
  }
  function scenesStep(dt) {
    sdt = reduced ? dt * 0.08 : dt;
    curT += dt; if (prev) { prevT += dt; if (prevT > XFADE) prev = null; }
    if (curT >= SCENE_SECONDS) startScene(curIdx + 1);
  }
  function scenesDraw() {
    if (prev) { G = Math.max(0, 1 - prevT / XFADE); prev.draw(sdt); }
    G = Math.min(1, curT / XFADE); cur.draw(sdt);
    G = 1;
  }

  // ---- lifecycle ----
  function toScenes() {
    mode = 'scenes';
    tags.forEach((t) => t.classList.remove('on')); big.classList.remove('on');
    nextBtn.hidden = false; void nextBtn.offsetWidth; nextBtn.classList.add('on');
    prev = null; cur = scenes[0]; cur.init(); curT = 0; curIdx = 0;
    startScene(0, true);
  }
  function frame(now) {
    if (!open) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    if (mode === 'hunt') { huntStep(dt); huntDraw(); } else { scenesStep(dt); scenesDraw(); }
    raf = requestAnimationFrame(frame);
  }
  function openIt() {
    if (open) return;
    clearTimeout(closeTimer);
    open = true;
    try { ACC = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7ff2ff'; } catch (e) {}
    let seen = false; try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}
    root.hidden = false; document.body.classList.add('where-open');
    lockY = scrollY; addEventListener('scroll', holdScroll, { passive: true });
    resize();
    title.classList.remove('on'); big.classList.remove('on');
    if (seen) toScenes(); else { mode = 'hunt'; huntReset(); }
    void root.offsetWidth; root.classList.add('on');
    root.style.pointerEvents = 'none';
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
  let lockY = 0;
  function holdScroll() { if (Math.abs(scrollY - lockY) > 2) scrollTo(0, lockY); }
  function closeIt() {
    if (!open) return;
    open = false; cancelAnimationFrame(raf); clearTimeout(titleTimer);
    root.classList.remove('on'); document.body.classList.remove('where-open');
    removeEventListener('scroll', holdScroll);
    closeTimer = setTimeout(() => { root.hidden = true; }, 1000);
    btn.focus({ preventScroll: true });
  }
  btn.addEventListener('click', () => (open ? null : openIt()));
  nextBtn.addEventListener('click', () => { if (mode === 'hunt') toScenes(); else startScene(curIdx + 1); });
  closeBtn.addEventListener('click', closeIt);
  addEventListener('keydown', (e) => { if (open && e.key === 'Escape') closeIt(); });
}
