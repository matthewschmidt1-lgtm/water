# WATER

*It's always going somewhere.*

An interactive journey of water for every age: cloud → rain → mountain → soil → tree → cup → ocean → lab → you.
The whole site breathes on one 10‑second clock. Everything is procedural (Canvas 2D, CSS, Web Audio); there are no images, videos, audio files, or libraries.

## Run

```bash
npx serve -l 3000 .
```

Deploys to Railway via `npm start` (static `serve`).

## Structure

- `index.html` — hero + one empty `<section class="chapter">` per chapter
- `css/water.css` — colors, typography, chapter layout, depth layers, global UI
- `js/breath.js` — the shared breathing clock (`--breath` CSS var too)
- `js/audio.js` — procedural sound beds per chapter, `plip`, `pour`; off by default
- `js/hero.js` — the opening droplet, plip, ripples
- `js/main.js` — lazy chapter loading, animation loop, depth layers, WHERE IS WATER?, FOLLOW THE WATER
- `js/content.js` — text for the global mechanics
- `js/chapters/*.js` — one self‑contained module per chapter (see `CHAPTER_CONTRACT.md`)

## Adding a chapter

Add `<section class="chapter" id="name" data-chapter="name" data-label="Label"></section>` to `index.html` and create `js/chapters/name.js` following `CHAPTER_CONTRACT.md`. Optionally add a sound recipe in `js/audio.js`.
