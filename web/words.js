// Words on the live table (wireframe 2A.1): the heap's name, the line under it and the initials on the avatars
export const heapTitle = (leader) => (leader ? `${leader}’s heap` : 'Your heap');
export const heapSub = (here, shared) => `${here} here · ${shared} shared`;
export const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((w) => [...w][0].toLocaleUpperCase()).join('') : '?';
};
