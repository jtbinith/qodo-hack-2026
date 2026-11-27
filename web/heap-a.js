// The "a" of heap: a glyph that reaches a droplet toward the pointer, then pulls it back in.
// Ported from the component lab (section 28). Shapes are signed distance fields in a 164 x 164 box.
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const segD = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(wx - vx * t, wy - vy * t); };
export function field(G, x, y) {
  let d = 1e9;
  for (const [cx, cy, r] of G.dots) d = smin(d, Math.hypot(x - cx, y - cy) - r, G.k);
  for (const [ax, ay, bx, by, r] of G.bonds) d = smin(d, segD(x, y, ax, ay, bx, by) - r, G.k);
  for (const [cx, cy, r] of G.holes) d = smax(d, -(Math.hypot(x - cx, y - cy) - r), 6);
  return d;
}
export const A_GLYPH = { dots: [[76, 92, 36]], bonds: [[112, 58, 112, 126, 10]], holes: [[76, 92, 15]], k: 10 };

// Draws G on the canvas in `colour` (filling `fill` of it, nudged down by `dy`), with a drop that reaches toward the pointer when it's within `near` box units.
export function reacher(cv, G, { colour = '#000', reach = 55, near = 330, dropR = 9, fill = 0.5, dy = 0.06 } = {}) {
  const ctx = cv.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ptr = null, drop = null, dropr = 0, raf = 0, size = 0, scale = 1, ox = 0, oy = 0;
  // fit the glyph's own outline to the canvas, as the lab does
  const xs = [], ys = [];
  for (const [x, y, r] of G.dots) xs.push(x - r, x + r), ys.push(y - r, y + r);
  for (const [ax, ay, bx, by, r] of G.bonds) xs.push(ax - r, bx - r, ax + r, bx + r), ys.push(ay - r, by - r, ay + r, by + r);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let cx = 0, cy = 0, w = 0;
  for (const [x, y, r] of G.dots) { cx += x * r; cy += y * r; w += r; }
  cx /= w; cy /= w; drop = [cx, cy];
  const [cr, cg, cb] = colour.match(/\w\w/g).map((h) => parseInt(h, 16));
  const fit = () => { const r = cv.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2); size = Math.max(8, Math.round(Math.min(r.width, r.height) * d));
    cv.width = cv.height = size; scale = (size * fill) / Math.max(x1 - x0, y1 - y0);   // the glyph takes `fill` of the canvas; the rest is room to reach
    ox = size / 2 - ((x0 + x1) / 2) * scale; oy = size * (0.5 + dy) - ((y0 + y1) / 2) * scale; };
  const draw = () => {
    const img = ctx.createImageData(size, size), px = img.data, aa = 1 / scale;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - ox) / scale, y = (j + 0.5 - oy) / scale;
      let d = field(G, x, y);
      if (dropr > 0.3) d = smin(d, Math.hypot(x - drop[0], y - drop[1]) - dropr, 26);
      const a = Math.max(0, Math.min(1, 0.5 - d / aa));
      if (a) { const k = (j * size + i) * 4; px[k] = cr; px[k + 1] = cg; px[k + 2] = cb; px[k + 3] = a * 255; }
    }
    ctx.putImageData(img, 0, 0);
  };
  const tick = () => {
    raf = 0;
    let tx = cx, ty = cy, tr = 0;
    if (ptr && !calm) {
      const r = cv.getBoundingClientRect(), d = cv.width / r.width;
      const bx = ((ptr[0] - r.left) * d - ox) / scale, by = ((ptr[1] - r.top) * d - oy) / scale;
      const dx = bx - cx, dy = by - cy, L = Math.hypot(dx, dy);
      if (L < near && L > 1) { const k = Math.min(L, reach) / L; tx = cx + dx * k; ty = cy + dy * k; tr = dropR; }
    }
    const nx = drop[0] + (tx - drop[0]) * 0.1, ny = drop[1] + (ty - drop[1]) * 0.1, nr = dropr + (tr - dropr) * 0.1;
    const moved = Math.abs(nx - drop[0]) + Math.abs(ny - drop[1]) + Math.abs(nr - dropr) > 0.03;
    drop = [nx, ny]; dropr = nr;
    if (moved) { draw(); raf = requestAnimationFrame(tick); }
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('pointermove', (e) => { ptr = [e.clientX, e.clientY]; wake(); }, { passive: true });
  addEventListener('resize', () => { fit(); draw(); });
  fit(); draw();
  return { stop: () => cancelAnimationFrame(raf) };
}
