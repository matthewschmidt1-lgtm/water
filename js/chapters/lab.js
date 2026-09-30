// 08 — Lab. One blob of water and a temperature dial. Ice, liquid, vapor, and the
// strange place above 374 °C where liquid and gas stop being different things.

const R = 60;                        // resting liquid radius (px)
const N_VAPOR = 80;
const N_LIQ = 14;

let el, c, W = 0, H = 0, t = 0;
let temp = 20;
let iceAmt = 0, vapAmt = 0, critAmt = 0;   // eased 0..1 blends
let cx = 0, cy = 0, mx = 0, my = 0;        // blob centre, molecule-diagram centre
const vapor = new Float32Array(N_VAPOR * 5);   // x, y, vx, vy, life
const liq = new Float32Array(N_LIQ * 2);       // resting positions inside blob
const lattice = [];                            // hex lattice dots inside the crystal
const molPos = new Float32Array(6 * 2);        // current molecule-diagram positions
const molTarget = new Float32Array(6 * 2);

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
  cx = narrow ? W * 0.5 : W * 0.5; cy = narrow ? H * 0.26 : H * 0.3;
  mx = narrow ? W * 0.5 : cx + R * 3.4; my = narrow ? cy + R * 2.6 : cy;
}

function tempWord(T) {
  if (T < -150) return 'colder than the moon at night';
  if (T < 0) return 'ice';
  if (T === 0) return 'melting point';
  if (T < 37) return 'water';
  if (T < 100) return 'warm water';
  if (T === 100) return 'boiling point';
  if (T < 340) return 'steam';
  return 'supercritical';
}

function seedVapor(i) {
  const o = i * 5, a = Math.random() * Math.PI * 2, rr = R * 0.6 * Math.sqrt(Math.random());
  vapor[o] = cx + Math.cos(a) * rr; vapor[o + 1] = cy + Math.sin(a) * rr;
  vapor[o + 2] = Math.cos(a) * 14 + (Math.random() - 0.5) * 10;
  vapor[o + 3] = -18 - Math.random() * 22;
  vapor[o + 4] = Math.random();
}

function molecule(x, y, ang, s, a) {
  c.fillStyle = `rgba(244,249,251,${a})`;
  c.beginPath(); c.arc(x + Math.cos(ang - 0.91) * s, y + Math.sin(ang - 0.91) * s, s * 0.42, 0, 7); c.fill();
  c.beginPath(); c.arc(x + Math.cos(ang + 0.91) * s, y + Math.sin(ang + 0.91) * s, s * 0.42, 0, 7); c.fill();
  c.fillStyle = `rgba(127,242,255,${a})`;
  c.beginPath(); c.arc(x, y, s * 0.7, 0, 7); c.fill();
}

