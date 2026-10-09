# WATER

*It's always going somewhere.*

A procedural, breathing website about water. The goal is that a visitor **feels** water first and understands it second, and leaves with a different relationship to it. It is not an educational site that happens to be pretty.

- Live: https://water-production-4036.up.railway.app (Railway, auto-deploys from `main`)
- Repo: `matthewschmidt1-lgtm/water`
- Shared preview: https://claude.ai/artifact/AN1pA6FdQXchj1NT1QKRAS

## Hard rules

- **Zero build.** Plain HTML, CSS, and ES modules. No bundler, no framework, no npm dependencies except `serve` for hosting.
- **Nothing downloaded.** No images, video, audio files, fonts, or libraries. Everything is drawn or synthesized: Canvas 2D, CSS, inline SVG, Web Audio.
- **Experience before explanation.** Never explain a phenomenon before the visitor has seen or caused it. No cards, badges, points, quizzes, progress bars, or lesson framing.
- **Fewer words.** The owner has repeatedly removed copy. Do not add text, labels, or UI unless asked. Every remaining word has to earn its place.
- **Realism means believable behavior**, not photographic graphics: gravity, acceleration, pooling, merging, ripples that decelerate and thin, perspective. Nothing decorative; every motion needs a physical reason.
- **One breath.** Everything follows `js/breath.js`: inhale 6 s, hold 1 s, exhale 7 s. It should be felt, never announced.
- **Respect `prefers-reduced-motion`** in anything animated.

## Run and verify

Node, npx, gh, and the Railway CLI are **not installed** on this Mac. Serve locally with Python:

```bash
cd ~/Desktop/Projects/water && python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://localhost:8765/. Verify changes in the browser before committing.

Browser-pane testing quirks that cost time before:

- Module caching is sticky. After an edit, force-refetch the changed files with `fetch(url, {cache: 'reload'})`, then navigate to a fresh `/?r=<anything>` URL.
- The pane often reports `document.hidden = true` and throttles `requestAnimationFrame`, CSS transitions, and IntersectionObserver callbacks. Right after load run `Object.defineProperty(document,'hidden',{get:()=>false,configurable:true})`, and take screenshots between steps to force real frames. Scripted `setTimeout` waits alone will not advance animations.
- Use `scrollIntoView({behavior:'instant'})` and repeat it once after a pause; chapters mount lazily and shift the page.
- The interface (menu, sound toggle) only appears after scrolling past the hero (`body.entered`).
- `?fast=1` on first load compresses the hero's weather schedule.

There is no test suite and no linter. Check the browser console for errors after every change.

## Deploy

Commit to `main` and push; Railway redeploys. `package.json` runs `serve -s . -l $PORT`. Commit messages end with the `Co-Authored-By` line the session provides.

## Page order (top to bottom)

1. **Hero** (`js/hero.js`): a night lake. A drop falls, WATER appears, then the tagline a second later. The title sweats at 3 s, its letters fall into the lake and splash, then a lone down arrow appears (it fades once the visitor scrolls). Scrolling away and back to the top replays the title and its melt. The lake has its own weather: wisp cloud, gusts, rain, mist. It reacts to presence (`js/presence.js`): pointer wake, idle glassiness, tap splashes, and press-and-hold raises a spout that climbs, plumes, and rains back in.
2. **Weather** (`rain.js`, section id still `rain`): Fog and Snow (modules in `js/chapters/weather/`, drawn over the rain sky, each with pointer interaction), then Drizzle, Rain, Downpour, Storm, Gully Gusher chips (the last swings the wind both ways and gives every drop its own eddy). Taller band on phones.
3. **Mountain** (`mountain.js`): a river in perspective that winds down from the snowline toward the viewer, with gravel banks, current lines, and lit stones. A drop runs it on arrival. Taller band on phones.
4. **Ocean** (`ocean.js`): dispersive waves with peaked crests, a wind slider (the owner wants this kept), tap to drop a stone.
5. **Closer** (`#closer`): four words on the shore, Sky, Lab, Cup, You. Clicking one opens that chapter in place; one open at a time. The menu and the journey open the right one first via the `water:open` event.
   - **Sky** (`grove.js`): one tall landscape (170vh on desktop) that composes three modules on stacked canvases: `cloud.js` (dawn sky, cloud that speaks a line each exhale), `tree.js` (on the left, sap climbing to transpiration), `soil.js` (cutaway ground along the bottom, hold the sky to rain, Sand/Loam/Clay chips).
   - **Lab** (`lab.js`), **Cup** (`cup.js`), **You** (`you.js`).
