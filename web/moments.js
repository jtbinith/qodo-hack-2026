// Moments and kinds (wireframes 2B.1, 2B.2, 2B.4, 2B.5)
export const GAP = 20 * 60000;   // a pause this long starts a new moment

export const kindOf = (p) => (p.text ? 'text' : p.type?.startsWith('image/') ? 'photos' : p.type?.startsWith('video/') ? 'videos' : 'files');
export const KINDS = ['photos', 'videos', 'files', 'text'];
export function kindCounts(list) {
  const c = {}; for (const p of list) { const k = kindOf(p); c[k] = (c[k] || 0) + 1; }
  return Object.fromEntries(KINDS.filter((k) => c[k]).map((k) => [k, c[k]]));
}

// newest first, split wherever the gap between two is GAP or more. Items without a time go in the newest moment
export function moments(list) {
  const sorted = [...list].sort((a, b) => (b.at ?? Infinity) - (a.at ?? Infinity));
  const out = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && (p.at === undefined || last.from === undefined || last.from - p.at < GAP)) { last.items.push(p); if (p.at !== undefined) last.from = Math.min(last.from ?? p.at, p.at); }
    else out.push({ from: p.at, to: p.at, items: [p] });
  }
  return out;
}
// "Thu 19:02 – 19:40", in this device's language and time zone unless asked otherwise
export function momentLabel({ from, to }, locale, timeZone) {
  if (from === undefined) return 'Earlier';
  const o = { timeZone }, day = new Intl.DateTimeFormat(locale, { ...o, weekday: 'short' }).format(from);
  const hm = (t) => new Intl.DateTimeFormat(locale, { ...o, hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  return from === to || hm(from) === hm(to) ? `${day} ${hm(from)}` : `${day} ${hm(from)} – ${hm(to)}`;
}