export default {
  mount(section, ctx) {
    el = section; c = ctx.c2d; W = ctx.w; H = ctx.h;
    layout();
    for (let i = 0; i < N_LIQ; i++) {
      const a = (i / N_LIQ) * Math.PI * 2, r = R * (0.25 + (i % 3) * 0.22);
      liq[i * 2] = Math.cos(a) * r; liq[i * 2 + 1] = Math.sin(a) * r;
    }
    const hexR = R * 1.045, dx = 17, dy = dx * 0.866;
    for (let row = -6; row <= 6; row++) for (let col = -6; col <= 6; col++) {
      const x = col * dx + (row & 1) * dx / 2, y = row * dy;
      // inside a flat-top hexagon of radius hexR
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax <= hexR * 0.866 - 4 && ay + ax * 0.577 <= hexR - 4) lattice.push(x, y);
    }
    for (let i = 0; i < N_VAPOR; i++) seedVapor(i);

    const style = document.createElement('style');
    style.textContent = `
      #lab .chapter-body { max-width: 600px; }
      #lab .controls input[type=range] { width: 280px; max-width: 70vw; }
      #lab .ticks { position: relative; width: 280px; max-width: 70vw; height: 26px; font-size: 0.6rem; letter-spacing: 0.05em; color: var(--muted); }
      #lab .ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
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
      <div class="chapter-body bottom">
        <p class="chapter-kicker">08 — Lab</p>
        <h2>Water has many lives.</h2>
        <p class="lede">Turn the dial. Cold, warm, hot. Watch one blob become three things.</p>
        <div class="controls">
          <label>Temperature <input type="range" min="-200" max="374" value="20" aria-label="Temperature in degrees Celsius">
            <span class="ticks"><span style="left:0%">−200°</span><span style="left:26.1%;top:12px">−50°</span><span style="left:34.8%">0°</span><span style="left:38.3%;top:12px">20°</span><span style="left:43.6%">50°</span><span style="left:52.3%;top:12px">100°</span><span style="left:100%">374°C</span></span>
            <span class="value">20 °C · water</span></label>
          <div class="vol"><span>Volume</span><span class="bar"><i></i></span></div>
        </div>
        <p class="crit">Above 374 °C and 218 atm there is no difference between liquid and gas.</p>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: cold makes ice. Warm makes water. Hot makes steam. And it can go back again.</p>
          <div class="l2"><span class="term">Discover</span><p>Water is odd. Almost everything shrinks when it freezes. Water gets bigger, so ice floats. That is why a lake freezes from the top down, and why the fish underneath survive the winter.</p></div>
          <div class="l3"><span class="term">Hydrogen bonding</span><p>A water molecule is bent, with a slightly negative oxygen and slightly positive hydrogens. In ice each molecule bonds to four neighbours in an open hexagonal lattice, about 9% less dense than the liquid. In liquid water those bonds break and reform trillions of times a second. That bonding also gives water a high heat capacity, which is why oceans moderate the climate.</p></div>
          <button class="depth-more">Discover</button>
        </div>
        <p class="chapter-kicker" style="margin-top:32px">Impossible water</p>
        <div class="chip-row">${MYSTERIES.map((m, i) => `<button class="chip" aria-pressed="false" data-i="${i}">${m.chip}</button>`).join('')}</div>
        <div class="mystery" hidden><p class="line"></p><p><span class="term">How?</span><span class="how"></span></p></div>
      </div>`);

    const range = el.querySelector('input[type=range]');
    const val = el.querySelector('.controls .value');
    const bar = el.querySelector('.vol .bar i');
    const crit = el.querySelector('.crit');
    const setTemp = (T) => {
      temp = T;
      val.textContent = `${T} °C · ${tempWord(T)}`;
      const vol = T < 0 ? 109 : T <= 100 ? 100 + T * 0.04 : Math.min(100, 104 + (T - 100) * 0.6);
      bar.style.height = `${T > 100 ? Math.min(100, 45 + (T - 100) * 0.2) : vol / 2}%`;
      bar.style.background = T < 0 ? '#dbe9f2' : T > 100 ? 'rgba(219,233,242,0.35)' : 'var(--turquoise)';
      crit.classList.toggle('on', T >= 340);
    };
    range.addEventListener('input', () => setTemp(parseInt(range.value, 10)));
    setTemp(20);

    const chips = [...el.querySelectorAll('.chip')];
    const box = el.querySelector('.mystery');
    chips.forEach((chip) => chip.addEventListener('click', () => {
      const i = +chip.dataset.i, open = chip.getAttribute('aria-pressed') !== 'true';
      chips.forEach((ch) => ch.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', String(open));
      box.hidden = !open;
      if (open) { box.querySelector('.line').textContent = MYSTERIES[i].line; box.querySelector('.how').textContent = MYSTERIES[i].how; }
      ctx.audio.plip(open ? 1.1 : 0.9);
    }));
  },

  resize(ctx) { W = ctx.w; H = ctx.h; layout(); },

  tick(dt, breath, ctx) {
    const dts = dt / 1000, b = breath.value;
    if (!ctx.reduced) t += dts;
    const ease = Math.min(1, dts * 2.2);
    iceAmt += ((temp < 0 ? 1 : 0) - iceAmt) * ease;
    vapAmt += ((temp > 100 ? 1 : 0) - vapAmt) * ease;
    critAmt += ((temp >= 340 ? (temp - 340) / 34 : 0) - critAmt) * ease;
    const liqAmt = (1 - iceAmt) * (1 - vapAmt);
    const heat = Math.max(0, Math.min(1, temp / 100));

    const bg = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#0a1e33'); bg.addColorStop(1, '#04111f');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    // ICE: a slightly larger hexagonal crystal with a hex lattice of dots
    if (iceAmt > 0.01) {
      const hr = R * 1.045 * (0.9 + iceAmt * 0.1), rot = Math.PI / 6;
      c.globalAlpha = iceAmt;
      const g = c.createRadialGradient(cx, cy - hr * 0.3, 4, cx, cy, hr * 1.2);
      g.addColorStop(0, 'rgba(244,249,251,0.8)'); g.addColorStop(1, 'rgba(160,220,240,0.35)');
      c.fillStyle = g; c.strokeStyle = 'rgba(244,249,251,0.8)'; c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; i ? c.lineTo(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr) : c.moveTo(cx + Math.cos(a) * hr, cy + Math.sin(a) * hr); }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = `rgba(11,51,82,${0.55 + b * 0.15})`;
      for (let i = 0; i < lattice.length; i += 2) { c.beginPath(); c.arc(cx + lattice[i], cy + lattice[i + 1], 1.6, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    }
    // LIQUID: a round wobbling blob that breathes, with molecules jittering more when warm
    if (liqAmt > 0.01) {
      const r = R * (0.92 + b * 0.08) * (0.4 + liqAmt * 0.6);
      c.globalAlpha = liqAmt;
      const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 2, cx, cy, r * 1.15);
      g.addColorStop(0, 'rgba(127,242,255,0.95)'); g.addColorStop(0.6, 'rgba(47,184,198,0.85)'); g.addColorStop(1, 'rgba(11,51,82,0)');
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = i / 48 * Math.PI * 2;
        const rr = r + Math.sin(a * 3 + t * 1.7) * 2.5 + Math.sin(a * 5 - t * 2.3) * (1 + heat * 2);
        i ? c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : c.moveTo(cx + rr, cy);
      }
      c.closePath(); c.fill();
      const jit = (2 + heat * 9) * (0.6 + b * 0.5);
      c.fillStyle = 'rgba(244,249,251,0.7)';
      for (let i = 0; i < N_LIQ; i++) {
        const px = cx + liq[i * 2] * (r / R) + Math.sin(t * (3 + i) + i) * jit;
        const py = cy + liq[i * 2 + 1] * (r / R) + Math.cos(t * (2.6 + i * 0.7) + i * 2) * jit;
        c.beginPath(); c.arc(px, py, 2, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    // VAPOR: ~80 dots drifting up and out, fading, reborn at the centre
    if (vapAmt > 0.01) {
      const spread = 0.6 + Math.min(1, (temp - 100) / 274) * 1.2;
      for (let i = 0; i < N_VAPOR; i++) {
        const o = i * 5;
        vapor[o + 4] += dts * 0.35;
        if (vapor[o + 4] >= 1) seedVapor(i);
        if (ctx.reduced) continue;
        vapor[o] += (vapor[o + 2] * spread + Math.sin(t * 2 + i) * 6) * dts;
        vapor[o + 1] += vapor[o + 3] * spread * dts;
      }
      for (let i = 0; i < N_VAPOR; i++) {
        const o = i * 5, life = vapor[o + 4];
        const a = Math.sin(life * Math.PI) * 0.7 * vapAmt * (1 - critAmt * 0.6);
        c.fillStyle = `rgba(219,233,242,${a})`;
        c.beginPath(); c.arc(vapor[o], vapor[o + 1], 1.5 + life * 2, 0, 7); c.fill();
      }
    }
    // CRITICAL: a shimmering field with no boundary
    if (critAmt > 0.01) {
      for (let i = 0; i < 40; i++) {
        const a = i * 2.399 + t * 0.4, rr = R * (0.2 + (i % 7) * 0.25) + Math.sin(t * 3 + i) * 12;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8;
        const g = c.createRadialGradient(x, y, 0, x, y, 22);
        g.addColorStop(0, `rgba(127,242,255,${critAmt * (0.18 + Math.sin(t * 6 + i * 1.3) * 0.12)})`); g.addColorStop(1, 'rgba(127,242,255,0)');
        c.fillStyle = g; c.fillRect(x - 22, y - 22, 44, 44);
      }
    }

    // Molecule diagram: tidy hex ring (ice), loose cluster (liquid), scattered (vapor)
    const s = 9, ring = 34;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
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
      const ang = iceAmt > 0.5 ? i * Math.PI / 3 + Math.PI : t * (0.4 + i * 0.15) + i;
      molecule(mx + molPos[i * 2] + Math.sin(t * 5 + i) * jit, my + molPos[i * 2 + 1] + Math.cos(t * 4 + i) * jit, ang, s, 0.85);
    }
    c.fillStyle = 'rgba(244,249,251,0.45)'; c.font = '11px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(iceAmt > 0.5 ? 'locked in a ring' : vapAmt > 0.5 ? 'flying free' : 'holding hands, letting go', mx, my + ring * 2.2 + 14);
  },
};
