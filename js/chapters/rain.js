// Rain. Procedural rain over a dark-blue sky, landing in a puddle band.
// Five weathers. Storm brings gusts and lightning. The Gully Gusher throws rain every which way.
// The breath eases and hurries the rain.

const MAX = 760, MAX_RINGS = 90;
const MODES = {
  drizzle:  { n: 40,  speed: 0.34, len: 7,  wind: 0.05, width: 1.0, alpha: 0.42, gust: false },
  rain:     { n: 140, speed: 0.68, len: 14, wind: 0.14, width: 1.2, alpha: 0.5,  gust: false },
  downpour: { n: 300, speed: 0.98, len: 22, wind: 0.28, width: 1.4, alpha: 0.55, gust: false },
  storm:    { n: 520, speed: 1.75, len: 32, wind: 0.62, width: 1.6, alpha: 0.62, gust: true, ring: 0.2, flashMin: 2800, flashVar: 3600 },
  // chaos: the wind swings both ways and every drop is shoved about by its own eddy
  gusher:   { n: 760, speed: 2.25, len: 36, wind: 0.1,  width: 1.8, alpha: 0.66, gust: true, ring: 0.26, flashMin: 1400, flashVar: 2600, chaos: 1 },
};
const LABELS = { drizzle: 'Drizzle', rain: 'Rain', downpour: 'Downpour', storm: 'Storm', gusher: 'Gully Gusher' };

const X = new Float32Array(MAX), Y = new Float32Array(MAX), S = new Float32Array(MAX), L = new Float32Array(MAX);
const RX = new Float32Array(MAX_RINGS), RY = new Float32Array(MAX_RINGS), RT = new Float32Array(MAX_RINGS), RS = new Float32Array(MAX_RINGS);
const DD = new Float32Array(MAX);   // relative drop diameter
let ringHead = 0, ringCount = 0;

let c, w, h, reduced, audio;
let mode = MODES.rain;
let t = 0, wind = 0, dens = 140;   // dens: how many streaks are in the air; eases, so a weather change arrives as a front
let flash = 0, nextFlash = 6000;
let puddleY = 0;
let skyGrad = null, puddleGrad = null, horizonGrad = null;

function seed(i) {
  X[i] = Math.random() * w;
  Y[i] = -Math.random() * h;
  // Many small drops, few big ones. Terminal velocity grows roughly with the square root of diameter,
  // and the streak a camera sees is speed times exposure, so big drops are quicker AND longer.
  const r = Math.random();
  DD[i] = 0.45 + 1.15 * r * r;
  S[i] = Math.sqrt(DD[i]);
  L[i] = S[i] * (0.92 + Math.random() * 0.16);
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
  for (let i = 0; i < MAX; i++) { seed(i); if (i >= dens) Y[i] = -1e6; }
}

