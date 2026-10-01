// Snow. Three depth layers of slow, fluttering flakes over the rain scene.
// Flakes melt into the puddle at first; as the cold sets in a drifted bank builds along the puddle line
// and the edges skin over with ice. When the snow thins, the bank melts back.
// Interface: layout(w, h, puddleY), draw(c, dt, t, b, amount), pointer(x, y, down), reduced, residual.

const TAU = Math.PI * 2;
const NF = 560, NB = 48, NR = 40, MAXC = 700, ROWS = 12, M = 30, RL = 900;

const X = new Float32Array(NF), Y = new Float32Array(NF);
const VX = new Float32Array(NF), VY = new Float32Array(NF);   // stir velocities, decay back to zero
const PH = new Float32Array(NF), FQ = new Float32Array(NF), AM = new Float32Array(NF);
const SZ = new Float32Array(NF), SP = new Float32Array(NF), TH = new Float32Array(NF);
const AL = new Float32Array(NF), AGE = new Float32Array(NF), LYR = new Float32Array(NF);
const LAY = new Uint8Array(NF), KD = new Uint8Array(NF);
const WM = [0.55, 1, 1.7], LF = [0.45, 0.8, 1.2];

const RX = new Float32Array(NR), RY = new Float32Array(NR), RT = new Float32Array(NR).fill(1e9), RS = new Float32Array(NR);
let ringHead = 0;
const BX = new Float32Array(NB), BY = new Float32Array(NB), BVX = new Float32Array(NB), BVY = new Float32Array(NB);
const BL = new Float32Array(NB), BS = new Float32Array(NB);
let burstHead = 0, burstLive = 0;

const BANK = new Float32Array(MAXC), CAP = new Float32Array(MAXC), NZ = new Float32Array(MAXC);
const PL = new Float32Array(ROWS), PR = new Float32Array(ROWS);
const SOFT = [], CRY = [];

let w = 0, h = 0, puddleY = 0, ph = 0, ow = 0, oh = 0;
let N = 0, nF = 0, nM = 0, nN = 0;
let nC = 0, cw = 6, maxH = 12, depK = 1;
let cold = 0, ice = 0, front = 0, windV = 0, lastNow = 0;
let pX = 0, pY = 0, pT = -1e6;
let gDirty = true, hazeG = null, bankG = null, sprites = false;

function mk(s) { const k = document.createElement('canvas'); k.width = k.height = s; return k; }

function buildSprites() {
  sprites = true;
  for (const core of [0.12, 0.28, 0.42]) {
    const k = mk(64), g = k.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)');
    rg.addColorStop(core, 'rgba(255,255,255,0.7)');
    rg.addColorStop(0.7, 'rgba(235,245,255,0.18)');
    rg.addColorStop(1, 'rgba(235,245,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    SOFT.push(k);
  }
  for (let d = 0; d < 3; d++) {
    const k = mk(96), g = k.getContext('2d');
    g.translate(48, 48);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 34);
    rg.addColorStop(0, 'rgba(255,255,255,0.4)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(-48, -48, 96, 96);
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
    g.shadowColor = 'rgba(200,230,255,0.9)'; g.shadowBlur = 5;
    const R = 38;
    if (d === 2) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); for (let a = 0; a < 6; a++) g.lineTo(Math.cos(a * TAU / 6) * R * 0.5, Math.sin(a * TAU / 6) * R * 0.5); g.closePath(); g.fill(); }
    g.lineWidth = d === 2 ? 1.8 : 2.4;
    for (let a = 0; a < 6; a++) {
      g.save(); g.rotate(a * TAU / 6);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0);
      const br = d === 0 ? [[0.45, 0.3], [0.7, 0.22]] : d === 1 ? [[0.35, 0.2], [0.62, 0.28]] : [[0.7, 0.2]];
      for (const [tt, len] of br) {
        const bx = R * tt, l = R * len;
        if (d === 2) { g.moveTo(bx, -l * 0.7); g.lineTo(bx, l * 0.7); }
        else {
          g.moveTo(bx, 0); g.lineTo(bx + l * 0.5, l * 0.866);
          g.moveTo(bx, 0); g.lineTo(bx + l * 0.5, -l * 0.866);
        }
      }
      g.stroke(); g.restore();
    }
    if (d === 1) { g.lineWidth = 1.6; g.beginPath(); for (let a = 0; a < 6; a++) g.lineTo(Math.cos(a * TAU / 6) * R * 0.3, Math.sin(a * TAU / 6) * R * 0.3); g.closePath(); g.stroke(); }
    CRY.push(k);
  }
}

