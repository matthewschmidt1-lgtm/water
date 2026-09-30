// Opening: an almost-empty page. One droplet appears. It falls. plip. Ripples. Then the water breathes.
import breath from './breath.js';
import audio from './audio.js';

const canvas = document.getElementById('hero-canvas');
const c = canvas.getContext('2d');
const hero = document.querySelector('.hero');
const dpr = Math.min(devicePixelRatio || 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let w = 0, h = 0;

function resize() {
  const r = hero.getBoundingClientRect();
  w = Math.round(r.width); h = Math.round(r.height);
  canvas.width = w * dpr; canvas.height = h * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
addEventListener('resize', resize);

const start = performance.now();
const ripples = [];          // { x, y, t }
let dropY = -20, dropV = 0, landed = false, revealed = false;
let last = start;
const waterLine = () => h * 0.62;

function drawDrop(x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r * 1.8);
  c.bezierCurveTo(x + r * 1.2, y - r * 0.2, x + r, y + r, x, y + r);
  c.bezierCurveTo(x - r, y + r, x - r * 1.2, y - r * 0.2, x, y - r * 1.8);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.6);
  g.addColorStop(0, '#dffbff'); g.addColorStop(0.5, '#7ff2ff'); g.addColorStop(1, '#2fb8c6');
  c.fillStyle = g; c.fill();
}

function frame(now) {
  const dt = Math.min(now - last, 50); last = now;
  const t = (now - start) / 1000;
  c.clearRect(0, 0, w, h);
  const cx = w / 2;
  const wl = waterLine();

  // The water: a surface that rises and falls with the breath.
  const level = wl + (0.5 - breath.value) * 22;
  const g = c.createLinearGradient(0, level - 10, 0, h);
  g.addColorStop(0, `rgba(47,184,198,${0.35 + breath.value * 0.15})`);
  g.addColorStop(0.35, 'rgba(11,51,82,0.75)');
  g.addColorStop(1, 'rgba(4,17,31,0.95)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const y = level + Math.sin(x * 0.012 + t * 0.7) * 3 + Math.sin(x * 0.03 - t * 1.1) * 1.5;
    c.lineTo(x, y);
  }
  c.lineTo(w, h); c.closePath(); c.fill();
  // surface glint
  c.strokeStyle = `rgba(127,242,255,${0.15 + breath.value * 0.25})`;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= w; x += 8) {
    const y = level + Math.sin(x * 0.012 + t * 0.7) * 3 + Math.sin(x * 0.03 - t * 1.1) * 1.5;
    x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.stroke();

  // The droplet: appears after a quiet second, hangs, then falls.
  if (!landed) {
    if (reduced) { landed = true; ripples.push({ x: cx, y: level, t: 0 }); }
    else if (t > 1.0) {
      const hang = Math.min(1, (t - 1.0) / 1.6);       // 1.6s to fade in and hang
      const r = 9 + Math.sin(t * 3) * 0.6;
      const y = h * 0.28 + Math.sin(t * 2) * 2;
      if (t < 2.8) {
        c.globalAlpha = hang; drawDrop(cx, y, r); c.globalAlpha = 1; dropY = y;
      } else {
        dropV += 0.0022 * dt; dropY += dropV * dt;
        drawDrop(cx, dropY, r);
        if (dropY >= level - 4) {
          landed = true;
          ripples.push({ x: cx, y: level, t: 0 });
          setTimeout(() => ripples.push({ x: cx, y: level, t: 0 }), 260);
          audio.plip(1);
        }
      }
    }
  }
  if (landed && !revealed) { revealed = true; hero.classList.add('revealed'); }

  // Ripples: ellipses expanding on the surface, fading.
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.t += dt / 1000;
    const R = rp.t * 90;
    const a = Math.max(0, 1 - rp.t / 3.2);
    if (a <= 0) { ripples.splice(i, 1); continue; }
    c.strokeStyle = `rgba(127,242,255,${a * 0.6})`;
    c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(rp.x, rp.y, R, R * 0.22, 0, 0, Math.PI * 2); c.stroke();
  }
  // After the reveal, the surface breathes out a ripple on every exhale.
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
breath.onPhase((p) => { if (revealed && p === 'exhale') ripples.push({ x: w / 2, y: waterLine(), t: 0 }); });

// A tap anywhere on the hero makes a drop land there.
hero.addEventListener('pointerdown', (e) => {
  if (!revealed) return;
  const r = hero.getBoundingClientRect();
  ripples.push({ x: e.clientX - r.left, y: waterLine() + (0.5 - breath.value) * 22, t: 0 });
  audio.plip(0.9 + Math.random() * 0.4);
});
