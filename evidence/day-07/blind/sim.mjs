// Fake clock + fake Supabase channel; drives the real net.js leader logic.
let T = 0; const timers = new Map(); let tid = 1;
globalThis.performance = { timeOrigin: 0, now: () => T };
globalThis.setTimeout = (f, ms) => { const id = tid++; timers.set(id, { at: T + ms, f }); return id; };
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
function advance(to) { for (;;) { let n = null; for (const [id, t] of timers) if (t.at <= to && (!n || t.at < n[1].at)) n = [id, t]; if (!n) break; timers.delete(n[0]); T = n[1].at; n[1].f(); } T = to; }
const handlers = {}; const sent = [];
const ch = { on(type, f, h) { handlers[type + ':' + (f.event)] = h; return ch; }, send(m) { sent.push({ t: T, ...m }); },
  presenceState: () => ({ L: [{ name: 'lap', w: 1440, h: 900, joinedAt: 1 }], A: [{ name: 'a', w: 400, h: 800, joinedAt: 2 }], B: [{ name: 'b', w: 400, h: 800, joinedAt: 3 }], C: [{ name: 'c', w: 400, h: 800, joinedAt: 4 }] }),
  subscribe() {}, track() {} };
globalThis.window = { supabase: { createClient: () => ({ channel: () => ch, removeChannel() {} }) } };
const { joinRoom } = await import('./src/net.js');
export function setup() { T = 0; timers.clear(); sent.length = 0; const s = joinRoom({ room: 'r', id: 'L', name: 'lap', size: { w: 1440, h: 900 } }); handlers['presence:sync'](); sent.length = 0; return s; }
export const push = (p) => handlers['broadcast:push']({ payload: p });
export { advance, sent };
export const now = () => T;
