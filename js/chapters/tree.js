// 05 — Tree. Water climbs from root tips to leaves with no pump at all.
// The branch drawer is recursive; its segments double as the path graph particles follow.

const MAX = 220;
const STAGES = ['roots', 'trunk', 'branches', 'leaves', 'air', 'transpiration'];

let el, ctx, c, w, h;
let stat = null;                // offscreen trunk + branches + roots
let nodes = [], rootTips = [], leafTips = [], trunk = null;
let treeX = 0, baseY = 0, soilY = 0, canopyCx = 0, canopyCy = 0;
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

let trickleAcc = 0, burstLeft = 0, burstAcc = 0, time = 0;
let stageEl = null, shownStage = -1, burstDone = 0;

// node: { x1,y1,x2,y2, len, depth, parent, children[], root:boolean }
const P = new Array(MAX);
for (let i = 0; i < MAX; i++) P[i] = { alive: false, node: null, t: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, stage: 0, burst: false, a: 1 };

function addNode(x1, y1, x2, y2, depth, parent, root) {
  const n = { x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1), depth, parent, children: [], root };
  nodes.push(n);
  if (parent) parent.children.push(n);
  return n;
}
function grow(parent, angle, len, depth, maxDepth) {
  const x2 = parent.x2 + Math.cos(angle) * len, y2 = parent.y2 + Math.sin(angle) * len;
  const n = addNode(parent.x2, parent.y2, x2, y2, depth, parent, false);
  if (depth >= maxDepth) { leafTips.push(n); return; }
  const k = depth === 1 ? 3 : 2 + (rnd() < 0.5 ? 1 : 0);
  for (let i = 0; i < k; i++) {
    const spread = 0.55 + rnd() * 0.35;
    const a = angle + (i - (k - 1) / 2) * spread + (rnd() - 0.5) * 0.25;
    grow(n, a, len * (0.62 + rnd() * 0.14), depth + 1, maxDepth);
  }
}
function growRoot(parent, angle, len, depth) {
  const x2 = parent.x2 + Math.cos(angle) * len, y2 = Math.min(h - 8, parent.y2 + Math.sin(angle) * len);
  const n = addNode(parent.x2, parent.y2, x2, y2, depth, parent, true);
  if (depth >= 3) { rootTips.push(n); return; }
  const k = 2;
  for (let i = 0; i < k; i++) growRoot(n, angle + (i - 0.5) * (0.7 + rnd() * 0.4), len * 0.65, depth + 1);
}

function build() {
  nodes = []; rootTips = []; leafTips = []; seed = 11;
  treeX = w > 820 ? w * 0.68 : w * 0.5;
  soilY = h * 0.8; baseY = soilY;
  const trunkLen = h * 0.24;
  trunk = addNode(treeX, baseY, treeX, baseY - trunkLen, 0, null, false);
  for (let i = 0; i < 3; i++) grow(trunk, -Math.PI / 2 + (i - 1) * 0.55 + (rnd() - 0.5) * 0.2, trunkLen * 0.55, 1, 4);
  // roots: a short anchor node then two spreading levels
  const anchor = addNode(treeX, baseY, treeX, baseY + 4, 0, null, true);
  for (let i = 0; i < 3; i++) growRoot(anchor, Math.PI / 2 + (i - 1) * 0.8, h * 0.06, 1);
  let sx = 0, sy = 0;
  for (const n of leafTips) { sx += n.x2; sy += n.y2; }
  canopyCx = sx / leafTips.length; canopyCy = sy / leafTips.length;
  // static layer
  stat = document.createElement('canvas');
  stat.width = Math.round(w * ctx.dpr); stat.height = Math.round(h * ctx.dpr);
  const s = stat.getContext('2d');
  s.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
  s.lineCap = 'round';
  for (const n of nodes) {
    s.strokeStyle = n.root ? '#3a2a1e' : '#2a1c12';
    s.lineWidth = n.root ? Math.max(1, 7 - n.depth * 2) : Math.max(1.2, 16 - n.depth * 3.6);
    s.beginPath(); s.moveTo(n.x1, n.y1); s.lineTo(n.x2, n.y2); s.stroke();
  }
}

