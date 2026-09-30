// 06 — Cup. A glass fills. You drink. Then the camera pulls back: kitchen, house,
// neighborhood, watershed, continent, Earth. One scale per stage; units = glass heights.

const STAGES = ['cup', 'kitchen', 'house', 'neighborhood', 'watershed', 'continent', 'Earth'];
const RATIO = 3.5;                          // each stage is 3.5x the size of the last

let el, ctx, c, w, h;
let level = 0, levelTarget = 0, started = false, poured = false;
let zoom = 0, zoomTarget = 0, drinking = 0, sipTimer = 0;
let stageEl, drinkBtn, backBtn, shownStage = -1, time = 0;
const bubbles = new Array(7);
for (let i = 0; i < 7; i++) bubbles[i] = { x: 0, y: 1, s: 0.3 + Math.random() * 0.7, r: 0.008 + Math.random() * 0.01 };

// ---------- stage art (all in unit space: glass is 1 unit tall, centered on origin) ----------
function drawGlass(a, S, breath) {
  const gw = 0.56, gh = 1, r = 0.06;
  const lv = level * (1 + (breath.value - 0.5) * 0.02);
  c.globalAlpha = a;
  // table line
  c.strokeStyle = 'rgba(217,199,163,0.45)'; c.lineWidth = 0.012;
  c.beginPath(); c.moveTo(-2.2, 0.5); c.lineTo(2.2, 0.5); c.stroke();
  // water
  if (lv > 0.005) {
    const top = 0.5 - lv * 0.94;
    const g = c.createLinearGradient(0, top, 0, 0.5);
    g.addColorStop(0, 'rgba(127,242,255,0.55)'); g.addColorStop(1, 'rgba(47,184,198,0.75)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-gw / 2 + 0.03, top - 0.02);
    c.quadraticCurveTo(0, top + 0.03, gw / 2 - 0.03, top - 0.02);
    c.lineTo(gw / 2 - 0.03, 0.47); c.lineTo(-gw / 2 + 0.03, 0.47); c.closePath(); c.fill();
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      if (b.y < top + 0.02) continue;
      c.fillStyle = 'rgba(244,249,251,0.5)';
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
    }
  }
  // glass outline + refraction highlights
  c.strokeStyle = 'rgba(219,233,242,0.75)'; c.lineWidth = 0.014;
  c.beginPath();
  c.moveTo(-gw / 2, -gh / 2); c.lineTo(-gw / 2, 0.5 - r); c.quadraticCurveTo(-gw / 2, 0.5, -gw / 2 + r, 0.5);
  c.lineTo(gw / 2 - r, 0.5); c.quadraticCurveTo(gw / 2, 0.5, gw / 2, 0.5 - r); c.lineTo(gw / 2, -gh / 2); c.stroke();
  c.strokeStyle = 'rgba(244,249,251,0.5)'; c.lineWidth = 0.02;
  c.beginPath(); c.moveTo(-gw / 2 + 0.06, -0.38); c.lineTo(-gw / 2 + 0.06, 0.3); c.stroke();
  c.strokeStyle = 'rgba(244,249,251,0.25)'; c.lineWidth = 0.01;
  c.beginPath(); c.moveTo(gw / 2 - 0.05, -0.3); c.lineTo(gw / 2 - 0.05, 0.1); c.stroke();
}
function line(a, S, k) { c.globalAlpha = a; c.strokeStyle = 'rgba(219,233,242,0.6)'; c.lineWidth = S * (k || 0.012); c.lineJoin = 'round'; }
function drawKitchen(a, S) {
  line(a, S);
  c.beginPath(); c.moveTo(-S * 0.8, S * 0.15); c.lineTo(S * 0.8, S * 0.15); c.lineTo(S * 0.8, S * 0.55); c.lineTo(-S * 0.8, S * 0.55); c.closePath(); c.stroke();
  c.beginPath(); c.rect(-S * 0.55, -S * 0.5, S * 0.5, S * 0.42); c.moveTo(-S * 0.3, -S * 0.5); c.lineTo(-S * 0.3, -S * 0.08); c.moveTo(-S * 0.55, -S * 0.29); c.lineTo(-S * 0.05, -S * 0.29); c.stroke();
  c.beginPath(); c.moveTo(S * 0.4, S * 0.15); c.lineTo(S * 0.4, -S * 0.1); c.quadraticCurveTo(S * 0.4, -S * 0.2, S * 0.3, -S * 0.2); c.stroke();
}
function drawHouse(a, S) {
  line(a, S);
  const g = S * 0.42;
  c.beginPath(); c.moveTo(-S, g); c.lineTo(S, g); c.stroke();
  c.beginPath(); c.moveTo(-S * 0.45, g); c.lineTo(-S * 0.45, -S * 0.1); c.lineTo(0, -S * 0.45); c.lineTo(S * 0.45, -S * 0.1); c.lineTo(S * 0.45, g); c.stroke();
  c.beginPath(); c.rect(S * 0.12, g - S * 0.28, S * 0.14, S * 0.28); c.rect(-S * 0.32, -S * 0.02, S * 0.16, S * 0.14); c.stroke();
  c.beginPath(); c.moveTo(S * 0.2, -S * 0.27); c.lineTo(S * 0.2, -S * 0.42); c.lineTo(S * 0.3, -S * 0.42); c.lineTo(S * 0.3, -S * 0.2); c.stroke();
}
function drawNeighborhood(a, S) {
  line(a, S, 0.008);
  const g = S * 0.42;
  c.beginPath(); c.moveTo(-S * 1.2, g); c.lineTo(S * 1.2, g); c.stroke();
  for (let row = 0; row < 3; row++) {
    const y = g - row * S * 0.28, hh = S * (0.16 - row * 0.03), ww = S * 0.14;
    c.globalAlpha = a * (1 - row * 0.25);
    c.beginPath();
    for (let i = -6; i <= 6; i++) {
      const x = i * S * 0.19 + (row % 2) * S * 0.09;
      c.moveTo(x - ww / 2, y); c.lineTo(x - ww / 2, y - hh * 0.6); c.lineTo(x, y - hh); c.lineTo(x + ww / 2, y - hh * 0.6); c.lineTo(x + ww / 2, y);
    }
    c.stroke();
  }
}
function drawWatershed(a, S) {
  line(a, S, 0.006);
  for (let i = 0; i < 4; i++) {
    const y = -S * 0.35 + i * S * 0.12, rr = S * (0.5 + i * 0.12);
    c.beginPath(); c.arc(-S * 0.3 + i * S * 0.3, y + rr, rr, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  }
  c.strokeStyle = 'rgba(127,242,255,0.7)'; c.lineWidth = S * 0.01;
  c.beginPath(); c.moveTo(-S * 0.9, -S * 0.25);
  c.quadraticCurveTo(-S * 0.4, S * 0.05, 0, 0); c.quadraticCurveTo(S * 0.4, -S * 0.05, S * 0.9, S * 0.35); c.stroke();
  c.lineWidth = S * 0.006;
  c.beginPath(); c.moveTo(-S * 0.5, -S * 0.5); c.quadraticCurveTo(-S * 0.4, -S * 0.2, -S * 0.3, -S * 0.02);
  c.moveTo(S * 0.2, -S * 0.45); c.quadraticCurveTo(S * 0.25, -S * 0.2, S * 0.1, S * 0.01);
  c.moveTo(-S * 0.1, S * 0.4); c.quadraticCurveTo(-S * 0.05, S * 0.2, 0, 0); c.stroke();
}
function drawContinent(a, S) {
  c.globalAlpha = a;
  c.fillStyle = 'rgba(63,143,122,0.35)'; c.strokeStyle = 'rgba(219,233,242,0.6)'; c.lineWidth = S * 0.006;
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const r = S * (0.42 + Math.sin(t * 3) * 0.06 + Math.sin(t * 7 + 1) * 0.035 + Math.cos(t * 2) * 0.05);
    const x = Math.cos(t) * r * 1.15, y = Math.sin(t) * r * 0.85;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath(); c.fill(); c.stroke();
}
function drawEarth(a, S, breath) {
  c.globalAlpha = a;
  const R = S * 0.44;
  const g = c.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#5fd3c8'); g.addColorStop(0.55, '#1f6f8f'); g.addColorStop(1, '#0b3352');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(63,143,122,0.55)';
  c.beginPath(); c.ellipse(-R * 0.3, -R * 0.2, R * 0.28, R * 0.42, 0.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(R * 0.35, R * 0.25, R * 0.2, R * 0.3, -0.4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = `rgba(127,242,255,${0.25 + breath.value * 0.35})`; c.lineWidth = S * (0.012 + breath.value * 0.008);
  c.beginPath(); c.arc(0, 0, R * (1.06 + breath.value * 0.015), 0, Math.PI * 2); c.stroke();
}
const ART = [drawGlass, drawKitchen, drawHouse, drawNeighborhood, drawWatershed, drawContinent, drawEarth];

function draw(breath) {
  const k = zoom / 6;
  // warm-dark kitchen glow fading to deep space
  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, k < 0.5 ? `rgba(${28 - k * 40 | 0},${20 - k * 20 | 0},${14 + k * 30 | 0},1)` : '#04111f');
  bg.addColorStop(1, '#04111f');
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  if (k > 0.75) {
    c.fillStyle = 'rgba(244,249,251,0.6)';
    for (let i = 0; i < 40; i++) c.fillRect((i * 97.3) % w, (i * 53.7 + 11) % h, 1.2, 1.2);
  }
  const cx = w > 820 ? w * 0.34 : w * 0.5, cy = h * 0.45;
  const cam = (h * 0.42) / Math.pow(RATIO, zoom);
  c.save(); c.translate(cx, cy); c.scale(cam, cam);
  for (let i = 0; i < ART.length; i++) {
    const a = Math.max(0, Math.min(1, 1.2 - Math.abs(zoom - i) * 1.2));
    if (a <= 0) continue;
    ART[i](a, Math.pow(RATIO, i), breath);
  }
  c.restore(); c.globalAlpha = 1;
}

function setStage(i) {
  if (i === shownStage) return;
  shownStage = i; stageEl.textContent = STAGES[i];
  stageEl.classList.remove('pop'); void stageEl.offsetWidth; stageEl.classList.add('pop');
}

export default {
  mount(section, context) {
    el = section; ctx = context; c = ctx.c2d; w = ctx.w; h = ctx.h;
    el.style.background = '#1c140e';
    el.insertAdjacentHTML('beforeend', `
      <style>
        #cup .stage-word { font-family: var(--serif); font-size: clamp(2rem, 5vw, 3rem); color: var(--cyan); margin: 14px 0 0; min-height: 1.2em; letter-spacing: 0.02em; }
        #cup .stage-word.pop { animation: rise 0.6s ease both; }
        #cup .stage-label { font-size: 0.72rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); margin-top: 18px; }
        #cup .controls .ghost { margin-top: 12px; }
        #cup .btn:disabled, #cup .ghost:disabled { opacity: 0.4; cursor: default; }
      </style>
      <div class="chapter-body right">
        <p class="chapter-kicker">06 — Cup</p>
        <h2>The water in your glass belongs to a bigger story.</h2>
        <p class="lede">Have a drink. Then step back, and back, and back.</p>
        <div class="controls">
          <button class="btn drink">Drink</button>
          <button class="ghost back" disabled>Back to the cup</button>
        </div>
        <p class="stage-label">you are looking at</p>
        <p class="stage-word">cup</p>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: the water in your cup came from a river, or from under the ground.</p>
          <div class="l2"><span class="term">Discover</span><p>It waited in a reservoir, went through a treatment plant, and traveled in pipes under the street to your tap. After you, it goes down the drain, gets cleaned again, and returns to a river.</p></div>
          <div class="l3"><span class="term">Municipal water</span><p>Typical treatment: coagulation, sedimentation, filtration, disinfection. The average person in the US uses about 300 liters a day at home. Most of the world's freshwater is locked in ice; less than 1% is easily reachable.</p></div>
          <button class="depth-more">Discover</button>
        </div>
      </div>`);
    stageEl = el.querySelector('.stage-word');
    drinkBtn = el.querySelector('.drink');
    backBtn = el.querySelector('.back');
    drinkBtn.addEventListener('click', () => {
      if (drinking || zoomTarget > 0 || level < 0.2) return;
      drinking = 2; sipTimer = 0; drinkBtn.disabled = true;
    });
    backBtn.addEventListener('click', () => { zoomTarget = 0; backBtn.disabled = true; ctx.audio.plip(0.7); });
  },
  tick(dt, breath) {
    time += dt;
    if (!started) { started = true; levelTarget = 0.82; }
    if (!poured && levelTarget > 0) { poured = true; ctx.audio.pour(1.5); }
    // sips: two quick drops, then the pull-back begins
    if (drinking > 0) {
      sipTimer += dt;
      if (sipTimer > 650) { sipTimer = 0; drinking--; levelTarget -= 0.3; ctx.audio.plip(1.3 - drinking * 0.15); if (drinking === 0) { zoomTarget = 6; backBtn.disabled = false; } }
    }
    const fillRate = ctx.reduced ? 0.0002 : level < levelTarget ? 0.00012 : 0.0008;
    level += Math.sign(levelTarget - level) * Math.min(Math.abs(levelTarget - level), fillRate * dt);
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.y -= b.s * 0.00035 * dt;
      if (b.y < 0.5 - level * 0.94 || level < 0.05) { b.y = 0.46; b.x = (Math.random() - 0.5) * 0.4; }
    }
    const zs = (ctx.reduced ? 0.0002 : 0.00038) * (zoomTarget < zoom ? 2.2 : 1);
    if (zoom !== zoomTarget) {
      zoom += Math.sign(zoomTarget - zoom) * Math.min(Math.abs(zoomTarget - zoom), zs * dt);
      if (zoom === 0 && zoomTarget === 0) { levelTarget = 0.82; drinkBtn.disabled = false; }
    }
    setStage(Math.round(zoom));
    draw(breath);
  },
  resize(context) { w = context.w; h = context.h; },
};
