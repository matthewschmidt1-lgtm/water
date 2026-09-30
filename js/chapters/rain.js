// 02 — Rain. Procedural rain over a dark-blue sky, landing in a puddle band.
// Four weathers. Storm brings gusts and lightning. The breath eases and hurries the rain.

const MAX = 400, MAX_RINGS = 40;
const MODES = {
  drizzle:  { n: 40,  speed: 0.34, len: 7,  wind: 0.05, width: 1.0, alpha: 0.42, gust: false },
  rain:     { n: 140, speed: 0.68, len: 14, wind: 0.14, width: 1.2, alpha: 0.5,  gust: false },
  downpour: { n: 300, speed: 0.98, len: 22, wind: 0.28, width: 1.4, alpha: 0.55, gust: false },
  storm:    { n: 400, speed: 1.22, len: 28, wind: 0.5,  width: 1.5, alpha: 0.6,  gust: true },
};
const LABELS = { drizzle: 'Drizzle', rain: 'Rain', downpour: 'Downpour', storm: 'Storm' };

const X = new Float32Array(MAX), Y = new Float32Array(MAX), S = new Float32Array(MAX), L = new Float32Array(MAX);
const RX = new Float32Array(MAX_RINGS), RY = new Float32Array(MAX_RINGS), RT = new Float32Array(MAX_RINGS);
let ringHead = 0, ringCount = 0;

let c, w, h, reduced, audio;
let mode = MODES.rain;
let t = 0, wind = 0;
let flash = 0, nextFlash = 6000;
let puddleY = 0;
let skyGrad = null, puddleGrad = null, horizonGrad = null;

function seed(i) {
  X[i] = Math.random() * w;
  Y[i] = -Math.random() * h;
  S[i] = 0.8 + Math.random() * 0.45;
  L[i] = 0.8 + Math.random() * 0.5;
}

function layout(ctx) {
  w = ctx.w; h = ctx.h;
  puddleY = h * 0.86;
  skyGrad = c.createLinearGradient(0, 0, 0, puddleY);
  skyGrad.addColorStop(0, '#050f1f');
  skyGrad.addColorStop(0.6, '#0a2540');
  skyGrad.addColorStop(1, '#123a5c');
  horizonGrad = c.createLinearGradient(0, puddleY - 60, 0, puddleY);
  horizonGrad.addColorStop(0, 'rgba(127,242,255,0)');
  horizonGrad.addColorStop(1, 'rgba(127,242,255,0.10)');
  puddleGrad = c.createLinearGradient(0, puddleY, 0, h);
  puddleGrad.addColorStop(0, '#16456a');
  puddleGrad.addColorStop(0.12, '#0b3352');
  puddleGrad.addColorStop(1, '#04111f');
  for (let i = 0; i < MAX; i++) seed(i);
}

function ring(x, y) {
  RX[ringHead] = x; RY[ringHead] = y; RT[ringHead] = 0;
  ringHead = (ringHead + 1) % MAX_RINGS;
  if (ringCount < MAX_RINGS) ringCount++;
}

function setMode(name, chips) {
  mode = MODES[name];
  chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === name)));
  nextFlash = 2500 + Math.random() * 3000;
}

