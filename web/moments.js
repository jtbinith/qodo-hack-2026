// Moments and kinds (wireframes 2B.1, 2B.2, 2B.4, 2B.5)
export const GAP = 20 * 60000;   // a pause this long starts a new moment

export const kindOf = (p) => (p.text ? 'text' : p.type?.startsWith('image/') ? 'photos' : p.type?.startsWith('video/') ? 'videos' : 'files');
export const KINDS = ['photos', 'videos', 'files', 'text'];
export function kindCounts(list) {
  const c = {}; for (const p of list) { const k = kindOf(p); c[k] = (c[k] || 0) + 1; }
  return Object.fromEntries(KINDS.filter((k) => c[k]).map((k) => [k, c[k]]));
}

// newest first, split wherever the gap between two is GAP or more. Items without a time (from an older
// device) go in their own moment at the end, "Earlier", so they can't stretch or erase the timed ones
export function moments(list) {
  const timed = list.filter((p) => typeof p.at === 'number').sort((a, b) => b.at - a.at), untimed = list.filter((p) => typeof p.at !== 'number');
  const out = [];
  for (const p of timed) {
    const last = out[out.length - 1];
    if (last && last.from - p.at < GAP) { last.items.push(p); last.from = p.at; }
    else out.push({ from: p.at, to: p.at, items: [p] });
  }
  if (untimed.length) out.push({ from: undefined, to: undefined, items: untimed });
  return out;
}
// "Thu 19:02 – 19:40", in this device's language and time zone unless asked otherwise
export function momentLabel({ from, to }, locale, timeZone) {
  if (from === undefined) return 'Earlier';
  const o = { timeZone }, day = new Intl.DateTimeFormat(locale, { ...o, weekday: 'short' }).format(from);
  const hm = (t) => new Intl.DateTimeFormat(locale, { ...o, hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  return from === to || hm(from) === hm(to) ? `${day} ${hm(from)}` : `${day} ${hm(from)} – ${hm(to)}`;
}
