// Flicks (wireframes 2A.3, 2A.8): a photo let go while moving glides on, slowing down.
// It lands on the last screen it crossed, so a strong flick can't slide past the screen it was aimed at.
export const MAX_SPEED = 3;   // px per ms
export const TAU = 220;       // ms: how quickly a glide slows down; it travels speed × TAU in all

// speed from the drag's last 80 ms: [{ x, y, t }] in screen pixels and ms
export function velocity(samples) {
  const last = samples[samples.length - 1];
  const first = last && samples.find((s) => last.t - s.t <= 80);
  if (!first || first === last || last.t === first.t) return { vx: 0, vy: 0 };
  let vx = (last.x - first.x) / (last.t - first.t), vy = (last.y - first.y) / (last.t - first.t);
  const v = Math.hypot(vx, vy);
  if (v > MAX_SPEED) { vx *= MAX_SPEED / v; vy *= MAX_SPEED / v; }
  return { vx, vy };
}

// where a glide that started at x, y with speed vx, vy is after t ms
export function glideAt({ x, y, vx, vy }, t) {
  const k = TAU * (1 - Math.exp(-t / TAU));
  return { x: x + vx * k, y: y + vy * k, done: t >= 5 * TAU };
}

// points: where it was along the way, in order. on(point) gives the screen under it, or null.
// If it ends off every screen, it lands at its last point on another screen it crossed; if it
// never reached another screen, there's no screen there (on: null) and it comes back
export function landing(points, on) {
  const end = points[points.length - 1], start = on(points[0]);
  const endOn = on(end);
  if (endOn) return { at: end, on: endOn };
  let lastOther = null, lastAny = points[0];
  for (const pt of points) { const s = on(pt); if (s) { lastAny = pt; if (s !== start) lastOther = { at: pt, on: s }; } }
  return lastOther || { at: lastAny, on: null };
}