function ring(x, y, size = 1) {
  RX[ringHead] = x; RY[ringHead] = y; RT[ringHead] = 0; RS[ringHead] = size;
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
      <p class="chapter-kicker">Rain</p>
      <h2>Change the weather.</h2>
      <p class="lede">Some rain whispers. Some rain shouts. Pick one, then tap the puddle and listen.</p>
      <div class="controls"><div class="chip-row" role="group" aria-label="Weather">${
        Object.keys(MODES).map((k) => `<button class="chip" data-mode="${k}" aria-pressed="${k === 'rain'}">${LABELS[k]}</button>`).join('')
      }</div></div>
      <div class="depth" data-level="1">
        <p class="l1">Look: rain falls down. Big drops fall fast. Small drops drift.</p>
        <div class="l2"><span class="term">Discover</span><p>Air pushes back on anything that falls. A big drop is heavy for its size, so it wins against the air and falls faster. Drizzle is so light that a breeze can carry it sideways, which is why rain slants in the wind. And drops are not teardrop shaped. Small ones are perfect spheres. Big ones flatten on the bottom, like a bun, as the air shoves up against them.</p></div>
        <div class="l3"><span class="term">Terminal velocity</span><p>A falling drop speeds up until air drag equals its weight, then it stops accelerating. That top speed is its terminal velocity: about 9 m/s for a 5 mm drop, and only about 2 m/s for drizzle. Above roughly 5 mm the air pressure on the flattened base wins and the drop tears apart, so there is a natural ceiling on how big a raindrop can be.</p><p class="source">Source: <a href="https://www.usgs.gov/special-topics/water-science-school/science/precipitation-and-water-cycle" target="_blank" rel="noopener">USGS Water Science School: Precipitation</a></p></div>
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
    const chaos = mode.chaos || 0;
    if (chaos) gust = Math.sin(t * 0.0013) * 0.95 + Math.sin(t * 0.0037 + 1.3) * 0.45;   // whole sheets swing left, then right
    const windTarget = (mode.wind + gust) * (1 - 0.35 * b);
    wind += (windTarget - wind) * Math.min(1, dt * (chaos ? 0.004 : 0.002));
    const speedMul = (reduced ? 0.4 : 1) * (1.06 - 0.16 * b);
    // a narrow screen cannot hold a wide screen's worth of streaks: the heaviest weathers thin out there
    const want = mode.n <= 300 ? mode.n : 300 + (mode.n - 300) * Math.max(0.25, Math.min(1, (w - 375) / 600));
    dens += (want - dens) * Math.min(1, dt * 0.0008);
    const len = mode.len;

    // Rain: one path, one stroke. Streaks beyond the current density are parked until they are wanted,
    // and a parked one re-enters from the top of the sky, so heavier weather arrives as a front.
    c.strokeStyle = `rgba(190,225,240,${mode.alpha})`;
    c.lineWidth = mode.width;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < MAX; i++) {
      if (Y[i] < -5000) {
        if (i >= dens) continue;
        Y[i] = -len * L[i] - Math.random() * h * 0.45; X[i] = Math.random() * w - wind * h;
      }
      const sp = mode.speed * S[i] * speedMul;
      // in a gusher each drop also rides its own eddy, so neighbours cross each other
      const wi = chaos ? wind + chaos * 0.55 * Math.sin(t * 0.0045 + i * 1.7 + Y[i] * 0.007) : wind;
      Y[i] += sp * dt;
      X[i] += wi * sp * dt * (1.35 - 0.4 * S[i]);      // small drops have little inertia and follow the air
      const land = puddleY + (i % 7) * 3;
      if (Y[i] > land) {
        if (Math.random() < (mode.ring || 0.14)) ring(((X[i] % w) + w) % w, land + Math.random() * 6, 0.35 + 0.65 * DD[i] / 1.6);
        if (i >= dens) { Y[i] = -1e6; continue; }
        Y[i] = -len * L[i] - Math.random() * 60;
        X[i] = Math.random() * w - wind * h;
      }
      const x = ((X[i] % w) + w) % w;
      const l = len * L[i] * S[i];
      c.moveTo(x, Y[i]);
      c.lineTo(x - wi * l, Y[i] - l);
    }
    c.stroke();

    // A gusher hits so hard the puddle throws up a haze of spray.
    if (chaos && dens > 300) {
      c.fillStyle = `rgba(190,225,240,${0.10 * Math.min(1, (dens - 300) / 100)})`;
      c.fillRect(0, puddleY - 14, w, 40);
    }

    // Ripples on the puddle.
    for (let k = 0; k < ringCount; k++) {
      RT[k] += dt;
      const sz = RS[k] || 1, age = RT[k] / (800 + 600 * sz);
      if (age >= 1) continue;
      const e = 1 - (1 - age) * (1 - age);             // capillary ripples spread fast, then slow
      const R = 3 + (10 + 34 * sz) * e;
      const a = (1 - age) * (1 - age) * 0.6 * (0.45 + 0.55 * sz) / (1 + R * 0.025);   // energy spreads around a growing circle
      c.lineWidth = 1.3 - 0.6 * age;
      c.strokeStyle = `rgba(127,242,255,${a})`;
      c.beginPath(); c.ellipse(RX[k], RY[k], R, R * 0.28, 0, 0, Math.PI * 2); c.stroke();
      if (age > 0.12) {                                  // a trailing crest behind the leading one
        c.strokeStyle = `rgba(127,242,255,${a * 0.45})`;
        c.beginPath(); c.ellipse(RX[k], RY[k], R * 0.62, R * 0.62 * 0.28, 0, 0, Math.PI * 2); c.stroke();
      }
    }

    // Lightning: storm and gusher only, a short white breath over everything. The gusher flashes far more often.
    if (mode.gust && !reduced) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = mode.flashMin + Math.random() * mode.flashVar; }
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
