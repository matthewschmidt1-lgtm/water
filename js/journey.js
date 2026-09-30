// FOLLOW THE WATER — the narrative engine. Owned by this module; main.js only calls mountJourney().
import audio from './audio.js';
import breath from './breath.js';
import { FOLLOW } from './content.js';

export function mountJourney({ narrow, reduced, getSceneH }) {
  // FOLLOW THE WATER: one glowing drop leads the page, one enormous loop.
  // The drop is a fixed canvas overlay. Each step it glides (with the scroll riding along) to a point over the
  // chapter's scene, leaves a fading trail, and names where it is. Arrival: a thin ring and a plip.
  const followBtn = document.getElementById('follow-btn');
  const follow = document.getElementById('follow');
  const fCanvas = document.getElementById('follow-canvas');
  const fc = fCanvas.getContext('2d');
  const fLabel = follow.querySelector('.follow-label');
  const followStep = follow.querySelector('.follow-step');
  const followWord = follow.querySelector('.follow-word');
  const followNext = follow.querySelector('.follow-next');
  const LAST = FOLLOW.length - 1;
  const GLIDE = 1900, STEP_MS = 5200, SENTENCE_MS = 3000;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const F = {
    on: false, i: 0, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t0: 0, arrived: false, sentenceOn: false,
    scrollFrom: 0, bend: 1, ring: -1, color: '#7ff2ff', origin: null, raf: 0, timer: null, labelT: null, fade: 1,
  };
  const trail = []; let trailAt = 0;

  function sizeFollowCanvas() {
    const d = Math.min(devicePixelRatio || 1, 2);
    fCanvas.width = Math.round(innerWidth * d); fCanvas.height = Math.round(innerHeight * d);
    fc.setTransform(d, 0, 0, d, 0, 0);
  }
  addEventListener('resize', () => { if (F.on) sizeFollowCanvas(); });

  // Where the scroll should end for a chapter (live, because chapters mount and change height as we pass).
  function followScrollFor(el) {
    const top = el.getBoundingClientRect().top + scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const y = narrow.matches ? top : top + el.offsetHeight / 2 - innerHeight / 2;
    return Math.max(0, Math.min(max, y));
  }
  // The point over the scene where the drop rests: about 35% down the visible scene area.
  function followTarget(i, el) {
    const w = innerWidth;
    const body = el.querySelector('.chapter-body');
    const areaH = narrow.matches ? getSceneH() : innerHeight;
    let fx = narrow.matches ? 0.5 : body?.classList.contains('left') ? 0.7 : body?.classList.contains('right') ? 0.3 : 0.5;
    fx += Math.sin(i * 2.1) * (narrow.matches ? 0.16 : 0.12);
    return [w * fx, areaH * (0.35 + Math.cos(i * 1.7) * 0.08)];
  }

  function startStep(i) {
    F.i = Math.min(i, LAST);
    const s = FOLLOW[F.i];
    const el = document.getElementById(s.chapter);
    F.color = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7ff2ff';
    F.sx = F.x; F.sy = F.y; F.scrollFrom = scrollY; F.t0 = performance.now();
    F.arrived = false; F.sentenceOn = false; F.el = el; F.bend = -F.bend;
    // The loop closes where it began: the last step returns to the first step's point.
    if (F.i === LAST && F.origin) [F.tx, F.ty] = F.origin;
    else { [F.tx, F.ty] = followTarget(F.i, el); if (F.i === 0) F.origin = [F.tx, F.ty]; }
    followStep.classList.remove('on');
    fLabel.classList.remove('show');
    clearTimeout(F.labelT);
    F.labelT = setTimeout(() => {
      followWord.textContent = s.word;
      followStep.textContent = s.text;
      fLabel.classList.toggle('flip', F.tx > innerWidth * 0.55);
      fLabel.classList.add('show');
    }, reduced ? 0 : 260);
    const done = F.i >= LAST;
    followNext.textContent = done ? 'Begin again' : 'next';
    followNext.classList.toggle('again', done);
    clearTimeout(F.timer);
    F.timer = done ? null : setTimeout(() => startStep(F.i + 1), STEP_MS);
    if (reduced) { F.x = F.tx; F.y = F.ty; window.scrollTo({ top: followScrollFor(el), behavior: 'instant' }); arrive(); }
  }

  function arrive() {
    F.arrived = true; F.arrivedAt = performance.now(); F.ring = F.arrivedAt;
    audio.plip(1 + F.i * 0.05);
  }

  function followFrame(now) {
    if (!F.on) return;
    F.raf = requestAnimationFrame(followFrame);
    const W = innerWidth, H = innerHeight;
    fc.clearRect(0, 0, W, H);
    const bv = breath.value;
    if (!F.arrived) {
      const p = Math.min(1, (now - F.t0) / GLIDE), e = ease(p);
      const dx = F.tx - F.sx, dy = F.ty - F.sy, dist = Math.hypot(dx, dy) || 1;
      const bend = Math.sin(Math.PI * e) * dist * 0.14 * F.bend;
      F.x = F.sx + dx * e + (-dy / dist) * bend;
      F.y = F.sy + dy * e + (dx / dist) * bend;
      if (F.el) window.scrollTo({ top: F.scrollFrom + (followScrollFor(F.el) - F.scrollFrom) * e, behavior: 'instant' });
      if (now - trailAt > 34) { trail.push({ x: F.x, y: F.y, t: now, r: 2 + Math.random() * 1.6 }); trailAt = now; }
      if (p >= 1) arrive();
    } else {
      if (F.el && Math.abs(scrollY - followScrollFor(F.el)) > 1 && now - F.arrivedAt < 600) window.scrollTo({ top: followScrollFor(F.el), behavior: 'instant' });
      const since = now - F.arrivedAt;
      if (!F.sentenceOn && since > 250) { F.sentenceOn = true; followStep.classList.add('on'); }
      if (F.sentenceOn && since > SENTENCE_MS + 250) { F.sentenceOn = null; followStep.classList.remove('on'); }
    }
    const bob = F.arrived && !reduced ? Math.sin(now / 900) * 2.5 : 0;
    const dy0 = F.y + bob;
    fLabel.style.transform = `translate3d(${F.x.toFixed(1)}px,${dy0.toFixed(1)}px,0)`;
    // trail of tiny drops
    fc.fillStyle = F.color;
    for (let k = trail.length - 1; k >= 0; k--) {
      const a = 1 - (now - trail[k].t) / 700;
      if (a <= 0) { trail.splice(k, 1); continue; }
      fc.globalAlpha = a * 0.55; fc.beginPath(); fc.arc(trail[k].x, trail[k].y, trail[k].r * (0.4 + a * 0.6), 0, 6.2832); fc.fill();
    }
    // arrival ring, the same thin accent ring the chapters use
    if (F.ring > 0) {
      const rp = (now - F.ring) / 1400;
      if (rp >= 1) F.ring = -1;
      else {
        fc.globalAlpha = (1 - rp) * 0.7; fc.strokeStyle = F.color; fc.lineWidth = 1.2;
        fc.beginPath(); fc.arc(F.x, dy0, 8 + (1 - Math.pow(1 - rp, 3)) * 78, 0, 6.2832); fc.stroke();
      }
    }
    // the drop: layered glow, bright core
    const r = 6 + bv * 1.5;
    fc.fillStyle = F.color;
    fc.globalAlpha = 0.07 * F.fade; fc.beginPath(); fc.arc(F.x, dy0, r * 4.2, 0, 6.2832); fc.fill();
    fc.globalAlpha = 0.14 * F.fade; fc.beginPath(); fc.arc(F.x, dy0, r * 2.6, 0, 6.2832); fc.fill();
    fc.globalAlpha = 0.35 * F.fade; fc.beginPath(); fc.arc(F.x, dy0, r * 1.6, 0, 6.2832); fc.fill();
    fc.globalAlpha = F.fade; fc.fillStyle = '#f4f9fb';
    fc.beginPath(); fc.ellipse(F.x, dy0, r * 0.62, r * 0.78, 0, 0, 6.2832); fc.fill();
    fc.globalAlpha = 1;
  }

  function stopFollow() {
    if (!F.on) return;
    F.on = false; cancelAnimationFrame(F.raf);
    clearTimeout(F.timer); clearTimeout(F.labelT); F.timer = null;
    follow.classList.add('leaving'); document.body.classList.remove('following');
    setTimeout(() => { if (!F.on) { follow.hidden = true; follow.classList.remove('leaving'); fc.clearRect(0, 0, innerWidth, innerHeight); } }, 650);
  }
  function beginFollow() {
    if (F.on) return;
    F.on = true; follow.classList.remove('leaving'); follow.hidden = false;
    document.body.classList.add('following');
    sizeFollowCanvas(); trail.length = 0; F.ring = -1; F.origin = null; F.el = null;
    const b = followBtn.getBoundingClientRect();
    F.x = b.left + b.width / 2; F.y = Math.min(b.top + b.height / 2, innerHeight - 30);
    fLabel.classList.remove('show'); followStep.classList.remove('on');
    F.raf = requestAnimationFrame(followFrame);
    startStep(0);
  }
  followBtn.addEventListener('click', beginFollow);
  followNext.addEventListener('click', () => {
    if (F.i >= LAST) { F.origin = null; startStep(0); } else startStep(F.i + 1);
  });
  follow.querySelector('.follow-close').addEventListener('click', stopFollow);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') stopFollow(); });
}
