// Ocean. An infinite procedural sea under a low moon. Waves are summed sines;
// the whole sea pulls back on the inhale and rolls forward on the exhale.

const BANDS = 5;
const N = 121;                      // points per band
const MAX_RIPPLES = 6;

let el, c, W = 0, H = 0, t = 0;
let wind = 0.35;                    // 0 calm .. 1 gale
let horizon = 0, moonX = 0, moonY = 0;
const ys = [];                      // per band: Float32Array(N) of y values
const baseY = new Float32Array(BANDS);
const ripples = [];                 // { x, y, t } preallocated, t < 0 = free
let wetMax = 0, wetAge = 9;         // shore: farthest recent wash and how long ago
let offPhase = null;

const BAND_FILL = ['#16405f', '#113453', '#0d2a46', '#0a2139', '#07182b'];
const CREST = [0.22, 0.28, 0.34, 0.42, 0.5];

function layout() {
  horizon = H * 0.42;
  moonX = W * 0.7; moonY = horizon - H * 0.11;
  for (let k = 0; k < BANDS; k++) {
    const f = [0.02, 0.2, 0.42, 0.68, 1.0][k];
    baseY[k] = horizon + (H - horizon) * f;
  }
}

// Deep-water dispersion: omega = sqrt(g k), so long swells outrun short chop, and everything travels the same way
// (toward the shore on the left). Crests are trochoidal (Gerstner): narrow and peaked, troughs broad and flat,
// which is what makes foam appear only on the steep faces of the biggest crests.
const W0 = 0.0045, OM = 0.55;
const om = (k) => OM * Math.sqrt(k / W0);
function waveY(k, x, amp, phase) {
  // depth 0 (far) .. 1 (near): nearer bands are bigger and longer
  const d = k / (BANDS - 1);
  const s = 1 + d * 2.2;
  const k1 = 0.0045 / s, k2 = 0.014 / s, k3 = 0.021 / s;
  const th1 = x * k1 + t * om(k1) * 1.0 + phase;
  const th2 = x * k2 + t * om(k2) * 1.0 + phase * 2.1;
  const th3 = x * k3 + t * om(k3) - phase;
  const steep = 0.35 + wind * 0.45;                    // wind steepens the sea
  const big = Math.sin(th1 + steep * Math.cos(th1)) * 12 * s;
  const mid = Math.sin(th2 + steep * 0.8 * Math.cos(th2)) * 4.5 * s + Math.sin(th3) * 2.2 * s;
  const tiny = Math.sin(x * 0.09 + t * om(0.09) * 0.6 + phase * 3) * 0.6 * (0.4 + wind);
  return (big + mid) * amp + tiny;
}