function seedParams() {
  for (let i = 0; i < NF; i++) {
    const ly = i < nF ? 0 : i < nF + nM ? 1 : 2;
    const st = ly === 0 ? 0 : ly === 1 ? nF : nF + nM, cnt = ly === 0 ? nF : ly === 1 ? nM : nN;
    LAY[i] = ly; KD[i] = 0;
    TH[i] = i < N ? (i - st + Math.random()) / cnt : 2;
    PH[i] = Math.random() * TAU; LYR[i] = Math.random(); AGE[i] = 1e5;
    const r = Math.random();
    if (ly === 0) { SZ[i] = 0.8 + r * 0.8; SP[i] = 0.014 + 0.009 * Math.random(); AM[i] = 0.004 + 0.004 * Math.random(); FQ[i] = 0.8 + Math.random() * 1.2; AL[i] = 1; }
    else if (ly === 1) { SZ[i] = 0.9 + r * 0.9; SP[i] = 0.027 + 0.02 * Math.random(); AM[i] = 0.008 + 0.008 * Math.random(); FQ[i] = 1.1 + Math.random() * 1.5; AL[i] = 1; }
    else {
      SZ[i] = 10 + r * r * 20; AL[i] = 0.55 + 0.4 * Math.random();
      if (SZ[i] > 15 && Math.random() < 0.5) { KD[i] = 3 + ((Math.random() * 3) | 0); SZ[i] = 20 + Math.random() * 14; }
      else KD[i] = (Math.random() * 3) | 0;
      SP[i] = 0.05 + 0.045 * (SZ[i] - 10) / 24 + Math.random() * 0.01;
      AM[i] = 0.014 + 0.016 * Math.random(); FQ[i] = 0.9 + Math.random() * 1.4;
    }
  }
}

function edge(side, r) {
  return w * 0.4 * ice * (side ? PR[r] : PL[r]) * (0.5 + 0.5 * r / (ROWS - 1));
}

function iced(x, y) {
  if (ice < 0.05) return false;
  let r = Math.round((y - puddleY) / ph * (ROWS - 1));
  r = r < 0 ? 0 : r > ROWS - 1 ? ROWS - 1 : r;
  return x < edge(0, r) || x > w - edge(1, r);
}

function ring(x, y, s) {
  if (iced(x, y)) return;
  RX[ringHead] = x; RY[ringHead] = y; RT[ringHead] = 0; RS[ringHead] = s;
  ringHead = (ringHead + 1) % NR;
}

function addCol(k, a) {
  if (k < 0 || k >= nC) return;
  const room = CAP[k] - BANK[k];
  if (room > 0) BANK[k] += Math.min(a * (0.5 + NZ[k]), room);
}

function deposit(x, a) {
  const k = (x / cw) | 0;
  addCol(k - 1, a * 0.25); addCol(k, a * 0.5); addCol(k + 1, a * 0.25);
}

function spawn(i) {
  X[i] = -M + Math.random() * (w + 2 * M);
  Y[i] = front < h ? Math.random() * front - 12 : -(LAY[i] === 2 ? SZ[i] : 4) - Math.random() * 40;
  LYR[i] = Math.random(); AGE[i] = 0; VX[i] = 0; VY[i] = 0;
}

function burst(x, y, k) {
  for (let n = 0; n < 26; n++) {
    const a = Math.random() * TAU, v = (0.12 + Math.random() * 0.42) * k, j = burstHead;
    BX[j] = x; BY[j] = y; BVX[j] = Math.cos(a) * v; BVY[j] = Math.sin(a) * v - 0.04;
    BL[j] = 900 + Math.random() * 800; BS[j] = 0.9 + Math.random() * 1.6;
    burstHead = (burstHead + 1) % NB;
  }
  burstLive = 1;
}

