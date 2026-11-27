// Decks (wireframe 2A.1): one person's photos at one spot on the table are one stack.
// `prints` is a Map in stacking order (the last is on top), so the deck holding the most
// recently stacked photo comes last and is drawn on top.
export function groupDecks(prints) {
  const decks = new Map();
  for (const p of prints.values()) {
    const k = `${p.owner}|${p.anchor}|${p.x}|${p.y}`;
    let d = decks.get(k);
    if (d) decks.delete(k);
    else d = { key: k, owner: p.owner, anchor: p.anchor, x: p.x, y: p.y, pids: [] };
    d.pids.push(p.pid); d.top = p; decks.set(k, d);
  }
  return [...decks.values()];
}

// Where my next photo goes: on my deck if it's on my screen, else the first spot on my
// screen clear of every other deck there (and clear of the header and the bottom bar)
const CARD = 150, TOP = 140, BOTTOM = 240, CLEAR = 120;   // below the header and the All photos chip
export function deckSpot(prints, me, { w, h }) {
  const mine = groupDecks(prints).filter((d) => d.owner === me && d.anchor === me).pop();
  if (mine) return { x: mine.x, y: mine.y };
  const here = [...prints.values()].filter((p) => p.anchor === me);
  const maxX = Math.max(24, w - CARD - 24), maxY = Math.max(TOP, h - CARD - BOTTOM);
  for (let y = TOP; y <= maxY; y += 60) for (let x = 24; x <= maxX; x += 60)
    if (here.every((p) => Math.hypot(p.x - x, p.y - y) >= CLEAR)) return { x, y };
  return { x: 24, y: TOP };
}
