// Fog. Layered banks drifting at different depths, a veil that thickens to the ground and swallows the horizon,
// a diffuse moon behind it all, near motes catching light, a dull puddle with a slow drip.
// Moving through it parts the banks; they close back in over a couple of seconds.

const MAXB = 30, MAXM = 120, MAXD = 6, MAXR = 3;
const BX = new Float32Array(MAXB), BY = new Float32Array(MAXB), BW = new Float32Array(MAXB), BH = new Float32Array(MAXB);
const BZ = new Float32Array(MAXB), BS = new Float32Array(MAXB), BA = new Float32Array(MAXB), BP = new Float32Array(MAXB);
const OX = new Float32Array(MAXB), OY = new Float32Array(MAXB), VX = new Float32Array(MAXB), VY = new Float32Array(MAXB);
const OP = new Float32Array(MAXB), BV = new Uint8Array(MAXB);   // OP: how open (cleared) a bank is, 1 = untouched
const MX = new Float32Array(MAXM), MY = new Float32Array(MAXM), MZ = new Float32Array(MAXM), MP = new Float32Array(MAXM);
const MVX = new Float32Array(MAXM), MVY = new Float32Array(MAXM);
const DX = new Float32Array(MAXD), DY = new Float32Array(MAXD), DVX = new Float32Array(MAXD), DVY = new Float32Array(MAXD), DK = new Float32Array(MAXD);
const RX = new Float32Array(MAXR), RY = new Float32Array(MAXR), RT = new Float32Array(MAXR).fill(-1);

let w = 0, h = 0, puddleY = 0, nb = 0, nm = 0;
let veil = null, glow = null, dot = null;
let blobs = [];
let dHead = 0, lastPX = -1e4, lastPY = -1e4, lastPT = 0;
let drip = 5000, rHead = 0, moonX = 0, moonY = 0;

function sprite(sw, sh) {
  const s = document.createElement('canvas'); s.width = sw; s.height = sh;
  return s;
}

function blob(lumps) {
  const s = sprite(256, 128), g = s.getContext('2d');
  for (let i = 0; i < lumps; i++) {
    const cx = 256 * (0.3 + Math.random() * 0.4), cy = 128 * (0.45 + Math.random() * 0.1);
    const r = 40 + Math.random() * 36, ky = 0.5 + Math.random() * 0.2;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, 'rgba(190,208,220,0.7)');
    gr.addColorStop(0.5, 'rgba(190,208,220,0.3)');
    gr.addColorStop(1, 'rgba(190,208,220,0)');
    g.save(); g.translate(cx, cy); g.scale(1, ky);
    g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  return s;
}

