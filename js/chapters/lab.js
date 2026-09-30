// Lab. One blob of water and a temperature dial. Ice, liquid, vapor, and the
// strange place above 374 °C where liquid and gas stop being different things.

const R = 60;                        // resting liquid radius (px)
const N_VAPOR = 80;
const N_LIQ = 14;
const N_SALT = 30;
const N_BUB = 9;
const N_SOIL = 80;
const PI = Math.PI;

let el, c, W = 0, H = 0, t = 0;
let temp = 20, pres = 57, salt = 0;        // dial, pressure 0..100 (log), salt 0..100
let tb = 100, tf = 0;                      // boiling / freezing thresholds (°C), moved by pressure and salt
let surfKind = 0, surfOn = false;          // 1 glass 2 leaf 3 wax 4 soil
let iceAmt = 0, vapAmt = 0, critAmt = 0, surfAmt = 0, saltShow = 0;   // eased 0..1 blends
let theta = PI;                            // contact angle (rad), eased
let cx = 0, cy = 0, mx = 0, my = 0, ys = 0;   // blob centre, molecule-diagram centre, surface line
let bx = 0, bcy = 0;                       // where ice / vapor centre sits
let saltOn = false;
let vx = 0, roll = 0, dragging = false, grabOff = 0, lastMoveT = 0;
let soilT = 4.8;
let gBg, gBlob, gIce, gGlow;               // unit gradients, made once, placed with translate/scale
const shown = {};                          // discovery lines already spoken this session
const find = { text: '', t: 99 };
const vapor = new Float32Array(N_VAPOR * 5);   // x, y, vx, vy, life
const liq = new Float32Array(N_LIQ * 2);       // resting positions inside blob
const saltPts = new Float32Array(N_SALT * 2);
const bub = new Float32Array(N_BUB * 3);       // x, life, speed
const soilPts = new Float32Array(N_SOIL * 2);
const lattice = [];                            // hex lattice dots inside the crystal
const molPos = new Float32Array(6 * 2);        // current molecule-diagram positions
const molTarget = new Float32Array(6 * 2);
const THETA = [PI, 0.7, 1.65, 2.65, 1.2];       // none, glass, leaf, wax, soil

const pAtm = (p) => 0.02 * Math.pow(10, 3 * p / 100);
const boilT = (atm) => Math.min(374, 1 / (1 / 373.15 - 0.000204 * Math.log(atm)) - 273.15);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const MYSTERIES = [
  { chip: 'Ice floats', line: 'Drop ice in a glass and it rises. Almost nothing else does that as a solid.',
    how: 'Water gets bigger when it freezes. Its molecules lock into an open, roomy lattice, so ice is about 9% less dense than the water it floats on.' },
  { chip: 'Water climbs', line: 'Dip a paper towel in a puddle and the water walks uphill.',
    how: 'This is capillary action. Water clings to the paper fibres and to itself, and in a thin enough gap that cling pulls it up against gravity.' },
  { chip: 'Water bends', line: 'A comb rubbed on a sweater can bend a thin stream from the tap.',
    how: 'Each water molecule is lopsided, with a slightly positive end and a slightly negative end. A charged comb tugs those ends, and the whole stream leans toward it.' },
  { chip: 'Water carves rock', line: 'Soft water. Hard rock. The canyon still says who won.',
    how: 'This is erosion. Moving water lifts grit and grinds it against the rock, and a little dissolved carbon dioxide makes it a weak acid that slowly eats limestone.' },
];

function layout() {
  const narrow = W < 700;
  cx = W * 0.5; cy = narrow ? 96 : Math.min(H * 0.3, 300);
  ys = cy + R * 0.95;
  mx = narrow ? W * 0.5 : cx + R * 4.2; my = narrow ? ys + 150 : cy;
  if (!dragging) bx = clamp(bx || cx, R * 1.3, W - R * 1.3);
}
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

function tempWord(T) {
  if (T < -150) return 'colder than the moon at night';
  if (T < tf) return 'ice';
  if (T === 0 && tf === 0) return 'melting point';
  if (T > tb) return T >= 340 ? 'supercritical' : 'steam';
  if (Math.abs(T - tb) < 0.5) return 'boiling point';
  if (T < 0) return 'still liquid';
  return T < 37 ? 'water' : 'warm water';
}

function seedVapor(i) {
  const o = i * 5, a = Math.random() * PI * 2, rr = R * 0.6 * Math.sqrt(Math.random());
  vapor[o] = bx + Math.cos(a) * rr; vapor[o + 1] = bcy + Math.sin(a) * rr;
  vapor[o + 2] = Math.cos(a) * 14 + (Math.random() - 0.5) * 10;
  vapor[o + 3] = -18 - Math.random() * 22;
  vapor[o + 4] = Math.random();
}

