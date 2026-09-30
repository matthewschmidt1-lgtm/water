// Procedural ambient sound. No audio files. Everything is synthesized:
// filtered noise "beds" per chapter, a slow breath swell, and tiny one-shot events (plip, pour).
// Off by default. The user turns it on with the sound toggle.

import breath from './breath.js';

let ctx = null;
let master = null;
let bed = null;         // current chapter bed { gain, stop() }
let currentName = null;
let enabled = false;

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // breath swell: master gain rises on inhale, eases on exhale
  const swell = () => {
    if (!enabled) return;
    master.gain.setTargetAtTime(0.35 + 0.25 * breath.value, ctx.currentTime, 0.2);
    requestAnimationFrame(swell);
  };
  swell();
  return ctx;
}

function noiseBuffer(seconds = 2) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    // pink-ish noise via simple filter
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + 0.029591 * w;
    b1 = 0.985 * b1 + 0.032534 * w;
    b2 = 0.950 * b2 + 0.048056 * w;
    d[i] = (b0 + b1 + b2 + w * 0.05) * 0.4;
  }
  return buf;
}

// Bed recipes: filtered noise with a slow LFO. Cheap, endless, tiny.
const RECIPES = {
  cloud:    { type: 'lowpass',  freq: 400,  q: 0.5, gain: 0.35, lfo: 0.05, lfoDepth: 150 },
  rain:     { type: 'bandpass', freq: 3000, q: 0.7, gain: 0.30, lfo: 0.3,  lfoDepth: 800 },
  mountain: { type: 'lowpass',  freq: 900,  q: 0.4, gain: 0.35, lfo: 0.08, lfoDepth: 300 },
  soil:     { type: 'lowpass',  freq: 150,  q: 0.3, gain: 0.15, lfo: 0.03, lfoDepth: 40 },
  tree:     { type: 'bandpass', freq: 1200, q: 0.4, gain: 0.18, lfo: 0.12, lfoDepth: 400 },
  cup:      { type: 'lowpass',  freq: 300,  q: 0.3, gain: 0.12, lfo: 0.02, lfoDepth: 60 },
  ocean:    { type: 'lowpass',  freq: 500,  q: 0.6, gain: 0.45, lfo: 0.09, lfoDepth: 350 },
  lab:      { type: 'highpass', freq: 2000, q: 0.3, gain: 0.08, lfo: 0.2,  lfoDepth: 500 },
  you:      { type: 'lowpass',  freq: 200,  q: 0.4, gain: 0.25, lfo: 0.1,  lfoDepth: 80 },
  default:  { type: 'lowpass',  freq: 500,  q: 0.5, gain: 0.25, lfo: 0.06, lfoDepth: 150 },
};

function startBed(name) {
  const r = RECIPES[name] || RECIPES.default;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(3);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = r.type; filter.frequency.value = r.freq; filter.Q.value = r.q;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = r.lfo; lfoGain.gain.value = r.lfoDepth;
  lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter); filter.connect(gain); gain.connect(master);
  src.start(); lfo.start();
  gain.gain.setTargetAtTime(r.gain, ctx.currentTime, 1.5);
  return {
    gain,
    stop() {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 1.2);
      setTimeout(() => { try { src.stop(); lfo.stop(); } catch (e) {} }, 4000);
    },
  };
}

const audio = {
  get enabled() { return enabled; },
  toggle() {
    enabled = !enabled;
    ensure();
    if (enabled) {
      ctx.resume();
      if (currentName) { bed?.stop(); bed = startBed(currentName); }
    } else {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    }
    return enabled;
  },
  // Called by main.js when the dominant chapter changes.
  setScene(name) {
    if (name === currentName) return;
    currentName = name;
    if (!enabled || !ctx) return;
    bed?.stop();
    bed = startBed(name);
  },
  // Tiny one-shot: a droplet landing.
  plip(pitch = 1) {
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(900 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(1800 * pitch, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(600 * pitch, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.3);
  },
  // A soft pour: short burst of filtered noise with a rising resonance.
  pour(seconds = 1.5) {
    if (!enabled || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(seconds + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.1);
    g.gain.setValueAtTime(0.3, t + seconds - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + seconds + 0.1);
  },
};

export default audio;