function spawn(burst) {
  for (let i = 0; i < MAX; i++) {
    const p = P[i];
    if (p.alive) continue;
    const tip = rootTips[(Math.random() * rootTips.length) | 0];
    p.alive = true; p.node = tip; p.t = 1; p.stage = 0; p.age = 0; p.burst = burst; p.a = 1;
    p.x = tip.x2; p.y = tip.y2;
    return;
  }
}

function advance(p, dist) {
  // roots: t runs 1 -> 0 (tip toward base); above ground: 0 -> 1 (base toward tip)
  let n = p.node;
  if (n.root) {
    p.t -= dist / n.len;
    while (p.t < 0 && n.root) {
      const spill = -p.t * n.len;
      if (n.parent) { n = n.parent; p.t = 1 - spill / n.len; }
      else { n = trunk; p.t = spill / n.len; p.stage = 1; }
    }
  } else {
    p.t += dist / n.len;
    while (p.t > 1) {
      const spill = (p.t - 1) * n.len;
      if (n.children.length === 0) { p.stage = 4; p.t = 1; p.vx = (Math.random() - 0.5) * 0.02; p.vy = -0.015 - Math.random() * 0.015; p.age = 0; break; }
      n = n.children[(Math.random() * n.children.length) | 0];
      p.t = spill / n.len;
      p.stage = n.children.length === 0 ? 3 : 2;
    }
  }
  p.node = n;
  p.x = n.x1 + (n.x2 - n.x1) * p.t; p.y = n.y1 + (n.y2 - n.y1) * p.t;
}

function step(dt, breath) {
  const flow = ctx.reduced ? 0.09 : 0.1 + breath.value * 0.1;
  const release = 0.35 + (1 - breath.value) * 0.6;   // leaves let go faster on exhale
  let maxStage = -1, anyBurst = false;
  for (let i = 0; i < MAX; i++) {
    const p = P[i];
    if (!p.alive) continue;
    p.age += dt;
    if (p.stage < 4) {
      const sp = p.stage === 3 ? flow * release : flow;
      advance(p, sp * dt);
    } else {
      p.x += p.vx * dt + Math.sin(p.age * 0.003 + i) * 0.01 * dt; p.y += p.vy * dt;
      p.a = Math.max(0, 1 - p.age / (ctx.reduced ? 4000 : 2800 - (1 - breath.value) * 800));
      if (p.a <= 0) { p.alive = false; if (p.burst) burstDone++; continue; }
    }
    if (p.burst) { anyBurst = true; if (p.stage > maxStage) maxStage = p.stage; }
  }
  let stage = -1;
  if (anyBurst) stage = maxStage; else if (burstDone > 0) stage = 5;
  if (stage !== shownStage) { shownStage = stage; stageEl.textContent = stage < 0 ? 'waiting for water' : STAGES[stage]; }
}