function molecule(x, y, ang, s, a) {
  c.globalAlpha = a;
  c.fillStyle = '#f4f9fb';
  c.beginPath(); c.arc(x + Math.cos(ang - 0.91) * s, y + Math.sin(ang - 0.91) * s, s * 0.42, 0, 7); c.fill();
  c.beginPath(); c.arc(x + Math.cos(ang + 0.91) * s, y + Math.sin(ang + 0.91) * s, s * 0.42, 0, 7); c.fill();
  c.fillStyle = '#7ff2ff';
  c.beginPath(); c.arc(x, y, s * 0.7, 0, 7); c.fill();
  c.globalAlpha = 1;
}

function say(key, text) {
  if (shown[key]) return;
  shown[key] = true; find.text = text; find.t = 0;
  const live = el && el.querySelector('.lab-live'); if (live) live.textContent = text;
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

export default {
  mount(section, ctx) {
    el = section; c = ctx.c2d; W = ctx.w; H = ctx.h;
    bx = 0; layout(); bx = cx;
    for (let i = 0; i < N_LIQ; i++) {
      const a = (i / N_LIQ) * PI * 2, r = R * (0.25 + (i % 3) * 0.22);
      liq[i * 2] = Math.cos(a) * r; liq[i * 2 + 1] = Math.sin(a) * r;
    }
    for (let i = 0; i < N_SALT; i++) {
      const a = i * 2.399, r = Math.sqrt((i + 0.5) / N_SALT) * 0.9;
      saltPts[i * 2] = Math.cos(a) * r; saltPts[i * 2 + 1] = Math.sin(a) * r;
    }
    for (let i = 0; i < N_BUB; i++) { bub[i * 3] = Math.random() * 2 - 1; bub[i * 3 + 1] = Math.random(); bub[i * 3 + 2] = 0.5 + Math.random() * 0.6; }
    for (let i = 0; i < N_SOIL; i++) { soilPts[i * 2] = Math.random(); soilPts[i * 2 + 1] = Math.random(); }
    const hexR = R * 1.045, dx = 17, dy = dx * 0.866;
    for (let row = -6; row <= 6; row++) for (let col = -6; col <= 6; col++) {
      const x = col * dx + (row & 1) * dx / 2, y = row * dy;
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax <= hexR * 0.866 - 4 && ay + ax * 0.577 <= hexR - 4) lattice.push(x, y);
    }
    for (let i = 0; i < N_VAPOR; i++) seedVapor(i);

    // unit gradients: made once, placed each frame with translate/scale
    gBg = c.createRadialGradient(0, 0, 0.02, 0, 0, 1);
    gBg.addColorStop(0, '#0a1e33'); gBg.addColorStop(1, '#04111f');
    gBlob = c.createRadialGradient(-0.3, -0.35, 0.03, 0, 0, 1.15);
    gBlob.addColorStop(0, 'rgba(127,242,255,0.95)'); gBlob.addColorStop(0.6, 'rgba(47,184,198,0.85)'); gBlob.addColorStop(1, 'rgba(11,51,82,0)');
    gIce = c.createRadialGradient(0, -0.3, 0.04, 0, 0, 1.2);
    gIce.addColorStop(0, 'rgba(244,249,251,0.8)'); gIce.addColorStop(1, 'rgba(160,220,240,0.35)');
    gGlow = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    gGlow.addColorStop(0, 'rgba(127,242,255,1)'); gGlow.addColorStop(1, 'rgba(127,242,255,0)');

    const style = document.createElement('style');
    style.textContent = `
      #lab .chapter-body { max-width: 600px; touch-action: pan-y; }
      #lab .controls input[type=range] { width: 280px; max-width: 70vw; }
      #lab .ticks { position: relative; width: 280px; max-width: 70vw; height: 44px; font-size: 0.6rem; letter-spacing: 0.05em; color: var(--muted); }
      #lab .ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
      #lab .ticks .mk { top: 28px; color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.54rem; transition: left 0.25s ease, opacity 1.2s; }
      #lab .ticks .mk::before { content: ""; position: absolute; left: 50%; top: -30px; height: 9px; width: 1px; background: var(--accent); }
      #lab .ticks .mk.frz { opacity: 0; }
      #lab .ticks .mk.frz.on { opacity: 1; }
      #lab .controls { gap: 18px 28px; }
      #lab .ctl { transition: opacity 1.4s ease; }
      #lab .ctl:not(.on) { opacity: 0; visibility: hidden; position: absolute; pointer-events: none; }
      #lab .surf { display: flex; flex-direction: column; gap: 2px; font-size: 0.72rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); }
      #lab .surf .chip-row { margin-top: 6px; }
      #lab .lab-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      @media (max-width: 820px) {
        #lab .controls input[type=range] { width: 100%; max-width: none; height: 44px; }
        #lab .controls label, #lab .ctl, #lab .surf { width: 100%; }
        #lab .ticks { width: calc(100% - 28px); max-width: none; margin: 0 14px; font-size: 0.66rem; }
        #lab .vol .bar { height: 44px; }
        #lab .chip { min-height: 44px; padding-left: 16px; padding-right: 16px; }
        #lab .chip-row { gap: 10px; }
      }
      @media (max-width: 480px) { #lab .ticks span.minor { display: none; } #lab .ticks { height: 34px; } #lab .ticks span[style*="top:12px"] { top: 0 !important; } #lab .ticks .mk { top: 16px; } #lab .ticks .mk::before { top: -18px; } }
      #lab .vol { display: flex; flex-direction: column; gap: 6px; font-size: 0.72rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); }
      #lab .vol .bar { width: 18px; height: 54px; border: 1px solid rgba(244,249,251,0.25); border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden; }
      #lab .vol .bar i { display: block; width: 100%; height: 50%; background: var(--turquoise); transition: height 0.6s ease, background 0.6s; }
      #lab .crit { color: var(--cyan); font-size: 0.9rem; min-height: 1.5em; margin: 8px 0 0; opacity: 0; transition: opacity 0.8s; }
      #lab .crit.on { opacity: 1; }
      #lab .mystery { margin-top: 14px; color: var(--mist); }
      #lab .mystery p { margin: 6px 0; }
      #lab .mystery .term { display: inline-block; font-size: 0.72rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--turquoise); margin-right: 8px; }
      #lab .mystery[hidden] { display: none; }`;
    el.appendChild(style);

    el.insertAdjacentHTML('beforeend', `
      <div class="lab-live" aria-live="polite"></div>
      <div class="chapter-body bottom">
        <p class="chapter-kicker">Lab</p>
        <h2>Water has many lives.</h2>
        <p class="lede">Turn the dial. Cold, warm, hot. Watch one blob become three things.</p>
        <div class="controls">
          <label>Temperature <input type="range" min="-200" max="374" value="20" aria-label="Temperature in degrees Celsius">
            <span class="ticks"><span style="left:0%">−200°</span><span class="minor" style="left:26.1%;top:12px">−50°</span><span style="left:34.8%">0°</span><span class="minor" style="left:38.3%;top:12px">20°</span><span class="minor" style="left:43.6%">50°</span><span style="left:52.3%;top:12px">100°</span><span style="left:100%">374°C</span><span class="mk boil" style="left:52.3%">boils</span><span class="mk frz" style="left:34.8%">freezes</span></span>
            <span class="value">20 °C · water</span></label>
          <div class="vol"><span>Volume</span><span class="bar vbar"><i></i></span></div>
          <label class="ctl p">Pressure <input type="range" min="0" max="100" value="57" aria-label="Pressure"><span class="value pv">1 atm</span></label>
          <label class="ctl s">Salt <input type="range" min="0" max="100" value="0" aria-label="Salt"><span class="value sv">fresh</span></label>
          <div class="vol ctl s"><span>Density</span><span class="bar dbar"><i></i></span></div>
          <div class="surf ctl f"><span>Surface</span><div class="chip-row"><button class="chip" aria-pressed="false" data-k="1">Glass</button><button class="chip" aria-pressed="false" data-k="2">Leaf</button><button class="chip" aria-pressed="false" data-k="3">Wax</button><button class="chip" aria-pressed="false" data-k="4">Soil</button></div></div>
        </div>
        <p class="crit">Above 374 °C and 218 atm there is no difference between liquid and gas.</p>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: cold makes ice. Warm makes water. Hot makes steam. And it can go back again.</p>
          <div class="l2"><span class="term">Discover</span><p>Water is odd. Almost everything shrinks when it freezes. Water gets bigger, so ice floats. That is why a lake freezes from the top down, and why the fish underneath survive the winter.</p></div>
          <div class="l3"><span class="term">Hydrogen bonding</span><p>A water molecule is bent, with a slightly negative oxygen and slightly positive hydrogens. In ice each molecule bonds to four neighbours in an open hexagonal lattice, about 9% less dense than the liquid. In liquid water those bonds break and reform trillions of times a second. That bonding also gives water a high heat capacity, which is why oceans moderate the climate.</p><p class="source">Source: <a href="https://www.usgs.gov/special-topics/water-science-school/science/adhesion-and-cohesion-water" target="_blank" rel="noopener">USGS Water Science School: Cohesion</a></p></div>
          <button class="depth-more">Discover</button>
        </div>
      </div>`);

    const cv = ctx.canvas;
    cv.style.touchAction = 'pan-y';
    let rc0 = R;
    const bodyEl = el.querySelector('.chapter-body');
    const scene = (e) => (e.target === cv || e.target === el || e.target === bodyEl) && e.clientY - cv.getBoundingClientRect().top < H * 0.6;
    el.addEventListener('pointerdown', (e) => {
      if (!scene(e)) return;
      const tp = addTap(cv, e, ctx.audio);
      if (surfOn && surfKind === 3 && Math.abs(tp.x - bx) < rc0 * 1.5 && Math.abs(tp.y - (ys - rc0)) < rc0 * 1.6) {
        dragging = true; grabOff = tp.x - bx; vx = 0; lastMoveT = e.timeStamp;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const x = e.clientX - cv.getBoundingClientRect().left;
      const nx = clamp(x - grabOff, R * 0.9, W - R * 0.9), d = nx - bx;
      const dtm = Math.max(4, e.timeStamp - lastMoveT); lastMoveT = e.timeStamp;
      vx = vx * 0.6 + (d / dtm * 1000) * 0.4;
      bx = nx; roll += d / R;
    });
    const drop = () => { dragging = false; };
    el.addEventListener('pointerup', drop); el.addEventListener('pointercancel', drop);
    this._rc = (v) => { rc0 = v; };

    const range = el.querySelector('input[type=range]');
    const val = el.querySelector('.controls .value');
    const bar = el.querySelector('.vbar i');
    const dbar = el.querySelector('.dbar i');
    const crit = el.querySelector('.crit');
    const boilMk = el.querySelector('.mk.boil'), frzMk = el.querySelector('.mk.frz');
    const pRange = el.querySelector('.ctl.p input'), pVal = el.querySelector('.pv');
    const sRange = el.querySelector('.ctl.s input'), sVal = el.querySelector('.sv');
    const ctls = { p: el.querySelectorAll('.ctl.p'), s: el.querySelectorAll('.ctl.s'), f: el.querySelectorAll('.ctl.f') };
    const reveal = (k) => { ctls[k].forEach((n) => n.classList.add('on')); if (k === 's') { saltOn = true; frzMk.classList.add('on'); } };
    const pos = (T) => `${(T + 200) / 574 * 100}%`;

    const refresh = () => {
      const T = temp, atm = pAtm(pres);
      tb = boilT(atm); tf = -21.1 * salt / 100;
      boilMk.style.left = pos(tb); frzMk.style.left = pos(tf);
      val.textContent = `${T} °C · ${tempWord(T)}`;
      const isIce = T < tf, isVap = T > tb;
      const vol = isIce ? 109 : isVap ? 0 : 100 + T * 0.04;
      bar.style.height = `${isVap ? Math.min(100, 45 + (T - tb) * 0.2) : vol / 2}%`;
      bar.style.background = isIce ? '#dbe9f2' : isVap ? 'rgba(219,233,242,0.35)' : 'var(--turquoise)';
      dbar.style.height = `${isVap ? 6 : isIce ? 46 : 52 + salt * 0.32}%`;
      dbar.style.background = isIce ? '#dbe9f2' : 'var(--turquoise)';
      crit.classList.toggle('on', T >= 340);
      pVal.textContent = Math.abs(atm - 1) < 0.07 ? '1 atm' : atm < 1 ? `${atm.toFixed(2)} atm` : `${atm < 10 ? atm.toFixed(1) : Math.round(atm)} atm`;
      sVal.textContent = salt < 4 ? 'fresh' : salt < 12 ? 'brackish' : salt < 30 ? 'seawater' : salt < 85 ? 'salty' : 'brine';
    };
    range.addEventListener('input', () => { temp = parseInt(range.value, 10); refresh(); reveal('p'); });
    pRange.addEventListener('input', () => { pres = +pRange.value; refresh(); reveal('s'); });
    sRange.addEventListener('input', () => { salt = +sRange.value; refresh(); reveal('f'); });
    refresh();

    const sChips = [...el.querySelectorAll('.surf .chip')];
    sChips.forEach((chip) => chip.addEventListener('click', () => {
      const k = +chip.dataset.k, on = !(surfOn && surfKind === k);
      sChips.forEach((ch) => ch.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', String(on));
      surfOn = on; if (on) { surfKind = k; if (k === 4) soilT = 4.8; }
      vx = 0; ctx.audio.plip(on ? 1.0 : 0.8);
    }));

    this._font = (getComputedStyle(document.body).getPropertyValue('--serif').trim() || 'Georgia, serif');
  },

  resize(ctx) { W = ctx.w; H = ctx.h; layout(); },

  tick(dt, breath, ctx) {
    const dts = dt / 1000, b = breath.value;
    if (!ctx.reduced) t += dts;
    const ease = Math.min(1, dts * 2.2);
    iceAmt += ((temp < tf ? 1 : 0) - iceAmt) * ease;
    vapAmt += ((temp > tb ? 1 : 0) - vapAmt) * Math.min(1, dts * 1.1);
    critAmt += ((temp >= 340 ? (temp - 340) / 34 : 0) - critAmt) * ease;
    surfAmt += ((surfOn ? 1 : 0) - surfAmt) * Math.min(1, dts * 3);
    saltShow += (salt / 100 - saltShow) * Math.min(1, dts * 3);
    theta += ((surfOn ? THETA[surfKind] : PI) - theta) * Math.min(1, dts * 3.5);
    const liqAmt = (1 - iceAmt) * (1 - vapAmt);
    const heat = clamp01(temp / 100);
    const sk = surfKind, soil = sk === 4;
    const bubAmt = clamp01(Math.max(clamp01((temp - (tb - 12)) / 12) * (1 - vapAmt), 4 * vapAmt * (1 - vapAmt)));

    // --- soil timeline: sit, sink, gone, fall from above ---
    if (surfOn && soil && liqAmt > 0.8) soilT += dts;
    if (soilT >= 5.5) soilT = 0;
    const sink = soilT < 4.8 ? clamp01((soilT - 0.6) / 3) : 0;
    const sinkE = sink * sink * (3 - 2 * sink);
    const stainA = surfAmt * (soil ? sinkE * (1 - clamp01((soilT - 3.6) / 1.2)) : 0);
    const fallDy = soilT > 4.8 ? -(1 - Math.pow(clamp01((soilT - 4.8) / 0.7), 2)) * (ys * 0.95) : 0;
    if (surfOn && soil && sink >= 1) say('soil', 'It disappeared into the ground. That’s infiltration.');

    // --- wax: rolling after release, otherwise ease home ---
    if (surfOn && sk === 3) {
      if (!dragging && (vx > 0.5 || vx < -0.5)) {
        bx += vx * dts; roll += vx * dts / R; vx *= Math.exp(-1.1 * dts);
        if (bx < R * 0.9) { bx = R * 0.9; vx = -vx * 0.5; } else if (bx > W - R * 0.9) { bx = W - R * 0.9; vx = -vx * 0.5; }
      }
    } else { bx += (cx - bx) * Math.min(1, dts * 3); vx = 0; }

    // --- geometry: a spherical cap with contact angle theta, sitting on the line ---
    const k = (0.92 + b * 0.08) * (0.4 + liqAmt * 0.6) * (1 + (0.5 - pres / 100) * 0.08);
    const areaK = 1 - sinkE * 0.9;
    const th = theta, ff = th - Math.sin(th) * Math.cos(th);
    const rc = Math.sqrt(PI * (R * 0.94) * (R * 0.94) * k * k * areaK / ff);
    const yBase = ys + sinkE * 14;
    const floatY = cy + saltShow * 5;
    const boilLift = bubAmt * (4 + Math.sin(t * 9) * 1.5);
    const yc = floatY + (yBase + rc * Math.cos(th) - floatY) * surfAmt + fallDy - boilLift * (1 - surfAmt * 0.6);
    this._rc(rc);
    const hr = R * 1.045 * (0.9 + iceAmt * 0.1);
    bcy = cy + (ys - hr - cy) * surfAmt;

    // discovery, after the fact
    if (iceAmt > 0.7) say('ice', 'You just made ice.');
    if (vapAmt > 0.3 && tb < 45 && temp < 45) say('boil', 'It boiled at room temperature. That’s pressure.');
    if (saltShow > 0.25 && temp < -1 && temp >= tf && liqAmt > 0.5) say('salt', 'Salt water freezes later. Ships count on that.');
    if (surfOn && (sk === 2 || sk === 3) && theta > 1.7 && liqAmt > 0.5) say('bead', 'It beaded. That’s surface tension.');

    // --- draw ---
    const bgS = Math.max(W, H) * 0.8;
    c.save(); c.translate(cx, cy); c.scale(bgS, bgS); c.fillStyle = gBg; c.fillRect(-cx / bgS, -cy / bgS, W / bgS, H / bgS); c.restore();

    // surface
    if (surfAmt > 0.01) {
      c.globalAlpha = surfAmt;
      if (sk === 1) { c.fillStyle = 'rgba(200,235,245,0.09)'; c.fillRect(0, ys, W, 10); c.fillStyle = 'rgba(244,249,251,0.5)'; c.fillRect(0, ys, W, 1.2); }
      else if (sk === 2) { c.fillStyle = 'rgba(63,143,122,0.55)'; c.fillRect(0, ys, W, 3); c.fillStyle = 'rgba(63,143,122,0.18)'; c.fillRect(0, ys + 3, W, 9); }
      else if (sk === 3) { c.fillStyle = 'rgba(217,199,163,0.55)'; c.fillRect(0, ys, W, 2); c.fillStyle = 'rgba(217,199,163,0.12)'; c.fillRect(0, ys + 2, W, 6); }
      else if (soil) {
        c.fillStyle = 'rgba(46,33,23,0.92)'; c.fillRect(0, ys, W, 44);
        c.fillStyle = 'rgba(107,79,58,0.9)'; c.fillRect(0, ys, W, 1.5);
        for (let i = 0; i < N_SOIL; i += 2) c.fillRect(soilPts[i * 2] * W, ys + 4 + soilPts[i * 2 + 1] * 38, 2, 2);
        c.fillStyle = 'rgba(217,199,163,0.4)';
        for (let i = 1; i < N_SOIL; i += 2) c.fillRect(soilPts[i * 2] * W, ys + 4 + soilPts[i * 2 + 1] * 38, 1.5, 1.5);
      }
      if (stainA > 0.01) { c.globalAlpha = stainA * 0.7; c.fillStyle = '#120a05'; c.beginPath(); c.ellipse(bx, ys + 10, 16 + sinkE * 44, 5 + sinkE * 9, 0, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    }

    // ICE: freezing starts at the rim and the front creeps inward (cold walls first, then a ring of crystal);
    // melting starts at the rim too, so the ice pulls in and shrinks away from the edge.
    if (iceAmt > 0.01) {
      const e = iceAmt * iceAmt * (3 - 2 * iceAmt), frz = temp < tf;
      const inner = frz ? 1 - e : 0, outer = frz ? 1 : 0.35 + 0.65 * e;
      c.globalAlpha = Math.min(1, iceAmt * 3);
      c.save(); c.translate(bx, bcy); c.scale(hr, hr);
      c.fillStyle = gIce; c.strokeStyle = 'rgba(244,249,251,0.8)'; c.lineWidth = 1.2 / hr;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; i ? c.lineTo(Math.cos(a) * outer, Math.sin(a) * outer) : c.moveTo(Math.cos(a) * outer, Math.sin(a) * outer); }
      c.closePath();
      if (inner > 0.02) for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; i ? c.lineTo(Math.cos(a) * inner, Math.sin(a) * inner) : c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); }
      if (inner > 0.02) c.closePath();
      c.fill('evenodd'); c.stroke(); c.restore();
      c.fillStyle = `rgba(11,51,82,${0.55 + b * 0.15})`;
      const lo = hr * inner, hi = hr * outer;
      for (let i = 0; i < lattice.length; i += 2) {
        const dd = Math.hypot(lattice[i], lattice[i + 1]);
        if (dd < lo || dd > hi) continue;
        c.beginPath(); c.arc(bx + lattice[i], bcy + lattice[i + 1], 1.6, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }

    // LIQUID: a cap of water with contact angle theta; wobbles and breathes
    const liqA = liqAmt * (1 - sinkE * sinkE);
    if (liqA > 0.01 && sink < 0.98) {
      c.globalAlpha = liqA;
      c.save(); c.translate(bx, yc); c.scale(rc, rc);
      c.fillStyle = gBlob; c.beginPath();
      const NP = 48, hw = 2.5 / rc, hw2 = (1 + heat * 2) / rc;
      for (let i = 0; i <= NP; i++) {
        const a = -th + i / NP * 2 * th, w = Math.min(1, (th - Math.abs(a)) * 2.5);
        const rr = 1 + (Math.sin(a * 3 + t * 1.7) * hw + Math.sin(a * 5 - t * 2.3) * hw2) * w;
        i ? c.lineTo(Math.sin(a) * rr, -Math.cos(a) * rr) : c.moveTo(Math.sin(a) * rr, -Math.cos(a) * rr);
      }
      c.closePath(); c.fill();
      if (saltShow > 0.02) { c.fillStyle = `rgba(7,26,46,${saltShow * 0.35})`; c.fill(); }
      // bubbles rising inside
      if (bubAmt > 0.02) {
        const ct = Math.cos(th), wU = th > PI / 2 ? 1 : Math.sin(th), yb = Math.min(0.55, -ct - 0.14);
        c.lineWidth = 1.3 / rc; c.strokeStyle = '#f4f9fb';
        for (let i = 0; i < N_BUB; i++) {
          const o = i * 3;
          if (!ctx.reduced) bub[o + 1] += dts * bub[o + 2] * (0.5 + bubAmt * 1.5);
          if (bub[o + 1] >= 1) { bub[o + 1] = 0; bub[o] = Math.random() * 2 - 1; bub[o + 2] = 0.5 + Math.random() * 0.6; }
          const l = bub[o + 1];
          c.globalAlpha = liqA * bubAmt * Math.sin(l * PI) * 0.85;
          c.beginPath(); c.arc(bub[o] * 0.5 * wU + Math.sin(t * 6 + i) * 0.02, yb - (yb + 0.55) * l, (0.05 + (i % 3) * 0.03) * (0.6 + l * 0.6), 0, 7); c.stroke();
        }
      }
      c.restore();
      c.globalAlpha = liqA;
      // molecules inside, jittering more when warm; salt dots among them
      const hwid = th > PI / 2 ? rc : rc * Math.sin(th), top = yc - rc, bot = Math.min(ys - 3, yc + rc), midY = (top + bot) / 2, hh = (bot - top) * 0.35;
      const jit = (2 + heat * 9) * (0.6 + b * 0.5);
      c.fillStyle = 'rgba(244,249,251,0.7)';
      for (let i = 0; i < N_LIQ; i++) {
        const px = bx + liq[i * 2] / (R * 0.7) * hwid * 0.7 + Math.sin(t * (3 + i) + i) * jit;
        const py = midY + liq[i * 2 + 1] / (R * 0.7) * hh + Math.cos(t * (2.6 + i * 0.7) + i * 2) * jit;
        if (py > ys - 3) continue;
        c.beginPath(); c.arc(px, py, 2, 0, 7); c.fill();
      }
      if (saltShow > 0.02) {
        const ns = Math.ceil(saltShow * N_SALT), sj = 1.5 * (0.6 + b * 0.8);
        c.fillStyle = 'rgba(244,249,251,0.8)'; c.globalAlpha = liqA * (0.35 + saltShow * 0.45);
        for (let i = 0; i < ns; i++) {
          const px = bx + saltPts[i * 2] * hwid * 0.85 + Math.sin(t * 1.3 + i * 2) * sj, py = midY + saltPts[i * 2 + 1] * hh * 1.5 + Math.cos(t * 1.1 + i) * sj;
          if (py > ys - 3) continue;
          c.fillRect(px - 1, py - 1, 2, 2);
        }
      }
      c.globalAlpha = 1;
      // a chip of ice floating on the surface; saltier water lifts it higher
      if (saltOn && surfAmt < 0.4 && liqA > 0.4) {
        const w = 26, h = 16, f = 0.18 + saltShow * 0.5, wl = yc - rc * 0.96 + 4 + (0.5 - b) * 1.6, x = bx + rc * 0.28, top2 = wl - h * f;
        c.globalAlpha = liqA * (1 - surfAmt);
        for (let pass = 0; pass < 2; pass++) {
          c.save();
          if (pass) { c.beginPath(); c.rect(x - w, top2 - 6, w * 2, wl - top2 + 6); c.clip(); }
          c.globalAlpha = (pass ? 0.92 : 0.28) * liqA * (1 - surfAmt);
          c.fillStyle = 'rgba(244,249,251,1)'; c.strokeStyle = 'rgba(244,249,251,0.9)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x - w * 0.5, top2 + 2); c.lineTo(x - w * 0.32, top2); c.lineTo(x + w * 0.36, top2 + 1); c.lineTo(x + w * 0.5, top2 + h * 0.5); c.lineTo(x + w * 0.3, top2 + h); c.lineTo(x - w * 0.42, top2 + h * 0.95); c.closePath();
          c.fill(); if (pass) c.stroke();
          c.restore();
        }
        c.globalAlpha = 1;
      }
      // wax: a couple of marks that turn as it rolls
      if (surfOn && sk === 3 && th > 2.3) {
        c.fillStyle = 'rgba(244,249,251,0.5)';
        for (let i = 0; i < 3; i++) { const a = roll + i * 2.09; if (Math.cos(a) > 0) { c.beginPath(); c.arc(bx + Math.sin(a) * rc * 0.62, yc + Math.sin(a * 0.7 + i) * rc * 0.2, 1.8, 0, 7); c.fill(); } }
      }
      c.globalAlpha = 1;
    }

    // VAPOR
    if (vapAmt > 0.01) {
      const spread = 0.6 + Math.min(1, (temp - tb) / 274) * 1.2;
      for (let i = 0; i < N_VAPOR; i++) {
        const o = i * 5;
        vapor[o + 4] += dts * 0.35;
        if (vapor[o + 4] >= 1) seedVapor(i);
        if (ctx.reduced) continue;
        vapor[o] += (vapor[o + 2] * spread + Math.sin(t * 2 + i) * 6 * (0.7 + b * 0.6)) * dts;
        vapor[o + 1] += vapor[o + 3] * spread * dts;
      }
      c.fillStyle = '#dbe9f2';
      for (let i = 0; i < N_VAPOR; i++) {
        const o = i * 5, life = vapor[o + 4];
        c.globalAlpha = Math.sin(life * PI) * 0.7 * vapAmt * (1 - critAmt * 0.6);
        c.beginPath(); c.arc(vapor[o], vapor[o + 1], 1.5 + life * 2, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    // CRITICAL
    if (critAmt > 0.01) {
      c.fillStyle = gGlow;
      for (let i = 0; i < 40; i++) {
        const a = i * 2.399 + t * 0.4, rr = R * (0.2 + (i % 7) * 0.25) + Math.sin(t * 3 + i) * 12;
        c.globalAlpha = Math.max(0, critAmt * (0.18 + Math.sin(t * 6 + i * 1.3) * 0.12));
        c.save(); c.translate(bx + Math.cos(a) * rr, bcy + Math.sin(a) * rr * 0.8); c.scale(22, 22); c.fillRect(-1, -1, 2, 2); c.restore();
      }
      c.globalAlpha = 1;
    }

    // discovery line, under the blob
    if (find.t < 4.6) {
      find.t += dts;
      const a = Math.min(find.t / 0.6, 1, (4.6 - find.t) / 0.7);
      if (a > 0) {
        c.globalAlpha = Math.max(0, a) * 0.9; c.fillStyle = '#dbe9f2'; c.textAlign = 'center';
        c.font = `italic ${W < 700 ? 16 : 18}px ${this._font}`;
        c.fillText(find.text, cx, ys + 32 + (soil ? surfAmt * 44 : 0));
        c.globalAlpha = 1;
      }
    }

    // Molecule diagram: tidy hex ring (ice), loose cluster (liquid), scattered (vapor)
    const s = 9, ring = 34;
    for (let i = 0; i < 6; i++) {
      const a = i * PI / 3;
      let tx, ty;
      if (iceAmt > 0.5) { tx = Math.cos(a) * ring; ty = Math.sin(a) * ring; }
      else if (vapAmt > 0.5) { tx = Math.cos(a + t * 0.3 + i) * ring * 2.4; ty = Math.sin(a * 1.3 + t * 0.25) * ring * 1.8; }
      else { tx = Math.cos(a + i * 0.5) * ring * 0.8 + Math.sin(t * 1.1 + i) * 8; ty = Math.sin(a + i * 0.4) * ring * 0.7 + Math.cos(t * 0.9 + i * 2) * 8; }
      molTarget[i * 2] = tx; molTarget[i * 2 + 1] = ty;
      molPos[i * 2] += (tx - molPos[i * 2]) * ease;
      molPos[i * 2 + 1] += (ty - molPos[i * 2 + 1]) * ease;
    }
    if (iceAmt > 0.5) {
      c.strokeStyle = 'rgba(219,233,242,0.35)'; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < 6; i++) { const x = mx + molPos[i * 2], y = my + molPos[i * 2 + 1]; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.closePath(); c.stroke();
    }
    const jit = liqAmt * (1 + heat * 3) * (0.6 + b * 0.5);
    for (let i = 0; i < 6; i++) {
      const ang = iceAmt > 0.5 ? i * PI / 3 + PI : t * (0.4 + i * 0.15) + i;
      molecule(mx + molPos[i * 2] + Math.sin(t * 5 + i) * jit, my + molPos[i * 2 + 1] + Math.cos(t * 4 + i) * jit, ang, s, 0.85);
    }
    c.fillStyle = 'rgba(244,249,251,0.45)'; c.font = '11px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(iceAmt > 0.5 ? 'locked in a ring' : vapAmt > 0.5 ? 'flying free' : 'holding hands, letting go', mx, my + ring * 2.2 + 14);
    drawTaps(c, dt);
  },
};
