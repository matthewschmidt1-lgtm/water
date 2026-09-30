// Presence: where the visitor is, how fast they move, how long they have been still, how hard they scroll.
// A tiny shared singleton. Call updatePresence(now) once per frame from whoever animates; read `presence` anywhere.
//   x, y        last pointer position (client px), -1 until known
//   speed       pointer speed in px/s, smoothed, decays to 0 when still
//   idleMs      ms since the last pointer / touch / scroll / key event
//   scrollV     signed scroll velocity in px/s, smoothed, decays to 0
//   active      true if anything happened in the last 2 s
//   pointerType 'mouse' | 'pen' | 'touch' | ''   (hover effects should only run for 'mouse')
//   moves       counter that increments on every pointer move (compare to notice new movement)
export const presence = { x: -1, y: -1, speed: 0, idleMs: 0, scrollV: 0, active: false, pointerType: '', moves: 0 };

let lastAct = performance.now();
let lastMoveT = 0, lastScrollT = 0;
let prevX = -1, prevY = -1, prevSY = scrollY, lastFrame = performance.now();

const poke = () => { lastAct = performance.now(); };

addEventListener('pointermove', (e) => {
  const now = performance.now();
  presence.pointerType = e.pointerType || 'mouse';
  if (prevX >= 0) {
    const dt = Math.max(8, now - lastMoveT);
    const inst = Math.hypot(e.clientX - prevX, e.clientY - prevY) / dt * 1000;
    presence.speed += (inst - presence.speed) * 0.35;
  }
  prevX = presence.x = e.clientX; prevY = presence.y = e.clientY;
  lastMoveT = now; presence.moves++; lastAct = now;
}, { passive: true });
addEventListener('pointerdown', (e) => {
  presence.pointerType = e.pointerType || 'mouse';
  presence.x = prevX = e.clientX; presence.y = prevY = e.clientY;
  poke();
}, { passive: true });
addEventListener('touchstart', poke, { passive: true });
addEventListener('keydown', poke, { passive: true });
addEventListener('wheel', poke, { passive: true });
addEventListener('scroll', () => {
  const now = performance.now();
  const dt = Math.max(8, now - lastScrollT);
  const inst = (scrollY - prevSY) / dt * 1000;
  presence.scrollV += (inst - presence.scrollV) * 0.3;
  prevSY = scrollY; lastScrollT = now; lastAct = now;
}, { passive: true });

export function updatePresence(now = performance.now()) {
  const dt = Math.min(100, now - lastFrame); lastFrame = now;
  presence.idleMs = now - lastAct;
  presence.active = presence.idleMs < 2000;
  if (now - lastMoveT > 90) presence.speed *= Math.exp(-dt / 180);
  if (now - lastScrollT > 90) presence.scrollV *= Math.exp(-dt / 200);
  if (presence.speed < 1) presence.speed = 0;
  if (Math.abs(presence.scrollV) < 1) presence.scrollV = 0;
  return presence;
}
