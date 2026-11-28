// Picking (wireframes 2B.3–2B.6): what's picked, how big and from whom, and what Get still has to ask for
export const mb = (bytes) => { const m = bytes / 1e6; if (m > 0 && m < 0.05) return '< 0.1 MB'; return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} MB`; };

// nameOf(owner) gives a person's name; my own photos count as "you"
export function pickSummary(prints, picked, nameOf, me) {
  let n = 0, bytes = 0; const by = new Map();
  for (const pid of picked) {
    const p = prints.get(pid); if (!p) continue;
    n++; bytes += p.size || 0;
    const who = p.owner === me ? 'you' : nameOf(p.owner) || 'someone';
    by.set(who, (by.get(who) || 0) + 1);
  }
  return { n, bytes, from: [...by].sort((a, b) => b[1] - a[1]) };
}
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const pickLine = (s) => `${mb(s.bytes)} · from ${list(s.from.map(([w, k]) => `${w} (${k})`))} · stays only on this device`;

// picked photos that aren't mine, aren't here and aren't already on their way
export const toFetch = (prints, picked, files, incoming, me) =>
  [...picked].map((k) => prints.get(k)).filter((p) => p && p.owner !== me && !files.has(p.pid) && !incoming.has(p.pid));