6. **Ending** (`#cycle`, logic in `js/main.js`): still water, one drop, WATER, "Enjoy it while it lasts." Then the text sweats, letters fall and splash, and a small angled whale fluke rises and slides under. It replays every time the visitor scrolls down into it.
7. **Footer**: the two buttons (Where is water? / Follow the water; not fixed to the screen, and hidden until the whale's slap has settled, `body.doors-open`), then "Made by Matty", linking to https://matthew-schmidt-production.up.railway.app/.

Global mechanics:

- **Follow the water** (`js/journey.js`, graph in `js/content.js`): a glowing drop leads the page through a branching journey (rock split, rock/sand/clay, drink/run/freeze), with consequences and after-the-fact "You just discovered ..." lines. Chapter copy hides while it runs.
- **Where is water?** (`js/where.js`): a hunt (points appear, multiply, "It's everywhere."), then a living window of short procedural scenes.
- **Drop menu** (`js/nav.js`), sound toggle (`js/audio.js`, off by default), river progress line.

## Architecture

- `index.html`: the hero, one empty `<section class="chapter" data-chapter="name">` per chapter, the closer, the ending, and overlay containers.
- `js/main.js`: lazy-loads chapter modules with IntersectionObservers, runs the single animation loop, sizes canvases, owns the closer tiles, the ending, the bottom bar, and the river line.
- `js/chapters/<name>.js`: one self-contained module per chapter. Contract in `CHAPTER_CONTRACT.md`: `mount(el, ctx)`, `tick(dt, breath, ctx)`, optional `resize(ctx)` and `unmount()`. Each module injects its own scoped `<style>` and markup.
- `css/water.css` (global), `css/lake.css` (hero), `css/journey.css`, `css/where.css`.

Things that are easy to get wrong:

- **Phone layout (under 820px).** Each chapter's scene is a band across the top and the copy flows below it. The band height is `--scene-h`, set from `js/main.js` (56 to 62 percent of the screen). The breakpoint lives in **both** `css/water.css` and `js/main.js`; change them together. A section can ask for a taller band with `data-band="0.8"` (Rain and Mountain do).
- **Quiet chapters.** Sections with `data-quiet` hide their paragraph and depth layers by CSS. The depth text still exists in the modules but has no control to open it. Lab, Cup, and You keep their "Why?" button.
- **Composite section.** `grove.js` passes flags to its sub-modules (`high`, `transparentSky`, `noSoil`, `baseY`, `treeXFrac`, `treeScale`, `hintTop`) and rewrites their `#cloud`, `#tree`, `#soil` style selectors to `#grove`. The journey graph points cloud, tree, and soil steps at `grove`.
- **Class name collision.** A body state class must never share a name with a component class. `body.where` once matched the overlay's `.where` rule and collapsed the page; the state class is `where-open`.
- **Letters that fall.** The hero and the ending both measure real DOM text, hide it, and redraw each letter on a canvas. If you change that text's font, size, or position, the falling letters follow automatically.
- **Mountain perspective.** Sideways offsets from the river's centerline are squeezed vertically by `FS` so reaches crossing the slope look thin and reaches coming toward the viewer look wide. Fills are built from one quad per segment so tight bends cannot punch holes.

## Things the owner has removed on purpose (do not bring back unprompted)

- The lines "Water changes. Water connects. Water returns." everywhere, including menu group headings.
- The inhale / hold / exhale word, and the words "follow it" (only the arrow remains).
- Chapter numbers, chapter paragraphs, the corner "?" marks, the Why buttons on the scroll chapters.
- Soil counters and water-table bar, the lab's "Impossible water" chips, the ocean's vapor wisps.
- The standalone "One drop" physics section, the footer tagline about math and video.
- The mountain's dashed "light" streams.

## Working with the owner

- They iterate fast by feel and screenshots. Make the change, verify it in the browser, ship it, and say plainly what changed and what was not checked.
- They often ask for Sonnet subagents for testing or specialist passes. When agents work in parallel, give each strict file ownership; the browser pane is shared, so agents hijack each other's tabs.
- After each shipped change, republish the artifact above so the shared link stays current.
