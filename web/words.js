// Words on the live table (wireframe 2A.1): the heap's name, the line under it and the initials on the avatars
export const heapTitle = (leader) => (leader ? `${leader}’s heap` : 'Your heap');
export const heapSub = (here, shared) => `${here} here · ${shared} shared`;
export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((w) => [...w][0].toLocaleUpperCase()).join('') : '?';
};
// a drop landing on this screen (2A.4, 2A.6, 3.6): how many from whom, how far along, and whether it's going the slow way
export function batchLine({ n, k, lost = 0, who, relay }) {
  const what = `${n} photo${n === 1 ? '' : 's'} from ${who}`;
  if (k >= n) return n === 1 ? what : `${what} ✓`;
  if (k + lost >= n) return `${what} · ${lost} didn’t come`;   // the rest stopped, or were never asked for
  return [what, ...(n > 1 ? [`${k} of ${n}`] : []), ...(relay ? ['through relay'] : [])].join(' · ');
}
// which drop the line shows (2A.6, 3.6): the latest still arriving, so its Stop isn't lost to a later one; else the latest.
// k: here; lost: neither here nor on the way (it gave up, or there wasn't room to ask); done: nothing left on the way
export function landingState(batches, has, coming) {
  const of = (b) => { const k = b.pids.filter(has).length, lost = b.pids.filter((p) => !has(p) && !coming(p)).length; return { b, k, lost, done: k + lost >= b.pids.length }; };
  const all = batches.map(of);
  return all.filter((x) => !x.done).at(-1) || all.at(-1) || null;
}
// ending a heap (2D.11, 2D.12): everyone gets this long to save, shown as m:ss
export const END_GRACE = 5 * 60000;
export const countdown = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
