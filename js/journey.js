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
  const followTerm = follow.querySelector('.follow-term');
  const followLine = follow.querySelector('.follow-line');
  const choicesEl = follow.querySelector('.follow-choices');
  const againBtn = follow.querySelector('.follow-again');
  const cycleEl = document.getElementById('cycle');
  const MAP = Object.fromEntries(FOLLOW.map((n) => [n.id, n]));
  const END = { id: '_end', word: '', text: '', chapter: 'cycle', form: 'drop', finale: true };
  const GLIDE = 1900, STEP_MS = 3500, DISCOVER_STEP_MS = 5600, SENTENCE_MS = 3000, CONSEQUENCE_MS = 2500, DISCOVER_MS = 3500, FINALE_MS = 9000, END_HOLD_MS = 6500;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const F = {
    on: false, i: 0, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t0: 0, arrived: false, sentenceOn: false,
    scrollFrom: 0, bend: 1, node: null, resting: false, flip: false, choosing: false, form: 'drop', count: 0, disc: null, ring: -1, color: '#7ff2ff', origin: null, raf: 0, timer: null, labelT: null, fade: 1,
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

  // The end of the thread inside #cycle (the svg's viewBox is 640x400; the thread ends at 170,76).
  function cycleTarget() {
    const box = cycleEl.querySelector('.cycle-box').getBoundingClientRect();
    const dest = followScrollFor(cycleEl);
    return [box.left + box.width * (170 / 640), box.top + scrollY - dest + box.height * (76 / 400)];
  }

  const clearTimers = () => { clearTimeout(F.timer); clearTimeout(F.labelT); clearTimeout(F.t2); clearTimeout(F.t3); F.timer = F.t2 = F.t3 = null; };
  function hideChoices() { choicesEl.classList.remove('vis'); F.choosing = false; setTimeout(() => { if (!F.choosing) choicesEl.classList.remove('show'); }, 700); }

  function startStep(id) {
    const s = id === '_end' ? END : MAP[id] || FOLLOW[0];
    F.node = s; F.form = s.form || 'drop'; F.count++;
    document.dispatchEvent(new CustomEvent('water:open', { detail: s.chapter }));
    const el = document.getElementById(s.chapter);
    clearTimers(); hideChoices();
    followTerm.classList.remove('on'); followLine.classList.remove('on', 'cons');
    F.color = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7ff2ff';
    F.sx = F.x; F.sy = F.y; F.scrollFrom = scrollY; F.t0 = performance.now();
    F.arrived = false; F.sentenceOn = false; F.el = el; F.bend = -F.bend;
    // The loop closes where it began: the last step returns to the first step's point.
    if (s.finale) [F.tx, F.ty] = cycleTarget();
    else { [F.tx, F.ty] = followTarget(F.count, el); }
    followStep.classList.remove('on');
    fLabel.classList.remove('show');
    if (!s.finale) {
      F.labelT = setTimeout(() => {
        followWord.textContent = s.word;
        followStep.textContent = s.text;
        F.flip = F.tx > innerWidth * 0.55;
        fLabel.classList.toggle('flip', F.flip);
        choicesEl.classList.toggle('flip', F.flip);
        fLabel.classList.add('show');
      }, reduced ? 0 : 260);
    }
    followNext.hidden = !!(s.choices || s.finale);
    const last = !s.next && !s.choices && !s.finale;
    followNext.textContent = last ? 'finish' : 'next';
    // Steps go on by themselves, except at a fork (the visitor decides) and at the end (the finale takes over).
    if (reduced) { F.x = F.tx; F.y = F.ty; window.scrollTo({ top: followScrollFor(el), behavior: 'instant' }); arrive(); }
  }

  function arrive() {
    const s = F.node;
    F.arrived = true; F.arrivedAt = performance.now(); F.ring = F.arrivedAt;
    audio.plip(1 + (F.count % 12) * 0.05);
    if (s.finale) { finish(); return; }
    if (s.discover) {
      F.t2 = setTimeout(() => {
        followTerm.textContent = s.discover.term; followLine.textContent = s.discover.line;
        followTerm.classList.add('on'); followLine.classList.add('on');
        F.t3 = setTimeout(() => { followTerm.classList.remove('on'); followLine.classList.remove('on'); }, DISCOVER_MS);
      }, reduced ? 200 : 900);
    }
    if (s.choices) showChoices(s);
    else if (s.next) F.timer = setTimeout(() => startStep(s.next), s.discover ? DISCOVER_STEP_MS : STEP_MS);
    else if (!s.next) F.timer = setTimeout(() => startStep('_end'), END_HOLD_MS);
  }

  function showChoices(s) {
    choicesEl.textContent = '';
    s.choices.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = c.label;
      b.addEventListener('click', () => choose(c));
      choicesEl.appendChild(b);
    });
    F.choosing = true;
    clearTimeout(F.t2); F.t2 = setTimeout(() => {
      if (!F.choosing) return;
      choicesEl.classList.add('show'); void choicesEl.offsetWidth; choicesEl.classList.add('vis');
      choicesEl.querySelector('button')?.focus({ preventScroll: true });
    }, reduced ? 100 : 1500);
  }
  function choose(c) {
    if (!F.choosing) return;
    F.choosing = false; audio.plip(1.3);
    choicesEl.classList.remove('vis'); setTimeout(() => choicesEl.classList.remove('show'), 500);
    followStep.classList.remove('on');
    const go = () => startStep(c.next);
    if (c.consequence) {
      followLine.textContent = c.consequence; followLine.classList.add('cons', 'on');
      F.timer = setTimeout(go, CONSEQUENCE_MS);
    } else go();
  }

  // The journey completes: the drop rests at the end of the thread, the finale plays, then the overlay fades away.
  function finish() {
    follow.classList.add('finale');
    cycleEl.classList.add('is-visible');
    F.t2 = setTimeout(() => { try { cycleEl.querySelector('animateMotion').beginElement(); } catch (_) {} }, 600);
    F.timer = setTimeout(() => {
      F.resting = true; cancelAnimationFrame(F.raf); fc.clearRect(0, 0, innerWidth, innerHeight);
      document.body.classList.remove('following');
      follow.classList.add('resting'); againBtn.hidden = false;
    }, FINALE_MS);
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
    if (F.choosing) {
      if (narrow.matches) {
        const h = choicesEl.offsetHeight || 150;
        const y = Math.min(Math.max(getSceneH() + 8, F.y + 60), H - 84 - h);
        choicesEl.style.transform = `translate3d(${W / 2}px,${y.toFixed(1)}px,0) translateX(-50%)`;
      } else {
        choicesEl.style.transform = `translate3d(${(F.x + (F.flip ? -24 : 24)).toFixed(1)}px,${(F.y + 100).toFixed(1)}px,0)${F.flip ? ' translateX(-100%)' : ''}`;
      }
    }
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
    drawDrop(F.x, dy0, 6 + bv * 1.5, F.form, now);
  }

  // Five tiny variants: the drop looks like what you are.
  function poly(x, y, r, n, rot) {
    fc.beginPath();
    for (let k = 0; k < n; k++) { const a = rot + (k / n) * 6.2832; fc[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    fc.closePath();
  }
  function drawDrop(x, y, r, form, now) {
    const f = F.fade, fast = F.arrived ? 1 : 1.35;
    fc.fillStyle = F.color;
    const halo = (k, a) => { fc.globalAlpha = Math.min(1, a * f * fast); fc.beginPath(); fc.arc(x, y, r * k, 0, 6.2832); fc.fill(); };
    if (form === 'rain') {
      const g = fc.createLinearGradient(x, y - r * 7, x, y + r);
      g.addColorStop(0, 'rgba(244,249,251,0)'); g.addColorStop(1, '#f4f9fb');
      fc.globalAlpha = 0.5 * f; fc.fillStyle = g; fc.fillRect(x - 1.1, y - r * 7, 2.2, r * 8);
      halo(2.4, 0.12); fc.globalAlpha = f; fc.fillStyle = '#f4f9fb';
      fc.beginPath(); fc.ellipse(x, y, r * 0.42, r * 1.05, 0, 0, 6.2832); fc.fill();
    } else if (form === 'snow') {
      const rot = now / 4000; halo(4, 0.07); halo(2.4, 0.13);
      fc.globalAlpha = 0.9 * f; fc.fillStyle = '#f4f9fb'; poly(x, y, r * 1.15, 6, rot); fc.fill();
      fc.globalAlpha = 0.35 * f; fc.strokeStyle = '#f4f9fb'; fc.lineWidth = 1; poly(x, y, r * 1.9, 6, rot + 0.5); fc.stroke();
    } else if (form === 'vapor') {
      fc.fillStyle = '#e6f6fb';
      for (let k = 0; k < 8; k++) {
        const a = k * 2.4 + now / (1500 + k * 170), d = r * (0.5 + (k % 3) * 0.55);
        fc.globalAlpha = 0.16 * f; fc.beginPath(); fc.arc(x + Math.cos(a) * d, y + Math.sin(a * 1.3) * d, r * (0.9 + (k % 4) * 0.35), 0, 6.2832); fc.fill();
      }
      halo(3.4, 0.05);
    } else if (form === 'ice') {
      halo(3, 0.08); fc.globalAlpha = 0.85 * f; fc.fillStyle = '#dff7ff'; poly(x, y, r * 1.05, 4, Math.PI / 4); fc.fill();
      fc.globalAlpha = f; fc.strokeStyle = '#ffffff'; fc.lineWidth = 1.2; poly(x, y, r * 1.4, 4, Math.PI / 4); fc.stroke();
    } else {
      halo(4.2, 0.07); halo(2.6, 0.14); halo(1.6, 0.35);
      fc.globalAlpha = f; fc.fillStyle = '#f4f9fb'; fc.beginPath(); fc.ellipse(x, y, r * 0.62, r * 0.78, 0, 0, 6.2832); fc.fill();
    }
    fc.globalAlpha = 1;
  }

  function stopFollow() {
    if (!F.on) return;
    F.on = false; cancelAnimationFrame(F.raf); clearTimers(); hideChoices();
    follow.classList.add('leaving'); document.body.classList.remove('following');
    setTimeout(() => { if (!F.on) { follow.hidden = true; follow.classList.remove('leaving', 'finale', 'resting'); againBtn.hidden = true; fc.clearRect(0, 0, innerWidth, innerHeight); } }, 650);
  }
  function beginFollow(from) {
    if (F.on) return;
    F.on = true; F.resting = false; F.count = 0; follow.classList.remove('leaving', 'finale', 'resting'); againBtn.hidden = true; follow.hidden = false;
    document.body.classList.add('following');
    sizeFollowCanvas(); trail.length = 0; F.ring = -1; F.origin = null; F.el = null;
    const b = from || followBtn.getBoundingClientRect();
    F.x = b.left + b.width / 2; F.y = Math.min(b.top + b.height / 2, innerHeight - 30);
    fLabel.classList.remove('show'); followStep.classList.remove('on');
    F.raf = requestAnimationFrame(followFrame);
    startStep(FOLLOW[0].id);
  }
  followBtn.addEventListener('click', () => beginFollow());
  followNext.addEventListener('click', () => {
    const s = F.node;
    if (!s || s.choices || s.finale) return;
    startStep(s.next || '_end');
  });
  againBtn.addEventListener('click', () => {
    const b = againBtn.getBoundingClientRect();
    F.on = false; beginFollow(b);
  });
  follow.querySelector('.follow-close').addEventListener('click', stopFollow);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !F.resting) stopFollow(); });
}
