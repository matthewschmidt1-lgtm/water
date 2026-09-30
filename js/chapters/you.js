// 09 — You. A figure mostly made of water. It fills on the inhale, breathes out mist
// on the exhale, and the site's three lines arrive one per breath.

const N_IN = 70, N_OUT = 40;
const AGES = [
  { chip: 'Baby', pct: 75, note: 'A newborn is about three-quarters water.' },
  { chip: 'Child', pct: 65, note: 'A child is about two-thirds water.' },
  { chip: 'Adult', pct: 60, note: 'An adult is about six-tenths water.' },
  { chip: 'Elder', pct: 55, note: 'We dry out a little as we age. Still more than half.' },
];
const LINES = ['Water changes.', 'Water connects.', 'Water returns.'];

let el, body, c, W = 0, H = 0, t = 0;
let fx = 0, fy = 0, fh = 0, fw = 0, headR = 0, top = 0, bottom = 0;   // figure geometry
let cloudX = 0, cloudY = 0, cupX = 0, cupY = 0;
let figure = null;                   // Path2D
let target = 60, level = 60, rate = 0.08;   // percent; rate = ease per second
let lineI = 0, lineT = 0, offPhase = null;
let pctEl = null, noteEl = null;
const pin = new Float32Array(N_IN * 4);     // x, y, progress, seed
const pout = new Float32Array(N_OUT * 4);   // x, y, life, seed

function layout() {
  const narrow = W < 900;
  body.classList.toggle('bottom', narrow);
  fh = narrow ? Math.min(H * 0.42, 300) : Math.min(H * 0.62, 420);
  fw = fh * 0.4;
  fx = narrow ? W * 0.5 : W * 0.74;
  top = narrow ? H * 0.07 : H * 0.5 - fh / 2;
  bottom = top + fh; fy = top + fh / 2;
  headR = fh * 0.11;
  cloudX = narrow ? W * 0.12 : W * 0.42; cloudY = narrow ? H * 0.06 : H * 0.14;
  cupX = narrow ? W * 0.88 : Math.min(W - 40, fx + fw * 1.5); cupY = narrow ? top + fh * 0.9 : bottom - 6;
  figure = new Path2D();
  figure.arc(fx, top + headR, headR, 0, Math.PI * 2);
  const by = top + headR * 2.25, bh = bottom - by, r = fw * 0.42;
  figure.moveTo(fx - fw / 2 + r, by);
  figure.arcTo(fx + fw / 2, by, fx + fw / 2, by + bh, r);
  figure.arcTo(fx + fw / 2, bottom, fx - fw / 2, bottom, r * 0.6);
  figure.arcTo(fx - fw / 2, bottom, fx - fw / 2, by, r * 0.6);
  figure.arcTo(fx - fw / 2, by, fx + fw / 2, by, r);
  figure.closePath();
}

function seedIn(i) {
  const o = i * 4, fromCloud = i % 2 === 0;
  pin[o] = fromCloud ? cloudX + (Math.random() - 0.5) * 80 : cupX + (Math.random() - 0.5) * 30;
  pin[o + 1] = fromCloud ? cloudY + (Math.random() - 0.5) * 30 : cupY - Math.random() * 20;
  pin[o + 2] = -Math.random() * 1.5;        // negative = waiting
  pin[o + 3] = Math.random() * 6.28;
}
function seedOut(i) {
  const o = i * 4;
  pout[o] = fx + (Math.random() - 0.5) * headR; pout[o + 1] = top + headR * 1.3;
  pout[o + 2] = -Math.random() * 1.2; pout[o + 3] = Math.random() * 6.28;
}

