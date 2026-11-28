// The map (wireframes 2C.1–2C.8): every screen in the heap drawn roughly to its real size,
// my group where its edges touch, and the screens that aren't joined to me in a column beside it

// a phone, tablet or laptop, by the screen's size
export function deviceKind({ w, h }) {
  if (Math.min(w, h) < 500) return 'phone';
  return h > w || w < 1000 ? 'tablet' : 'laptop';
}
const inGroup = (layout, k, me) => (layout.group[k] || k) === (layout.group[me] || me);

// tiles fitted into box { w, h }: [{ id, x, y, w, h, joined }]
export function mapTiles(ids, layout, sizes, me, box, gap = 16, label = 14) {
  const joined = ids.filter((k) => sizes[k] && inGroup(layout, k, me)), apart = ids.filter((k) => sizes[k] && !inGroup(layout, k, me));
  const pos = (k) => layout.pos[k] || [0, 0];
  const x0 = Math.min(...joined.map((k) => pos(k)[0])), y0 = Math.min(...joined.map((k) => pos(k)[1]));
  const W0 = Math.max(...joined.map((k) => pos(k)[0] + sizes[k].w)) - x0, H0 = Math.max(...joined.map((k) => pos(k)[1] + sizes[k].h)) - y0;
  const colW = apart.length ? Math.max(...apart.map((k) => sizes[k].w)) : 0;
  const colH = apart.reduce((a, k) => a + sizes[k].h, 0);
  // many screens not joined: the gaps between them shrink first, so every tile still fits the column
  if (apart.length > 1) gap = Math.min(gap, Math.max(1, (box.h - label) / (apart.length * 3)));
  const s = Math.max(1e-4, Math.min((box.w - (apart.length ? gap : 0)) / (W0 + colW),
    box.h / H0, apart.length ? (box.h - label - gap * (apart.length - 1)) / Math.max(1, colH) : Infinity));
  const out = joined.map((k) => ({ id: k, x: (pos(k)[0] - x0) * s, y: (pos(k)[1] - y0) * s, w: sizes[k].w * s, h: sizes[k].h * s, joined: true }));
  let y = label;
  for (const k of apart) { out.push({ id: k, x: W0 * s + gap, y, w: sizes[k].w * s, h: sizes[k].h * s, joined: false }); y += sizes[k].h * s + gap; }
  return out;
}

// the screens touching mine: which side, and the middle of the shared part (in my screen's pixels)
export function edgeLabels(ids, layout, sizes, me) {
  const [mx, my] = layout.pos[me] || [0, 0], { w: mw, h: mh } = sizes[me], out = [];
  for (const k of ids) {
    if (k === me || !sizes[k] || !inGroup(layout, k, me)) continue;
    const [ox, oy] = layout.pos[k] || [0, 0], { w: ow, h: oh } = sizes[k];
    const v = [Math.max(my, oy), Math.min(my + mh, oy + oh)], hz = [Math.max(mx, ox), Math.min(mx + mw, ox + ow)];
    const side = Math.abs(ox - (mx + mw)) < 2 && v[1] > v[0] ? 'R' : Math.abs(ox + ow - mx) < 2 && v[1] > v[0] ? 'L'
      : Math.abs(oy - (my + mh)) < 2 && hz[1] > hz[0] ? 'B' : Math.abs(oy + oh - my) < 2 && hz[1] > hz[0] ? 'T' : null;
    if (!side) continue;
    const along = side === 'R' || side === 'L' ? (v[0] + v[1]) / 2 - my : (hz[0] + hz[1]) / 2 - mx;
    out.push({ id: k, side, along });
  }
  return out;
}

// Arrange screens (4.7): put screen a on one side of screen b, lined up in the middle of the shared edge
const EDGES = { below: ['T', 'B'], above: ['B', 'T'], left: ['R', 'L'], right: ['L', 'R'] };
export function proposeJoin(a, b, side, sizes) {
  const [edgeA, edgeB] = EDGES[side], len = (k, e) => (e === 'L' || e === 'R' ? sizes[k].h : sizes[k].w);
  return { a, b, edgeA, edgeB, alongA: len(a, edgeA) / 2, alongB: len(b, edgeB) / 2 };
}
export const sideWords = (side) => ({ below: 'below', above: 'above', left: 'on the left of', right: 'on the right of' })[side];
// which side of tile t a screen dropped at pt goes on (4.7, dragging on the map), by how far off-centre it is
export function dropSide(pt, t) {
  const dx = (pt.x - (t.x + t.w / 2)) / t.w, dy = (pt.y - (t.y + t.h / 2)) / t.h;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'below' : 'above');
}
