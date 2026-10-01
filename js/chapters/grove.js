// One landscape: a dawn sky with a cloud, a tree standing on the left, and the ground cut away beneath it.
// The tree draws water up out of that soil and lets it go into that sky. The cloud says where it has been.
import cloud from './cloud.js';
import tree from './tree.js';
import soil, { surfaceFrac } from './soil.js';

let el, base, cloudCtx, treeCtx, soilCtx, soilCanvas, treeCanvas;
const SOIL_FRAC = 0.46;            // the bottom share of the section that is ground
const TREE_X = () => (base.w > 820 ? 0.3 : 0.5);

function subCtx(canvas, extra) {
  const sub = { ...base, ...extra, canvas, c2d: canvas.getContext('2d') };
  sub.resize = () => {};
  return sub;
}
function place() {
  const W = base.w, H = base.h, dpr = base.dpr;
  const soilTop = Math.round(H * (1 - SOIL_FRAC)), soilH = H - soilTop;
  const treeBase = soilTop + surfaceFrac(TREE_X()) * soilH;
  const treeH = Math.round(treeBase / 0.8) ;      // the tree keeps its own proportions below its base
  // cloud: the whole section
  size(cloudCtx, base.canvas, 0, H);
  // soil: the bottom band
  size(soilCtx, soilCanvas, soilTop, soilH);
  soilCtx.hintTop = soilTop + 24;
  // tree: from the top down to a little below its base, standing on the soil's surface
  size(treeCtx, treeCanvas, 0, Math.min(H, treeH));
  treeCtx.baseY = treeBase; treeCtx.treeXFrac = TREE_X(); treeCtx.treeScale = base.w > 820 ? 0.62 : 0.7;
  el.style.setProperty('--soil-top', soilTop + 'px');
  function size(ctx, cv, top, h) {
    ctx.w = W; ctx.h = h;
    cv.style.top = top + 'px'; cv.style.height = h + 'px'; cv.style.bottom = 'auto'; cv.style.width = W + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(h * dpr);
    ctx.c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

export default {
  mount(section, ctx) {
    el = section; base = ctx;
    soilCanvas = document.createElement('canvas'); soilCanvas.className = 'chapter-canvas grove-soil';
    treeCanvas = document.createElement('canvas'); treeCanvas.className = 'chapter-canvas grove-tree';
    ctx.canvas.after(soilCanvas); soilCanvas.after(treeCanvas);
    cloudCtx = subCtx(ctx.canvas, { high: true });
    soilCtx = subCtx(soilCanvas, { transparentSky: true });
    treeCtx = subCtx(treeCanvas, { transparentSky: true, noSoil: true });
    el.insertAdjacentHTML('beforeend', `<style>
      #grove { min-height: 170vh; }
      #grove .grove-soil { z-index: 1; }
      #grove .grove-tree { z-index: 2; pointer-events: none; }
      #grove .stage-wrap { margin: 10px 0 0; }
      #grove .soil-body { position: absolute; top: calc(var(--soil-top) + 28px); right: max(16px, 6vw); left: auto; margin: 0; padding: 0 16px 40px; max-width: 460px; }
      @media (max-width: 820px) {
        #grove { min-height: auto; }
        #grove .soil-body { position: static; margin: 0; padding: 8px 16px 40px; max-width: none; }
      }
    </style>`);
    base.resize();   // the section just grew; measure it before laying anything out
    place();
    cloud.mount(el, cloudCtx);
    tree.mount(el, treeCtx);
    const bodiesA = el.querySelectorAll('.chapter-body');
    if (bodiesA.length === 2) { const stage = bodiesA[1].querySelector('.stage-wrap'); if (stage) bodiesA[0].querySelector('h2').after(stage); bodiesA[1].remove(); }
    soil.mount(el, soilCtx);
    const bodiesB = el.querySelectorAll('.chapter-body');
    if (bodiesB.length === 2) bodiesB[1].classList.add('soil-body');
    // the three modules style themselves by their old ids; point those rules at this section
    el.querySelectorAll('style').forEach((st) => { st.textContent = st.textContent.replace(/#cloud\b|#tree\b|#soil\b/g, '#grove'); });
  },
  tick(dt, breath) {
    cloud.tick(dt, breath, cloudCtx);
    soil.tick(dt, breath, soilCtx);
    tree.tick(dt, breath, treeCtx);
  },
  resize(ctx) {
    base = ctx; place();
    cloud.resize?.(cloudCtx); soil.resize?.(soilCtx); tree.resize?.(treeCtx);
  },
  unmount() { cloud.unmount?.(); tree.unmount?.(); soil.unmount?.(); },
};
