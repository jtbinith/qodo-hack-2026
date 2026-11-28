// Who is in the heap (wireframes 1.5–1.7): names are unique, the host lets people in.
// Until let in, a device gets nothing: no photos, no thumbnails, and its asks are ignored.

// one key per name, so nobody can pass as someone else: case, spaces, fancy and look-alike letters fold together
const LOOK = { 0: 'o', 1: 'i', l: 'i', 3: 'e', 5: 's', 7: 't', 8: 'b' };
export const nameKey = (n) => String(n || '').normalize('NFKC').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/\s+/g, ' ').trim().replace(/[0-9l]/g, (c) => LOOK[c] || c);

// the name of someone who had my name first (joined earlier; at the same moment, the smaller id), or null
export function nameTaken(me, peers) {
  const mine = peers[me]; if (!mine) return null;
  for (const [k, p] of Object.entries(peers)) {
    if (k === me || nameKey(p.name) !== nameKey(mine.name)) continue;
    if (p.joinedAt < mine.joinedAt || (p.joinedAt === mine.joinedAt && k < me)) return p.name;
  }
  return null;
}

// ctx: { leader, admits: { open, ids, names, no }, peers }
export function isIn(k, { leader, admits, peers }) {
  if (k === leader || admits.open || admits.ids.includes(k)) return true;
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
export function trimAdmits(a, peers) {
  const here = (k) => Object.hasOwn(peers, k);
  return { open: a.open, ids: uniqLast(a.ids.filter(here)), names: uniqLast(a.names).slice(-200), no: uniqLast(a.no.filter(here)) };
}
