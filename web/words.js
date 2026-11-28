// Words on the live table (wireframe 2A.1): the heap's name, the line under it and the initials on the avatars
export const heapTitle = (leader) => (leader ? `${leader}’s heap` : 'Your heap');
export const heapSub = (here, shared) => `${here} here · ${shared} shared`;
export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((w) => [...w][0].toLocaleUpperCase()).join('') : '?';
};
// a drop landing on this screen (2A.4, 2A.6, 3.6): how many from whom, how far along, and whether it's going the slow way
export function batchLine({ n, k, who, relay }) {
  const what = `${n} photo${n === 1 ? '' : 's'} from ${who}`;
  if (k >= n) return n === 1 ? what : `${what} ✓`;
  return [what, ...(n > 1 ? [`${k} of ${n}`] : []), ...(relay ? ['through relay'] : [])].join(' · ');
}
