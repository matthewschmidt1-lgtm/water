// The whole site breathes on one clock.
// breath.value: 0 = fully exhaled, 1 = fully inhaled (smooth cosine ease).
// breath.phase: 'inhale' | 'hold' | 'exhale'
// breath.velocity: signed rate of change (positive while inhaling).
// Also writes --breath (0..1) to :root so CSS can breathe too.

// inhale 6 s — the world gathers. hold 1 s — everything suspended. exhale 7 s — the world releases.
const INHALE = 6000, HOLD = 1000, EXHALE = 7000;
const CYCLE_MS = INHALE + HOLD + EXHALE;
const A = INHALE / CYCLE_MS, B = (INHALE + HOLD) / CYCLE_MS;

const breath = {
  value: 0,
  phase: 'exhale',
  velocity: 0,
  cycleMs: CYCLE_MS,
  t: 0,               // 0..1 position within the cycle
  _listeners: new Set(),
  onPhase(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
};

let last = performance.now();
let prevPhase = 'exhale';
let paused = false;

function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  if (!paused) breath.t = (breath.t + dt / CYCLE_MS) % 1;
  // piecewise cosine ease: 0 (exhaled) -> 1 (inhaled), a still moment at the top, then back down
  const t = breath.t;
  let v, phase;
  if (t < A) { v = 0.5 - 0.5 * Math.cos((t / A) * Math.PI); phase = 'inhale'; }
  else if (t < B) { v = 1; phase = 'hold'; }
  else { v = 0.5 + 0.5 * Math.cos(((t - B) / (1 - B)) * Math.PI); phase = 'exhale'; }
  breath.velocity = (v - breath.value) / Math.max(dt, 1);
  breath.value = v;
  breath.phase = phase;
  if (breath.phase !== prevPhase) {
    prevPhase = breath.phase;
    breath._listeners.forEach((fn) => fn(breath.phase));
  }
  document.documentElement.style.setProperty('--breath', v.toFixed(4));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { paused = document.hidden; last = performance.now(); });

export default breath;
