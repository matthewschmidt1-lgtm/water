# WATER — chapter contract

WATER is a zero-build static site (plain HTML/CSS/ES modules, no bundler, no npm deps except `serve`).
It is a journey of water: cloud → rain → mountain → soil → tree → cup → ocean → lab → you.
Everything is procedural: Canvas 2D for particles/water, SVG or canvas for silhouettes, CSS for subtle motion. **No images, no video, no audio files, no external libraries.**

The whole site breathes on one 10-second clock (`js/breath.js`). Every chapter must visibly respond to it, subtly: "something is alive here", never "look, it's breathing".

## Files you own
Each chapter lives in exactly one file: `js/chapters/<name>.js`. You may not edit `index.html`, `css/water.css`, `js/main.js`, `js/breath.js`, `js/audio.js`, `js/nav.js`, `js/content.js`. If you need CSS, inject a `<style>` element inside your section from `mount()` (scope every selector under `#<name>`).

## Module shape
```js
export default {
  mount(el, ctx) {},               // build DOM into el. Runs once, when the section is within one viewport of the screen.
  tick(dt, breath, ctx) {},        // every animation frame while the section is >=35% on screen. dt in ms (<=50).
  resize(ctx) {},                  // optional; ctx.w / ctx.h already updated and canvas already re-sized+scaled.
  unmount() {},                    // optional
};
```
`el` is `<section class="chapter" id="<name>" data-chapter="<name>">`, `min-height: 100vh`, `position: relative; overflow: hidden`.
`ctx`:
- `ctx.canvas` — a full-bleed `<canvas class="chapter-canvas">` already prepended to `el` (absolute, inset 0, z-index 0). `ctx.c2d` its 2D context, already scaled by `ctx.dpr`. Draw in CSS pixels using `ctx.w` × `ctx.h`.
- `ctx.audio` — `audio.plip(pitch=1)`, `audio.pour(seconds)`; both silent unless the user turned sound on. Use sparingly for taps/landings.
- `ctx.breath` — same object passed to tick.
- `ctx.reduced` — `prefers-reduced-motion`. Keep the scene static-ish (slow fades OK) when true.

`breath`: `{ value: 0..1 (0 = exhaled, 1 = inhaled, cosine-smooth), phase: 'inhale'|'exhale', velocity, onPhase(fn) }`. CSS also has `--breath` (0..1) on `:root`.

## Text layout (use this markup; CSS already exists)
```html
<div class="chapter-body left">            <!-- left | right | (centered default) ; add "bottom" to push copy below a scene -->
  <p class="chapter-kicker">02 — Rain</p>
  <h2>Change the weather.</h2>
  <p class="lede">One or two sentences a six-year-old gets.</p>
  <div class="controls"> ... range inputs, .chip buttons ... </div>
  <div class="depth" data-level="1">
    <p class="l1">LOOK: the simplest true thing.</p>
    <div class="l2"><span class="term">Discover</span><p>Why? For a curious teenager.</p></div>
    <div class="l3"><span class="term">Infiltration</span><p>The real science, precisely and briefly, for the adult. Name the term.</p></div>
    <button class="depth-more">Discover</button>       <!-- main.js wires this; levels 1→2→3 -->
  </div>
</div>
```
Reusable classes: `.controls label` (stacked label + input), `.controls .value` (live value), `.chip-row .chip[aria-pressed]`, `.btn`, `.ghost`.
Colors (CSS vars): `--deep #04111f`, `--night #071a2e`, `--ocean #0b3352`, `--turquoise #2fb8c6`, `--cyan #7ff2ff`, `--mineral #3f8f7a`, `--earth #6b4f3a`, `--soil #2e2117`, `--sand #d9c7a3`, `--mist #dbe9f2`, `--white #f4f9fb`. Background of the page is `--deep`; give each chapter its own background gradient painted on the canvas each frame (or set `el.style.background`).

## Performance rules (non-negotiable)
- One `clearRect`/fill per frame, then draw. Cap particles (rain ≤ 400, mist ≤ 150, etc.). Prefer `for` loops and preallocated arrays.
- "3 things move prominently, 10 subtly, everything else nearly still."
- No allocations per frame in hot loops where avoidable. No per-frame DOM writes except a couple of `textContent` for readouts.
- Everything must work with pointer events on touch (use `pointerdown/pointermove`, `touch-action: none` on interactive canvases if you drag).
- Must be self-contained: no fetch, no imports other than none (you get everything via `ctx`).
- Handle `ctx.w`/`ctx.h` changing (recompute layout in `resize`).

## Voice
Storybook + science museum. Short lines. Concrete. Wonder first, then the term. No emoji in copy. No "click here". A grandparent and a six-year-old should be able to read it together.