function draw(breath) {
  const t = time / 1000;
  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#071a2e'); bg.addColorStop(0.75, '#153a4a'); bg.addColorStop(1, '#1b3f4f');
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  // soil band
  c.fillStyle = '#2e2117'; c.fillRect(0, soilY, w, h - soilY);
  c.fillStyle = '#6b4f3a'; c.fillRect(0, soilY, w, 3);
  c.drawImage(stat, 0, 0, w, h);
  // canopy: clustered soft circles, tighter on inhale, swaying on exhale
  const tight = 1 - breath.value * 0.14;
  const sway = ctx.reduced ? 0 : Math.sin(t * 0.9) * (1 - breath.value) * 5;
  c.save(); c.translate(sway, 0);
  for (let i = 0; i < leafTips.length; i++) {
    const n = leafTips[i];
    const x = canopyCx + (n.x2 - canopyCx) * tight, y = canopyCy + (n.y2 - canopyCy) * tight;
    const r = 15 + (i % 3) * 6;
    c.fillStyle = i % 2 ? 'rgba(63,143,122,0.55)' : 'rgba(92,170,120,0.45)';
    c.beginPath(); c.arc(x, y, r * tight, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(127,242,200,0.12)';
    c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.5 * tight, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  // particles
  for (let i = 0; i < MAX; i++) {
    const p = P[i];
    if (!p.alive) continue;
    if (p.stage < 3) { c.fillStyle = '#7ff2ff'; c.beginPath(); c.arc(p.x, p.y, 1.8, 0, Math.PI * 2); c.fill(); }
    else if (p.stage === 3) { c.fillStyle = 'rgba(200,250,255,0.9)'; c.beginPath(); c.arc(p.x + sway, p.y, 2.2, 0, Math.PI * 2); c.fill(); }
    else { c.fillStyle = `rgba(219,233,242,${p.a * 0.55})`; c.beginPath(); c.arc(p.x + sway, p.y, 2 + p.age / 700, 0, Math.PI * 2); c.fill(); }
  }
}

function burst() { burstLeft += 40; burstDone = 0; ctx.audio.plip(0.9); }

export default {
  mount(section, context) {
    el = section; ctx = context; c = ctx.c2d; w = ctx.w; h = ctx.h;
    build();
    el.style.background = '#071a2e';
    el.insertAdjacentHTML('beforeend', `
      <style>
        #tree .chapter-canvas { touch-action: manipulation; cursor: pointer; }
        #tree .stage-wrap { margin-top: 18px; font-size: 0.72rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--muted); }
        #tree .stage { display: block; font-family: var(--serif); font-size: 1.6rem; letter-spacing: 0.04em; text-transform: none; color: var(--cyan); margin-top: 4px; min-height: 1.4em; }
      </style>
      <div class="chapter-body left">
        <p class="chapter-kicker">05 — Tree</p>
        <h2>Water climbs a tree without a pump.</h2>
        <p class="lede">Tap the tree and follow the water. It goes in at the bottom and leaves at the top.</p>
        <div class="controls"><button class="btn send-up">Send water up</button></div>
        <div class="stage-wrap">the water is in<span class="stage">waiting for water</span></div>
        <div class="depth" data-level="1">
          <p class="l1">LOOK: water goes in at the roots and out at the leaves.</p>
          <div class="l2"><span class="term">Discover</span><p>Leaves have tiny mouths called stomata that let water out as vapor. As each bit leaves, it pulls the next bit up behind it, like a chain being drawn through the tree. A big oak can move hundreds of liters a day.</p></div>
          <div class="l3"><span class="term">Transpiration</span><p>Cohesion-tension theory: water molecules stick to each other (cohesion) and to the walls of the xylem (adhesion). Evaporation at the leaf creates negative pressure that pulls the whole unbroken column upward from the roots. About 10% of the moisture in the air comes from plants.</p></div>
          <button class="depth-more">Discover</button>
        </div>
      </div>`);
    stageEl = el.querySelector('.stage');
    el.querySelector('.send-up').addEventListener('click', burst);
    ctx.canvas.addEventListener('pointerdown', burst);
  },
  tick(dt, breath) {
    time += dt;
    trickleAcc += dt;
    const gap = ctx.reduced ? 700 : 260;
    while (trickleAcc > gap) { trickleAcc -= gap; spawn(false); }
    if (burstLeft > 0) {
      burstAcc += dt;
      while (burstAcc > 22 && burstLeft > 0) { burstAcc -= 22; burstLeft--; spawn(true); }
    }
    step(dt, breath);
    draw(breath);
  },
  resize(context) {
    w = context.w; h = context.h;
    for (let i = 0; i < MAX; i++) P[i].alive = false;
    build();
  },
};
