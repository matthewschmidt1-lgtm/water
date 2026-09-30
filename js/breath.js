// The whole site breathes on one clock.
// breath.value: 0 = fully exhaled, 1 = fully inhaled (smooth cosine ease).
// breath.phase: 'inhale' | 'exhale'
// breath.velocity: signed rate of change (positive while inhaling).
// Also writes --breath (0..1) to :root so CSS can breathe too.

const CYCLE_MS = 10000; // 10 seconds per full breath

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
  // cosine: t=0 -> 0 (exhaled), t=0.5 -> 1 (inhaled), t=1 -> 0
  const v = 0.5 - 0.5 * Math.cos(breath.t * Math.PI * 2);
  breath.velocity = (v - breath.value) / Math.max(dt, 1);
  breath.value = v;
  breath.phase = breath.t < 0.5 ? 'inhale' : 'exhale';
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