function layout(W, H, pY) {
  w = W; h = H; puddleY = pY;
  if (!dot) {
    dot = sprite(32, 32);
    const g = dot.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(225,238,248,1)'); gr.addColorStop(0.35, 'rgba(225,238,248,0.45)'); gr.addColorStop(1, 'rgba(225,238,248,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    glow = sprite(256, 256);
    const q = glow.getContext('2d'), gl = q.createRadialGradient(128, 128, 0, 128, 128, 128);
    gl.addColorStop(0, 'rgba(235,242,250,0.95)'); gl.addColorStop(0.1, 'rgba(215,230,245,0.5)');
    gl.addColorStop(0.35, 'rgba(170,200,225,0.14)'); gl.addColorStop(1, 'rgba(150,185,215,0)');
    q.fillStyle = gl; q.fillRect(0, 0, 256, 256);
    blobs = [blob(3), blob(4), blob(5), blob(3)];
  }
  // veil: thin up high, dense at the ground; the horizon and the puddle both dissolve into it
  veil = sprite(4, Math.max(2, Math.round(H)));
  const v = veil.getContext('2d'), p = pY / H, vg = v.createLinearGradient(0, 0, 0, veil.height);
  vg.addColorStop(0, 'rgba(120,145,165,0.05)');
  vg.addColorStop(p * 0.5, 'rgba(120,145,165,0.15)');
  vg.addColorStop(Math.max(0.01, p - 0.14), 'rgba(122,147,167,0.34)');
  vg.addColorStop(p, 'rgba(125,148,166,0.62)');
  vg.addColorStop(1, 'rgba(105,128,146,0.7)');
  v.fillStyle = vg; v.fillRect(0, 0, 4, veil.height);

  moonX = W * 0.72; moonY = pY * 0.3;
  nb = Math.min(MAXB, Math.round(11 + W / 100));
  for (let i = 0; i < nb; i++) {
    const z = (i + Math.random()) / nb;                 // 0 far .. 1 near, sorted so draw order is back to front
    BZ[i] = z;
    BW[i] = W * (0.4 + 0.55 * z) * (0.75 + Math.random() * 0.5) + 160;
    BH[i] = BW[i] * (0.22 + 0.12 * z);
    let y = pY * (0.28 + 0.78 * Math.pow(Math.random(), 0.6));
    if (z > 0.6) y += (H - pY) * 0.5 * z;
    BY[i] = Math.min(y, H * 0.97);
    BX[i] = Math.random() * (W + BW[i]) - BW[i] * 0.5;
    BS[i] = (0.003 + 0.016 * z) * (0.8 + Math.random() * 0.4) * (Math.random() < 0.18 ? -0.5 : 1);
    BA[i] = (0.12 + 0.2 * z) * (0.55 + 0.45 * BY[i] / H);
    BP[i] = Math.random() * 6.283;
    BV[i] = (Math.random() * blobs.length) | 0;
    OX[i] = OY[i] = VX[i] = VY[i] = 0; OP[i] = 1;
  }
  nm = Math.min(MAXM, Math.round(W / 8));
  for (let i = 0; i < nm; i++) {
    MX[i] = Math.random() * W; MY[i] = Math.random() * H;
    MZ[i] = 0.25 + Math.random() * 0.75; MP[i] = Math.random() * 6.283;
    MVX[i] = MVY[i] = 0;
  }
  RT.fill(-1);
}

function pointer(x, y, down) {
  const dx = x - lastPX, dy = y - lastPY, d = Math.sqrt(dx * dx + dy * dy);
  if (!down && d < 7) return;
  const now = performance.now(), dtp = Math.max(8, now - lastPT);
  const sp = Math.min(1.5, d / dtp);                    // px per ms
  const k = down ? 1.6 : Math.min(1.2, 0.35 + sp * 0.9);
  DX[dHead] = x; DY[dHead] = y;
  DVX[dHead] = d > 1e3 ? 0 : Math.max(-1.5, Math.min(1.5, dx / dtp));
  DVY[dHead] = d > 1e3 ? 0 : Math.max(-1.5, Math.min(1.5, dy / dtp));
  DK[dHead] = k;
  dHead = (dHead + 1) % MAXD;
  lastPX = x; lastPY = y; lastPT = now;
}

function draw(c, dt, t, b, amount) {
  if (!veil || amount <= 0.001) return;
  const slow = fog.reduced ? 0.15 : 1;
  const a = amount;
  const ga = c.globalAlpha, gc = c.globalCompositeOperation, lc = c.lineCap;
  c.globalCompositeOperation = 'source-over';
  const wob = 0.5 + 0.5 * b;

  // moon behind the fog: a diffuse halo, breathing
  const gs = Math.min(w, h * 1.2) * (0.85 + 0.06 * b);
  c.globalAlpha = a * (0.4 + 0.1 * b);
  c.drawImage(glow, moonX - gs / 2, moonY - gs / 2, gs, gs);
  c.globalAlpha = a * 0.5;
  c.drawImage(glow, moonX - gs * 0.1, moonY - gs * 0.1, gs * 0.2, gs * 0.2);
  // its dull smear on the puddle
  c.globalAlpha = a * 0.16;
  c.drawImage(glow, moonX - gs * 0.2, puddleY + (h - puddleY) * 0.2, gs * 0.4, (h - puddleY) * 0.55);

  // veil, thicker on the exhale-less inhale a touch
  c.globalAlpha = a * (0.88 + 0.12 * b);
  c.drawImage(veil, 0, 0, w, h);

  // pointer disturbances fade
  const dk = Math.exp(-dt / 1100);
  for (let k = 0; k < MAXD; k++) DK[k] *= dk;

  // banks, back to front
  const relax = Math.min(1, dt * 0.0005), damp = Math.exp(-dt * 0.0025);
  for (let i = 0; i < nb; i++) {
    const bw = BW[i], bh = BH[i];
    BX[i] += BS[i] * dt * slow;
    if (BX[i] > w + bw * 0.5) BX[i] = -bw * 0.5; else if (BX[i] < -bw * 0.5) BX[i] = w + bw * 0.5;
    const cx = BX[i] + OX[i], cy = BY[i] + OY[i] + Math.sin(t * 0.00006 + BP[i]) * bh * 0.14 * slow;
    let px = 0, py = 0, cl = 0;
    for (let k = 0; k < MAXD; k++) {
      if (DK[k] < 0.02) continue;
      const ex = cx - DX[k], ey = (cy - DY[k]) * 1.5, d = Math.sqrt(ex * ex + ey * ey) + 1;
      const R = bw * 0.3 + 130;
      if (d >= R) continue;
      const f = (1 - d / R) * (1 - d / R) * DK[k];
      px += (ex / d) * f * 0.0007 + (-ey / d) * f * 0.00025 + DVX[k] * f * 0.00025;
      py += (ey / d) * f * 0.0004 + (ex / d) * f * 0.0001 + DVY[k] * f * 0.00025;
      cl += f;
    }
    VX[i] = (VX[i] + px * dt) * damp; VY[i] = (VY[i] + py * dt) * damp;
    OX[i] += VX[i] * dt; OY[i] += VY[i] * dt;
    OX[i] -= OX[i] * relax; OY[i] -= OY[i] * relax;      // closes back in slowly
    if (OX[i] > 280) OX[i] = 280; else if (OX[i] < -280) OX[i] = -280;
    if (OY[i] > 110) OY[i] = 110; else if (OY[i] < -110) OY[i] = -110;
    OP[i] += (1 - OP[i]) * Math.min(1, dt * 0.0004);
    OP[i] -= cl * dt * 0.004; if (OP[i] < 0.2) OP[i] = 0.2;
    const al = BA[i] * wob * OP[i] * a * 1.15;
    c.globalAlpha = al > 1 ? 1 : al;
    c.drawImage(blobs[BV[i]], cx - bw / 2, cy - bh / 2, bw, bh);
  }

  // motes: near droplets catching light, brighter toward the moon
  const mr = Math.min(w, h) * 0.55;
  const dm = Math.exp(-dt * 0.002);
  for (let i = 0; i < nm; i++) {
    const z = MZ[i];
    let vx = MVX[i], vy = MVY[i];
    for (let k = 0; k < MAXD; k++) {
      if (DK[k] < 0.05) continue;
      const ex = MX[i] - DX[k], ey = MY[i] - DY[k], d2 = ex * ex + ey * ey;
      if (d2 > 14400) continue;
      const f = (1 - Math.sqrt(d2) / 120) * DK[k] * dt * 0.0003;
      vx += ex * f + DVX[k] * f * 40; vy += ey * f + DVY[k] * f * 40;
    }
    vx *= dm; vy *= dm;
    MVX[i] = vx; MVY[i] = vy;
    MX[i] += (0.006 * z + Math.sin(t * 0.0003 + MP[i]) * 0.004) * dt * slow + vx * dt;
    MY[i] += (Math.cos(t * 0.00025 + MP[i] * 1.7) * 0.004 - 0.001) * dt * slow + vy * dt;
    if (MX[i] > w + 10) MX[i] = -10; else if (MX[i] < -10) MX[i] = w + 10;
    if (MY[i] > h + 10) MY[i] = -10; else if (MY[i] < -10) MY[i] = h + 10;
    const tw = 0.5 + 0.5 * Math.sin(t * 0.0007 * (0.6 + z) * (fog.reduced ? 0.2 : 1) + MP[i]);
    const ex = MX[i] - moonX, ey = MY[i] - moonY, dd = Math.sqrt(ex * ex + ey * ey);
    const lit = 1 + 1.6 * Math.max(0, 1 - dd / mr);
    const al = (0.08 + 0.3 * tw) * z * lit * a;
    const s = 3 + 10 * z * z;
    c.globalAlpha = al > 0.8 ? 0.8 : al;
    c.drawImage(dot, MX[i] - s / 2, MY[i] - s / 2, s, s);
  }

  // an occasional slow drip ring on the dull puddle
  drip -= dt;
  if (drip <= 0) {
    drip = 5000 + Math.random() * 5000;
    RX[rHead] = w * (0.15 + Math.random() * 0.7); RY[rHead] = puddleY + (h - puddleY) * (0.25 + Math.random() * 0.6); RT[rHead] = 0;
    rHead = (rHead + 1) % MAXR;
  }
  c.lineCap = 'round'; c.lineWidth = 1;
  for (let k = 0; k < MAXR; k++) {
    if (RT[k] < 0) continue;
    RT[k] += dt * slow;
    const age = RT[k] / 3200;
    if (age >= 1) { RT[k] = -1; continue; }
    const e = 1 - (1 - age) * (1 - age), R = 3 + 30 * e;
    c.globalAlpha = a * 0.3 * (1 - age) * (1 - age);
    c.strokeStyle = 'rgb(175,195,208)';
    c.beginPath(); c.ellipse(RX[k], RY[k], R, R * 0.26, 0, 0, 6.2832); c.stroke();
  }

  c.globalAlpha = ga; c.globalCompositeOperation = gc; c.lineCap = lc;
}

const fog = { reduced: false, layout, draw, pointer };
export default fog;