const snow = {
  reduced: false,
  residual: 0,   // 0..1: bank and ice still standing; keep calling draw (amount 0) until it is ~0

  layout(nw, nh, py) {
    if (!sprites) buildSprites();
    const px = ow ? nw / ow : 1, py2 = oh ? nh / oh : 1;
    w = nw; h = nh; puddleY = py; ph = Math.max(1, h - puddleY);
    N = Math.max(180, Math.min(520, Math.round(180 + (w - 375) / 1225 * 340)));
    nN = Math.min(36, Math.round(12 + (N - 180) / 340 * 22));
    nM = Math.round((N - nN) * 0.36); nF = N - nN - nM;
    depK = (w / N) / 2.1;
    const oc = nC, ocw = cw, old = oc ? BANK.slice(0, oc) : null;
    cw = Math.max(6, w / (MAXC - 3)); nC = Math.ceil(w / cw) + 1;
    maxH = 7 + h * 0.022;
    for (let k = 0; k < MAXC; k++) {
      const x = k * cw;
      NZ[k] = Math.max(0, Math.min(1, 0.5 + 0.28 * Math.sin(x * 0.011 + 1) + 0.16 * Math.sin(x * 0.029 + 2.3) + 0.09 * Math.sin(x * 0.061 + 0.7)));
      CAP[k] = maxH * (0.3 + 0.7 * NZ[k]);
      BANK[k] = old ? (old[Math.min(oc - 1, Math.round(x / ocw))] || 0) : 0;
    }
    for (let r = 0; r < ROWS; r++) { PL[r] = 0.45 + 0.55 * Math.random(); PR[r] = 0.45 + 0.55 * Math.random(); }
    const wasLive = new Uint8Array(NF);
    for (let i = 0; i < NF; i++) wasLive[i] = Y[i] > -1e5 ? 1 : 0;
    seedParams();
    for (let i = 0; i < NF; i++) {
      if (i < N && wasLive[i]) { X[i] *= px; Y[i] *= py2; } else Y[i] = -1e6;
    }
    ow = w; oh = h; gDirty = true;
  },

  pointer(x, y, down) {
    if (!(w > 0)) return;
    const now = performance.now(), k = snow.reduced ? 0.4 : 1;
    if (down) {
      burst(x, y, k);
      const R = 180;
      for (let i = 0; i < N; i++) {
        if (Y[i] < -1e5) continue;
        const ddx = X[i] - x, ddy = Y[i] - y, d2 = ddx * ddx + ddy * ddy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) + 0.001, f = 1 - d / R, g = 0.75 * f * LF[LAY[i]] * k;
        VX[i] += ddx / d * g; VY[i] += ddy / d * g;
      }
    } else if (now - pT < 250) {
      const dx = x - pX, dy = y - pY, sp = Math.sqrt(dx * dx + dy * dy), R = 120;
      if (sp > 0.5) {
        for (let i = 0; i < N; i++) {
          if (Y[i] < -1e5) continue;
          const ddx = X[i] - x, ddy = Y[i] - y, d2 = ddx * ddx + ddy * ddy;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) + 0.001, f = 1 - d / R, g = f * f * LF[LAY[i]] * k;
          let vx = VX[i] + (dx * 0.02 + ddx / d * sp * 0.004 - ddy / d * sp * 0.003) * g;
          let vy = VY[i] + (dy * 0.02 + ddy / d * sp * 0.004 + ddx / d * sp * 0.003) * g;
          vx = vx > 0.9 ? 0.9 : vx < -0.9 ? -0.9 : vx; vy = vy > 0.9 ? 0.9 : vy < -0.9 ? -0.9 : vy;
          VX[i] = vx; VY[i] = vy;
        }
      }
    }
    pX = x; pY = y; pT = now;
  },

  draw(c, dt, t, b, amount) {
    if (!(w > 0)) return;
    const ga0 = c.globalAlpha, lc0 = c.lineCap, op0 = c.globalCompositeOperation, lw0 = c.lineWidth;
    const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    const rd = snow.reduced, now = performance.now(), gap = now - lastNow;
    lastNow = now;
    c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';

    if (gap > 400) {   // we were not called: the thaw went on without us
      const f = Math.exp(-(gap - 100) / 5000);
      for (let k = 0; k < nC; k++) BANK[k] *= f;
      cold *= f; ice *= f;
      if (gap > 2500) { for (let i = 0; i < NF; i++) Y[i] = -1e6; front = 0; }
    }

    if (gDirty) {
      hazeG = c.createLinearGradient(0, puddleY - h * 0.4, 0, puddleY);
      hazeG.addColorStop(0, 'rgba(220,235,250,0)'); hazeG.addColorStop(1, 'rgba(220,235,250,0.11)');
      bankG = c.createLinearGradient(0, puddleY - maxH, 0, puddleY + maxH * 0.3);
      bankG.addColorStop(0, '#f7fbff'); bankG.addColorStop(0.55, '#dcebf6'); bankG.addColorStop(1, '#a9c6dc');
      gDirty = false;
    }

    const hs = Math.max(0.8, Math.min(1.4, h / 600));
    const vmul = (1 - 0.9 * b) * (rd ? 0.4 : 1) * hs, flut = rd ? 0.15 : 1;
    const ft = t * 0.001;
    const wt = 0.012 * Math.tanh(2.4 * Math.sin(t * 0.00008 + 0.6)) + 0.004 * Math.sin(t * 0.00071);
    windV += (wt - windV) * Math.min(1, dt * 0.0006);
    const wv = windV * (1 - 0.6 * b) * (rd ? 0.5 : 1);
    const dec = Math.exp(-dt / 850);

    if (a > 0.2) cold = Math.min(1, cold + dt * a / 22000); else cold = Math.max(0, cold - dt / 9000);
    ice += (cold * 0.9 - ice) * Math.min(1, dt / 2500);
    front = a > 0.02 ? Math.min(h * 1.2, front + dt * 0.14) : 0;
    const aMul = 0.4 + 0.6 * a;

    // Flakes: fall, flutter, drift, land.
    for (let i = 0; i < N; i++) {
      if (Y[i] < -1e5) {
        if (TH[i] < a && Math.random() < dt * 0.0025) spawn(i);
        continue;
      }
      const ly = LAY[i], f1 = ft * FQ[i] + PH[i];
      const sx = Math.sin(f1) + 0.55 * Math.sin(ft * FQ[i] * 0.43 + PH[i] * 1.7);
      X[i] += (wv * WM[ly] + sx * AM[i] * flut + VX[i]) * dt;
      Y[i] += (SP[i] * vmul * (1 + 0.26 * flut * Math.sin(f1 * 1.3)) + VY[i]) * dt;
      VX[i] *= dec; VY[i] *= dec; AGE[i] += dt;
      if (X[i] < -M) X[i] += w + 2 * M; else if (X[i] > w + M) X[i] -= w + 2 * M;
      const land = ly === 0 ? puddleY + 1 + LYR[i] * 3 : ly === 1 ? puddleY + 3 + LYR[i] * ph * 0.22 : puddleY + ph * (0.18 + 0.72 * LYR[i]);
      if (Y[i] > land) {
        const x = X[i];
        if (x >= 0 && x <= w) {
          if (cold > 0.06 && Math.random() < cold * 0.95 * (ly === 2 ? 0.5 : 1)) deposit(x, (ly === 0 ? 0.4 : ly === 1 ? 0.8 : 1.6) * depK);
          else if (ly > 0 || Math.random() < 0.25) ring(x, land, ly === 0 ? 0.3 : ly === 1 ? 0.6 : 1);
        }
        if (TH[i] < a) spawn(i); else Y[i] = -1e6;
        if (Y[i] > -1e5 && front >= h) Y[i] = -(ly === 2 ? SZ[i] : 4) - Math.random() * 40;
        else if (Y[i] > -1e5) Y[i] = -12 - Math.random() * 30;
      }
    }

    // Bank: slumps into mounds, melts when the snow thins.
    const slump = Math.min(0.25, dt * 0.0015), mr = a < 0.3 ? (0.3 - a) / 0.3 : 0;
    let mx = 0;
    for (let k = 0; k < nC; k++) {
      let v = BANK[k];
      if (v <= 0 && !(k > 0 && BANK[k - 1] > 0.3) && !(k < nC - 1 && BANK[k + 1] > 0.3)) continue;
      const l = k > 0 ? BANK[k - 1] : v, r = k < nC - 1 ? BANK[k + 1] : v;
      v += ((l + r) * 0.5 - v) * slump;
      if (mr > 0) v -= (v * 0.6 + 0.25) * mr * dt / 3000;
      if (v < 0.04) v = 0;
      BANK[k] = v; if (v > mx) mx = v;
    }
    snow.residual = Math.max(mx / maxH, ice > 0.02 ? ice : 0);

    // Hush: a faint pale haze low in the sky.
    c.globalAlpha = a * 0.9; c.fillStyle = hazeG; c.fillRect(0, puddleY - h * 0.4, w, h * 0.4);

    // Far and mid flakes, batched: two alpha bins each.
    c.fillStyle = '#dbe8f5';
    for (let bin = 0; bin < 2; bin++) {
      c.globalAlpha = (bin ? 0.55 : 0.36) * aMul;
      c.beginPath();
      for (let i = bin; i < nF; i += 2) { if (Y[i] < -1e5) continue; c.rect(X[i], Y[i], SZ[i], SZ[i]); }
      c.fill();
    }
    c.fillStyle = '#eaf3fd';
    for (let bin = 0; bin < 2; bin++) {
      c.globalAlpha = (bin ? 0.8 : 0.58) * aMul;
      c.beginPath();
      for (let i = nF + bin; i < nF + nM; i += 2) {
        if (Y[i] < -1e5) continue;
        c.moveTo(X[i] + SZ[i], Y[i]); c.arc(X[i], Y[i], SZ[i], 0, TAU);
      }
      c.fill();
    }

    // Ice skin creeping in from both edges of the puddle.
    if (ice > 0.02) {
      c.fillStyle = '#d6eaf8';
      for (let pass = 0; pass < 2; pass++) {
        const sc = pass ? 0.72 : 1;
        c.globalAlpha = (pass ? 0.13 : 0.17) * Math.min(1, ice * 1.5);
        c.beginPath();
        c.moveTo(0, puddleY);
        for (let r = 0; r < ROWS; r++) c.lineTo(edge(0, r) * sc, puddleY + ph * r / (ROWS - 1));
        c.lineTo(0, h); c.closePath();
        c.moveTo(w, puddleY);
        for (let r = 0; r < ROWS; r++) c.lineTo(w - edge(1, r) * sc, puddleY + ph * r / (ROWS - 1));
        c.lineTo(w, h); c.closePath();
        c.fill();
      }
      c.globalAlpha = 0.32 * Math.min(1, ice * 1.5); c.strokeStyle = '#eef7ff'; c.lineWidth = 1;
      c.beginPath();
      for (let r = 0; r < ROWS; r++) { const y = puddleY + ph * r / (ROWS - 1), x = edge(0, r); if (r) c.lineTo(x, y); else c.moveTo(x, y); }
      for (let r = 0; r < ROWS; r++) { const y = puddleY + ph * r / (ROWS - 1), x = w - edge(1, r); if (r) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    }

    // Bank along the puddle line.
    if (mx > 0.2) {
      c.globalAlpha = Math.min(1, mx / 2) * 0.95; c.fillStyle = bankG;
      c.beginPath();
      c.moveTo(0, puddleY + 2);
      for (let k = 0; k < nC; k++) c.lineTo(k * cw, puddleY - BANK[k]);
      for (let k = nC - 1; k >= 0; k--) c.lineTo(k * cw, puddleY + 2 + BANK[k] * 0.2);
      c.closePath(); c.fill();
      c.globalAlpha = Math.min(1, mx / 2) * 0.4; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      c.beginPath();
      for (let k = 0; k < nC; k++) { const y = puddleY - BANK[k] - 0.5; if (k) c.lineTo(k * cw, y); else c.moveTo(0, y); }
      c.stroke();
    }

    // Melt rings: tiny, pale, brief.
    c.strokeStyle = '#e6f3ff'; c.lineWidth = 1;
    for (let k = 0; k < NR; k++) {
      if (RT[k] >= RL) continue;
      RT[k] += dt;
      const age = RT[k] / RL;
      if (age >= 1) continue;
      const e = 1 - (1 - age) * (1 - age), R = 1.5 + (3 + 7 * RS[k]) * e;
      c.globalAlpha = (1 - age) * (1 - age) * 0.34 * (0.5 + 0.5 * RS[k]) * aMul;
      c.beginPath(); c.ellipse(RX[k], RY[k], R, R * 0.3, 0, 0, TAU); c.stroke();
    }

    // Near flakes: soft sprites and a few tumbling crystals (squashed on one axis to fake the tilt).
    for (let i = nF + nM; i < N; i++) {
      if (Y[i] < -1e5) continue;
      const s = SZ[i], x = X[i], y = Y[i];
      if (x < -s || x > w + s) continue;
      const fi = Math.min(1, AGE[i] / 700);
      c.globalAlpha = AL[i] * aMul * fi;
      if (KD[i] < 3) c.drawImage(SOFT[KD[i]], x - s / 2, y - s / 2, s, s);
      else {
        const wd = s * (0.45 + 0.55 * Math.abs(Math.cos(ft * 0.5 * FQ[i] + PH[i])));
        c.drawImage(CRY[KD[i] - 3], x - wd / 2, y - s / 2, wd, s);
      }
    }

    // Tap puffs.
    if (burstLive) {
      let live = 0;
      c.fillStyle = '#f4f9ff';
      const bd = Math.exp(-dt / 380);
      for (let k = 0; k < NB; k++) {
        if (BL[k] <= 0) continue;
        BL[k] -= dt; live = 1;
        BX[k] += BVX[k] * dt; BY[k] += BVY[k] * dt;
        BVX[k] *= bd; BVY[k] = BVY[k] * bd + 0.00004 * dt;
        c.globalAlpha = Math.min(1, BL[k] / 500) * 0.85;
        c.beginPath(); c.arc(BX[k], BY[k], BS[k], 0, TAU); c.fill();
      }
      burstLive = live;
    }

    c.globalAlpha = ga0; c.lineCap = lc0; c.globalCompositeOperation = op0; c.lineWidth = lw0;
  },
};

export default snow;
