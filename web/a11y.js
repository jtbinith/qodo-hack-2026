// Accessibility (wireframes 6.1–6.7): what a screen reader says for each deck, the spoken updates,
// the decks as a list, and the laptop's keyboard shortcuts
const SIDE = { R: 'on the right', L: 'on the left', T: 'above you', B: 'below you' };
const photos = (n) => `${n} photo${n === 1 ? '' : 's'}`;

// 6.1: "Ada's deck, 34 photos, Ada is next to you on the right."
export function deckLabel({ mine, name, n, side }) {
  const whose = mine ? 'Your deck' : `${name}’s deck`;
  const where = !mine && side ? `, ${name} is next to you ${SIDE[side]}` : '';
  return `${whose}, ${photos(n)}${where}.`;
}

// 6.5: the decks as rows: who, how many, and where they are
export function deckRow({ mine, name, n, side, kind = 'phone' }) {
  return { title: mine ? `Your photos · ${n}` : `${name} · ${n}`, where: mine ? `On this ${kind}` : side ? `Next to you, ${({ R: 'right', L: 'left', T: 'above', B: 'below' })[side]}` : 'Across the room' };
}

// 6.4: spoken updates
export const say = {
  joined: (device, side) => `Joined with ${device}${side ? `, ${({ R: 'on your right', L: 'on your left', T: 'above you', B: 'below you' })[side]}` : ''}.`,
  sent: (name, n) => `${name} sent you ${photos(n)}.`,
  getting: (k, n) => `Getting ${photos(n)}. ${k} of ${n}.`,
  ready: (n) => (n === 1 ? '1 photo checked and ready to save.' : `All ${n} photos checked and ready to save.`),
  left: (device) => `${device} left the heap.`,
};
// progress is said at most at each quarter, so a long download isn't read out piece by piece
export const progressStep = (k, n) => (n > 1 && k < n ? Math.floor((4 * k) / n) : -1);

// 6.7: the laptop's keyboard shortcuts, in the order the list shows them
export const SHORTCUTS = [
  ['Tab / Shift+Tab', 'Move between decks and buttons'],
  ['Arrow keys', 'Move between photos in a deck'],
  ['Enter', 'Open a deck or photo'],
  ['Space', 'Pick or unpick'],
  ['S', 'Send to…'],
  ['M', 'Open the map'],
  ['G', 'Get picked'],
  ['Esc', 'Cancel a drag or close'],
  ['?', 'Show this list'],
];
// what a key does on the table (not while typing): 'send', 'map', 'get', 'help', 'close' or null
export function keyAction(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
  if (e.key === 'Escape') return 'close';
  if (typing) return null;
  return ({ s: 'send', S: 'send', m: 'map', M: 'map', g: 'get', G: 'get', '?': 'help' })[e.key] || null;
}
// arrow keys in a grid of tiles: the next index, kept inside the list
export function gridMove(key, i, n, cols) {
  const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key];
  if (d === undefined) return i;
  return Math.min(n - 1, Math.max(0, i + d));
}
// arrow keys by where the tiles really are (moments start new rows): the nearest tile that way, or stay
export function nextByRect(rects, i, key) {
  const c = rects[i]; if (!c) return i;
  const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
  let best = i, score = Infinity;
  rects.forEach((r, j) => {
    if (j === i) return;
    const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, dx = x - cx, dy = y - cy;
    const ok = key === 'ArrowRight' ? dx > 1 && Math.abs(dy) < (c.bottom - c.top) / 2 : key === 'ArrowLeft' ? dx < -1 && Math.abs(dy) < (c.bottom - c.top) / 2
      : key === 'ArrowDown' ? dy > 1 : key === 'ArrowUp' ? dy < -1 : false;
    if (!ok) return;
    const along = key === 'ArrowDown' || key === 'ArrowUp' ? Math.abs(dy) * 4 + Math.abs(dx) : Math.abs(dx);
    if (along < score) { score = along; best = j; }
  });
  return best;
}