export default {
  mount(section, ctx) {
    el = section; c = ctx.c2d; W = ctx.w; H = ctx.h;
    for (let k = 0; k < BANDS; k++) ys.push(new Float32Array(N));
    for (let i = 0; i < MAX_RIPPLES; i++) ripples.push({ x: 0, y: 0, t: -1 });
    layout();

    const style = document.createElement('style');
    style.textContent = `
      #ocean .chapter-canvas { touch-action: pan-y; cursor: pointer; }
      #ocean .chapter-body { max-width: 560px; }`;
    el.appendChild(style);

    el.insertAdjacentHTML('beforeend', `
      <div class="chapter-body left">
        <p class="chapter-kicker">Ocean</p>
        <h2>The wave moves. The water mostly stays.</h2>
        <p class="lede">Watch the sea breathe. Tap it to drop a stone.</p>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: waves go up and down. The water in a wave does not travel to the shore. The energy does.</p>
          <div class="l2"><span class="term">Discover</span><p>Wind pushes on the sea and piles it into waves. A cork on the water bobs in a small circle as a wave passes, and ends up almost where it started. The slow rise and fall of the tides comes from the moon's pull.</p></div>
          <div class="l3"><span class="term">Orbital motion</span><p>Water particles under a wave move in circles that shrink with depth. In deep water a wave's speed depends on its wavelength: longer waves travel faster. The ocean holds about 97% of Earth's water and has absorbed most of the extra heat from a warming climate.</p><p class="source">Source: <a href="https://oceanservice.noaa.gov/facts/oceanwater.html" target="_blank" rel="noopener">NOAA National Ocean Service</a></p></div>
          <button class="depth-more">Discover</button>
        </div>
      </div>`);


    ctx.canvas.addEventListener('pointerdown', (e) => {
      const r = ctx.canvas.getBoundingClientRect();
      const x = e.clientX - r.left; let y = e.clientY - r.top;
      if (y < horizon + 8) y = horizon + 8 + Math.random() * (H - horizon) * 0.2;
      let rp = ripples[0];
      for (let i = 0; i < MAX_RIPPLES; i++) if (ripples[i].t < 0) { rp = ripples[i]; break; }
      rp.x = x; rp.y = y; rp.t = 0;
      ctx.audio.plip(0.8 + Math.random() * 0.5);
    });
    offPhase = ctx.breath.onPhase((p) => {
      if (p !== 'exhale') return;
      wetAge = 0;
    });
  },

  resize(ctx) { W = ctx.w; H = ctx.h; layout(); },

  tick(dt, breath, ctx) {
    const dts = dt / 1000;
    if (!ctx.reduced) t += dts * (0.7 + wind * 0.6);
    const b = breath.value;
    // inhale: sea pulls back (up, smaller); exhale: rolls forward (down, bigger)
    const shift = (b - 0.5) * -7;
    const amp = (0.55 + wind * 1.1) * (0.78 + (1 - b) * 0.42);

    // Sky: night above, dusk near the horizon
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#04111f');
    sky.addColorStop(0.55, '#0b2340');
    sky.addColorStop(1, '#3b2f4a');
    c.fillStyle = sky; c.fillRect(0, 0, W, horizon + 2);
    c.fillStyle = '#0a2139'; c.fillRect(0, horizon, W, H - horizon);

    // Moon: soft, low, a little brighter on the inhale
    const mg = c.createRadialGradient(moonX, moonY, 4, moonX, moonY, 60);
    mg.addColorStop(0, `rgba(244,249,251,${0.9 + b * 0.1})`);
    mg.addColorStop(0.35, 'rgba(244,240,220,0.9)');
    mg.addColorStop(0.42, 'rgba(244,240,220,0.18)');
    mg.addColorStop(1, 'rgba(244,240,220,0)');
    c.fillStyle = mg; c.fillRect(moonX - 60, moonY - 60, 120, 120);

    // Bands, far to near
    const step = W / (N - 1);
    for (let k = 0; k < BANDS; k++) {
      const y = ys[k];
      const phase = k * 1.7;
      const by = baseY[k] + shift * (1 + k * 0.4);
      for (let i = 0; i < N; i++) y[i] = by + waveY(k, i * step, amp, phase);
      c.fillStyle = BAND_FILL[k];
      c.beginPath(); c.moveTo(0, y[0]);
      for (let i = 1; i < N; i++) c.lineTo(i * step, y[i]);
      c.lineTo(W, H + 2); c.lineTo(0, H + 2); c.closePath(); c.fill();
      // crest highlight
      c.strokeStyle = `rgba(127,242,255,${CREST[k] * (0.6 + b * 0.4)})`;
      c.lineWidth = 1 + k * 0.25;
      c.beginPath(); c.moveTo(0, y[0]);
      for (let i = 1; i < N; i++) c.lineTo(i * step, y[i]);
      c.stroke();
      // foam: short white dashes where the local slope is steep
      if (k > 0) {
        const thr = (5.2 - wind * 3.4) * (1 + k * 0.15);
        c.strokeStyle = `rgba(244,249,251,${0.35 + wind * 0.4})`;
        c.lineWidth = 1.5;
        c.beginPath();
        for (let i = 2; i < N - 2; i += 2) {
          const slope = y[i - 2] - y[i + 2];
          if (slope > thr) { c.moveTo(i * step - 3, y[i] - 1); c.lineTo(i * step + 4, y[i] - 2); }
        }
        c.stroke();
      }
    }

    // Moon reflection: a shimmering column of horizontal glints
    c.lineWidth = 1.2;
    const colW = 26 + b * 8;
    for (let yy = horizon + 6; yy < H; yy += 11) {
      const d = (yy - horizon) / (H - horizon);
      const wob = Math.sin(yy * 0.21 + t * 2.2) * (6 + wind * 18 * d);
      const a = (0.28 - d * 0.22) * (0.75 + Math.sin(t * 5 + yy * 0.7) * 0.25) * (1 - wind * 0.4);
      if (a <= 0.01) continue;
      const half = colW * (0.5 + d * 1.6) * (0.6 + Math.abs(Math.sin(yy * 0.37 + t)) * 0.6);
      c.strokeStyle = `rgba(244,240,220,${a})`;
      c.beginPath(); c.moveTo(moonX + wob - half, yy); c.lineTo(moonX + wob + half, yy); c.stroke();
    }

    // Shore: a sand wedge at bottom-left that the last band washes over
    const sx = Math.min(W * 0.34, 380), sy = H * 0.8;
    c.fillStyle = '#c9b48f';
    c.beginPath(); c.moveTo(0, sy); c.lineTo(sx, H); c.lineTo(0, H); c.closePath(); c.fill();
    const wash = 0.28 + (1 - b) * 0.62;          // how far the water runs up the sand (0..1)
    wetAge += dts;
    if (wash > wetMax) { wetMax = wash; }
    else wetMax = Math.max(wash, wetMax - dts * 0.03);
    const wetA = Math.max(0, 0.55 - wetAge * 0.08);
    // wet line: darker sand left behind
    c.fillStyle = `rgba(92,74,52,${wetA})`;
    c.beginPath(); c.moveTo(0, sy + (H - sy) * (1 - wetMax));
    c.lineTo(sx * wetMax, H); c.lineTo(0, H); c.closePath(); c.fill();
    // the water tongue itself, translucent, with a foam edge
    const wy = sy + (H - sy) * (1 - wash);
    c.fillStyle = 'rgba(11,51,82,0.72)';
    c.beginPath(); c.moveTo(0, wy);
    c.quadraticCurveTo(sx * wash * 0.55, wy + (H - wy) * 0.4 + Math.sin(t * 1.3) * 4, sx * wash, H);
    c.lineTo(0, H); c.closePath(); c.fill();
    c.strokeStyle = `rgba(244,249,251,${0.35 + wind * 0.3})`; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, wy);
    c.quadraticCurveTo(sx * wash * 0.55, wy + (H - wy) * 0.4 + Math.sin(t * 1.3) * 4, sx * wash, H);
    c.stroke();

    // Ripples from taps: expanding ellipses
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const rp = ripples[i];
      if (rp.t < 0) continue;
      rp.t += dts;
      const u = rp.t / 2.6;
      if (u >= 1) { rp.t = -1; continue; }
      const R = 6 + 120 * (1 - Math.exp(-rp.t * 1.1));                // leaves quickly, slows as it spreads
      const a = (1 - u) * (1 - u) * 1.1 / Math.sqrt(1 + R * 0.06);   // amplitude falls with the circle's growth
      c.strokeStyle = `rgba(127,242,255,${a})`; c.lineWidth = 1.5 - 0.6 * u;
      c.beginPath(); c.ellipse(rp.x, rp.y + shift, R, R * 0.3, 0, 0, Math.PI * 2); c.stroke();
      if (rp.t > 0.4) {
        c.strokeStyle = `rgba(127,242,255,${a * 0.45})`;
        c.beginPath(); c.ellipse(rp.x, rp.y + shift, R * 0.62, R * 0.62 * 0.3, 0, 0, Math.PI * 2); c.stroke();
      }
    }
  },

  unmount() { offPhase?.(); },
};