export default {
  mount(el, ctx) {
    c = ctx.c2d; reduced = ctx.reduced; audio = ctx.audio;
    const style = document.createElement('style');
    style.textContent = `#rain .chapter-canvas { touch-action: manipulation; cursor: pointer; }`;
    el.appendChild(style);
    const body = document.createElement('div');
    body.className = 'chapter-body left';
    body.innerHTML = `
      <p class="chapter-kicker">02 — Rain</p>
      <h2>Change the weather.</h2>
      <p class="lede">Some rain whispers. Some rain shouts. Pick one, then tap the puddle and listen.</p>
      <div class="controls"><div class="chip-row" role="group" aria-label="Weather">${
        Object.keys(MODES).map((k) => `<button class="chip" data-mode="${k}" aria-pressed="${k === 'rain'}">${LABELS[k]}</button>`).join('')
      }</div></div>
      <div class="depth" data-level="1">
        <p class="l1">Look: rain falls down. Big drops fall fast. Small drops drift.</p>
        <div class="l2"><span class="term">Discover</span><p>Air pushes back on anything that falls. A big drop is heavy for its size, so it wins against the air and falls faster. Drizzle is so light that a breeze can carry it sideways, which is why rain slants in the wind. And drops are not teardrop shaped. Small ones are perfect spheres. Big ones flatten on the bottom, like a bun, as the air shoves up against them.</p></div>
        <div class="l3"><span class="term">Terminal velocity</span><p>A falling drop speeds up until air drag equals its weight, then it stops accelerating. That top speed is its terminal velocity: about 9 m/s for a 5 mm drop, and only about 2 m/s for drizzle. Above roughly 5 mm the air pressure on the flattened base wins and the drop tears apart, so there is a natural ceiling on how big a raindrop can be.</p></div>
        <button class="depth-more">Discover</button>
      </div>`;
    el.appendChild(body);
    const chips = [...body.querySelectorAll('.chip')];
    chips.forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode, chips); audio.plip(1.1); }));
    layout(ctx);

    ctx.canvas.addEventListener('pointerdown', (e) => {
      const r = ctx.canvas.getBoundingClientRect();
      ring(e.clientX - r.left, puddleY + Math.random() * 12);
      audio.plip(0.6 + Math.random() * 0.9);
    });
  },

  tick(dt, breath, ctx) {
    t += dt;
    const b = breath.value;
    // Sky, horizon, puddle: one pass each.
    c.fillStyle = skyGrad; c.fillRect(0, 0, w, puddleY);
    c.fillStyle = horizonGrad; c.fillRect(0, puddleY - 60, w, 60);
    c.fillStyle = puddleGrad; c.fillRect(0, puddleY, w, h - puddleY);
    c.strokeStyle = `rgba(127,242,255,${0.12 + b * 0.08})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, puddleY + 0.5); c.lineTo(w, puddleY + 0.5); c.stroke();

    // Wind: base + slow sway, plus gusts in a storm. Inhale eases it.
    let gust = Math.sin(t * 0.0005) * 0.04;
    if (mode.gust) gust += Math.max(0, Math.sin(t * 0.0007) * 0.3 + Math.sin(t * 0.0023) * 0.12);
    const windTarget = (mode.wind + gust) * (1 - 0.35 * b);
    wind += (windTarget - wind) * Math.min(1, dt * 0.002);
    const speedMul = (reduced ? 0.4 : 1) * (1.06 - 0.16 * b);
    const n = mode.n;
    const len = mode.len;

    // Rain: one path, one stroke.
    c.strokeStyle = `rgba(190,225,240,${mode.alpha})`;
    c.lineWidth = mode.width;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = mode.speed * S[i] * speedMul;
      Y[i] += sp * dt;
      X[i] += wind * sp * dt;
      const land = puddleY + (i % 7) * 3;
      if (Y[i] > land) {
        if (Math.random() < 0.12) ring(((X[i] % w) + w) % w, land + Math.random() * 6);
        Y[i] = -len * L[i] - Math.random() * 60;
        X[i] = Math.random() * w - wind * h;
      }
      const x = ((X[i] % w) + w) % w;
      const l = len * L[i] * S[i];
      c.moveTo(x, Y[i]);
      c.lineTo(x - wind * l, Y[i] - l);
    }
    c.stroke();

    // Ripples on the puddle.
    c.lineWidth = 1;
    for (let k = 0; k < ringCount; k++) {
      RT[k] += dt;
      const age = RT[k] / 1100;
      if (age >= 1) continue;
      const R = 4 + age * 34;
      c.strokeStyle = `rgba(127,242,255,${(1 - age) * 0.55})`;
      c.beginPath(); c.ellipse(RX[k], RY[k], R, R * 0.28, 0, 0, Math.PI * 2); c.stroke();
    }

    // Lightning: storm only, every 4–9 s, a short white breath over everything.
    if (mode.gust && !reduced) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = 4000 + Math.random() * 5000; }
    }
    if (flash > 0.01) {
      c.fillStyle = `rgba(236,246,255,${flash * 0.22})`;
      c.fillRect(0, 0, w, h);
      flash *= Math.exp(-dt / 110);
      if (flash > 0.35 && flash < 0.4 && Math.random() < 0.5) flash = 0.7; // a second flicker
    }
  },

  resize(ctx) { layout(ctx); ringCount = 0; ringHead = 0; },
};
