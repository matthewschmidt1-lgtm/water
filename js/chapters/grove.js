// Sky and tree in one scene. The cloud drifts above; the tree draws water up and lets it go into that same sky.
import cloud from './cloud.js';
import tree from './tree.js';

let el, cloudCtx, treeCtx;

function subCtx(ctx, canvas, extra) {
  const sub = { ...ctx, ...extra, canvas, c2d: canvas.getContext('2d') };
  sub.resize = () => {
    sub.w = ctx.w; sub.h = ctx.h;
    canvas.width = sub.w * ctx.dpr; canvas.height = sub.h * ctx.dpr;
    canvas.style.width = sub.w + 'px'; canvas.style.height = sub.h + 'px';
    sub.c2d.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
  };
  sub.resize();
  return sub;
}

export default {
  mount(section, ctx) {
    el = section;
    // the chapter's own canvas carries the sky and the cloud; a second canvas in front carries the tree
    const treeCanvas = document.createElement('canvas');
    treeCanvas.className = 'chapter-canvas grove-tree';
    ctx.canvas.after(treeCanvas);
    cloudCtx = subCtx(ctx, ctx.canvas, { high: true });
    treeCtx = subCtx(ctx, treeCanvas, { transparentSky: true });
    cloud.mount(el, cloudCtx);
    tree.mount(el, treeCtx);
    // the two modules style themselves by their old ids; point those rules at this section
    el.querySelectorAll('style').forEach((st) => { st.textContent = st.textContent.replace(/#cloud\b|#tree\b/g, '#grove'); });
    // one copy column: the sky's headline, with the tree's readout beneath it
    const bodies = el.querySelectorAll('.chapter-body');
    if (bodies.length === 2) {
      const stage = bodies[1].querySelector('.stage-wrap');
      if (stage) bodies[0].querySelector('h2').after(stage);
      bodies[1].remove();
    }
    el.insertAdjacentHTML('beforeend', `<style>
      #grove .grove-tree { z-index: 0; }
      #grove .stage-wrap { margin: 10px 0 0; }
    </style>`);
  },
  tick(dt, breath) {
    cloud.tick(dt, breath, cloudCtx);
    tree.tick(dt, breath, treeCtx);
  },
  resize(ctx) {
    cloudCtx.resize(); treeCtx.resize();
    cloud.resize?.(cloudCtx); tree.resize?.(treeCtx);
  },
  unmount() { cloud.unmount?.(); tree.unmount?.(); },
};
