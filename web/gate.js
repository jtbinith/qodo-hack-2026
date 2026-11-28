// Who is in the heap (wireframes 1.5–1.7): names are unique, the host lets people in.
// Until let in, a device gets nothing: no photos, no thumbnails, and its asks are ignored.

// one key per name, so nobody can pass as someone else: case, spaces, fancy and look-alike letters fold together
const LOOK = { 0: 'o', 1: 'i', l: 'i', 3: 'e', 5: 's', 7: 't', 8: 'b' };
export const nameKey = (n) => String(n || '').normalize('NFKC').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/\s+/g, ' ').trim().replace(/[0-9l]/g, (c) => LOOK[c] || c);

// the name of someone who had my name first (joined earlier; at the same moment, the smaller id), or null.
// `before`: this tab's ids before a reload, which can linger in the room for a moment and aren't someone else
export function nameTaken(me, peers, before = []) {
  const mine = peers[me]; if (!mine) return null;
  for (const [k, p] of Object.entries(peers)) {
    if (k === me || before.includes(k) || nameKey(p.name) !== nameKey(mine.name)) continue;
    if (p.joinedAt < mine.joinedAt || (p.joinedAt === mine.joinedAt && k < me)) return p.name;
  }
  return null;
}

// ctx: { leader, admits: { open, ids, names, no }, peers }
export function isIn(k, { leader, admits, peers }) {
  if (k === leader) return true;
  if (admits.no.includes(k)) return false;   // turned away or removed stays out, even when everyone else is let in (Qodo on #163)
  if (admits.open || admits.ids.includes(k)) return true;
  return !!peers[k] && admits.names.includes(nameKey(peers[k].name));
}
export const waitingFor = (ctx) => Object.keys(ctx.peers).filter((k) => !isIn(k, ctx) && !ctx.admits.no.includes(k));

// first come, first in (1.9): is this device after the first `limit` to join? Same moment: the smaller id is first
export function overLimit(me, peers, limit) {
  const order = Object.entries(peers).sort(([a, p], [b, q]) => (p.joinedAt - q.joinedAt) || (a < b ? -1 : 1)).map(([k]) => k);
  return order.indexOf(me) >= limit;
}
// the list stays small: ids only for devices still here (a reload is a new id), no repeats, the latest 200 names
const uniqLast = (xs) => xs.filter((x, i) => xs.lastIndexOf(x) === i);
// `me` (the host) stays even if the room doesn't list it yet, or adding it would never settle (Qodo re-review of #162)
export function trimAdmits(a, peers, me = null) {
  const here = (k) => k === me || Object.hasOwn(peers, k);
  return { open: a.open, ids: uniqLast(a.ids.filter(here)), names: uniqLast(a.names).slice(-200), no: uniqLast(a.no.filter(here)), ...(a.ended ? { ended: a.ended } : {}) };   // an ended heap stays ended
}
// "Let everyone in without asking" (1.7) is remembered per heap: the codes of the latest 20. '1' (set only by the
// device check, never by a tap) opens every heap this device hosts
export const openFor = (stored, room) => stored === '1' || String(stored || '').split(',').includes(room);
export function rememberOpen(stored, room) {
  if (stored === '1') return stored;
  const codes = String(stored || '').split(',').filter((c) => c && c !== room);
  return [...codes, room].slice(-20).join(',');
}
// Leave and clear (5.8): this heap's code goes from the list too
export function forgetOpen(stored, room) {
  if (stored === '1') return stored;
  return String(stored || '').split(',').filter((c) => c && c !== room).join(',');
}