export default {
  mount(section, ctx) {
    el = section; c = ctx.c2d; W = ctx.w; H = ctx.h;
    const style = document.createElement('style');
    style.textContent = `
      #you .chapter-body { max-width: 520px; }
      #you .note { color: var(--mist); min-height: 1.5em; margin: 10px 0 0; font-size: 0.95rem; }
      #you .controls .btn { margin-top: 0; }`;
    el.appendChild(style);
    el.insertAdjacentHTML('beforeend', `
      <div class="chapter-body left">
        <p class="chapter-kicker">09 — You</p>
        <h2>The water in you has been everywhere.</h2>
        <p class="lede">You are mostly water. It comes in, it goes out, and it never really stops.</p>
        <div class="controls">
          <label>Water in you <span class="value">60%</span></label>
          <button class="btn">Drink</button>
        </div>
        <div class="chip-row">${AGES.map((a, i) => `<button class="chip" aria-pressed="${i === 2}" data-i="${i}">${a.chip}</button>`).join('')}</div>
        <p class="note">${AGES[2].note}</p>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: you are mostly water. Every sip has been a cloud, a river, and maybe a dinosaur's drink.</p>
          <div class="l2"><span class="term">Discover</span><p>Water moves through you all day. It rides in your blood, leaves as sweat, floats out with every breath, and spills as tears. You lose about a litre a day just by breathing and sweating, which is why you get thirsty.</p></div>
          <div class="l3"><span class="term">Homeostasis</span><p>Your kidneys keep water and salt in balance, filtering the blood and holding on to water when you need it. Osmosis moves water across cell walls toward the saltier side. An adult is about 60% water by mass, the brain and heart about 73%, bones about 30%. The same water has cycled through clouds, rivers, and living things for roughly four billion years.</p></div>
          <button class="depth-more">Discover</button>
        </div>
      </div>`);
    body = el.querySelector('.chapter-body');
    pctEl = el.querySelector('.controls .value');
    noteEl = el.querySelector('.note');
    layout();
    for (let i = 0; i < N_IN; i++) seedIn(i);
    for (let i = 0; i < N_OUT; i++) seedOut(i);

    const chips = [...el.querySelectorAll('.chip')];
    chips.forEach((chip) => chip.addEventListener('click', () => {
      chips.forEach((ch) => ch.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      const a = AGES[+chip.dataset.i];
      target = a.pct; rate = 1.6; noteEl.textContent = a.note;
      ctx.audio.plip(1 + a.pct / 200);
    }));
    el.querySelector('.btn').addEventListener('click', () => {
      level = Math.min(target + 12, level + 3); rate = 0.08;
      ctx.audio.plip(0.8 + Math.random() * 0.3);
    });
    offPhase = ctx.breath.onPhase(() => { lineI = (lineI + 1) % LINES.length; lineT = 0; });
  },

  resize(ctx) { W = ctx.w; H = ctx.h; layout(); },

  unmount() { offPhase?.(); },

  tick(dt, breath, ctx) {
    const dts = dt / 1000, b = breath.value, inhale = breath.phase === 'inhale';
    if (!ctx.reduced) t += dts;
    lineT += dts;
    level += (target - level) * Math.min(1, dts * rate);   // chips snap, drinks drift back slowly
    const shown = Math.round(level);
    if (pctEl.textContent !== shown + '%') pctEl.textContent = shown + '%';

    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#071a2e'); bg.addColorStop(1, '#04111f');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    // A faint cloud (top-left of the figure) and a faint cup (bottom-right)
    c.fillStyle = 'rgba(219,233,242,0.07)';
    for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(cloudX + (i - 2) * 22, cloudY + (i % 2) * 8, 20 + (i % 3) * 6, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(219,233,242,0.18)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cupX - 16, cupY - 34); c.lineTo(cupX - 12, cupY); c.lineTo(cupX + 12, cupY); c.lineTo(cupX + 16, cupY - 34); c.stroke();

    // The figure: outline, then water inside clipped to the silhouette
    c.strokeStyle = `rgba(219,233,242,${0.35 + b * 0.15})`; c.lineWidth = 1.5;
    c.stroke(figure);
    c.save(); c.clip(figure);
    const lvl = bottom - (bottom - top) * (level / 100) + (0.5 - b) * 4;
    const g = c.createLinearGradient(0, lvl, 0, bottom);
    g.addColorStop(0, `rgba(127,242,255,${0.55 + b * 0.25})`);
    g.addColorStop(0.4, `rgba(47,184,198,${0.6 + b * 0.15})`);
    g.addColorStop(1, 'rgba(11,51,82,0.95)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(fx - fw, bottom + 2);
    for (let x = fx - fw; x <= fx + fw; x += 6) c.lineTo(x, lvl + Math.sin(x * 0.06 + t * 1.4) * 2.2 + Math.sin(x * 0.11 - t * 2) * 1.2);
    c.lineTo(fx + fw, bottom + 2); c.closePath(); c.fill();
    // soft glow that breathes
    const glow = c.createRadialGradient(fx, fy + fh * 0.12, 4, fx, fy + fh * 0.12, fh * 0.5);
    glow.addColorStop(0, `rgba(127,242,255,${0.08 + b * 0.16})`); glow.addColorStop(1, 'rgba(127,242,255,0)');
    c.fillStyle = glow; c.fillRect(fx - fw, top, fw * 2, fh);
    c.restore();

    // Inhale: blue particles drift in from the cloud and the cup
    const gx = fx, gy = fy + fh * 0.1;
    for (let i = 0; i < N_IN; i++) {
      const o = i * 4;
      if (pin[o + 2] < 0) { if (inhale && !ctx.reduced) pin[o + 2] += dts * 0.6; continue; }
      pin[o + 2] += dts * 0.28;
      if (pin[o + 2] >= 1) { seedIn(i); continue; }
      const p = pin[o + 2], e = p * p * (3 - 2 * p);
      const sx = i % 2 === 0 ? cloudX : cupX, sy = i % 2 === 0 ? cloudY : cupY;
      const x = sx + (gx - sx) * e + Math.sin(p * 9 + pin[o + 3]) * 14 * (1 - p);
      const y = sy + (gy - sy) * e + Math.cos(p * 7 + pin[o + 3]) * 10 * (1 - p);
      c.fillStyle = `rgba(127,242,255,${Math.sin(p * Math.PI) * 0.7})`;
      c.beginPath(); c.arc(x, y, 1.6 + p, 0, 7); c.fill();
    }
    // Exhale: pale vapor rises from the head
    for (let i = 0; i < N_OUT; i++) {
      const o = i * 4;
      if (pout[o + 2] < 0) { if (!inhale && !ctx.reduced) pout[o + 2] += dts * 0.7; continue; }
      pout[o + 2] += dts * 0.3;
      if (pout[o + 2] >= 1) { seedOut(i); continue; }
      const p = pout[o + 2];
      const x = pout[o] + Math.sin(p * 6 + pout[o + 3]) * 12 * p + (pout[o + 3] - 3.14) * 8 * p;
      const y = pout[o + 1] - p * headR * 6;
      c.fillStyle = `rgba(219,233,242,${(1 - p) * 0.45})`;
      c.beginPath(); c.arc(x, y, 1.2 + p * 3, 0, 7); c.fill();
    }

    // The three lines, one per breath phase, fading in and out
    const a = Math.min(1, lineT / 1.6) * Math.max(0, Math.min(1, (4.6 - lineT) / 1.2));
    if (a > 0) {
      c.fillStyle = `rgba(244,249,251,${a * 0.85})`;
      c.font = `400 ${Math.round(Math.min(34, W * 0.045))}px "Iowan Old Style", "Palatino Linotype", Georgia, serif`;
      c.textAlign = 'center';
      c.fillText(LINES[lineI], fx, bottom + 52);
    }
  },
};
