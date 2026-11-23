// Room networking over Supabase Realtime: who is here, a shared clock, and joins.
// The server only relays messages. One device (the earliest to arrive) is the "time
// keeper": everyone syncs their clock to it, and it decides which orb pushes pair up.
import { addJoins, matchPushes, isValidJoins } from './layout.js';
import { validPeerMeta, validPing, validPong, validJoined, validRetry, validNoMatch, validSignal, validLayoutAsk, inRoom } from './check.js';

const SUPABASE_URL = 'https://aimoujzdcaxkejraattw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_D8DGNTiXWHRFaoE2ae3ACg_8G8Y_yDS'; // public by design

const WINDOW = 2000; // two pushes this close in time can pair (ms)
const LAYOUT_GAP = 1000; // the time keeper answers layout asks at most once in this long (ms)
// A device that asked for the layout asks again about every ASK_EVERY (jittered, never sooner
// than LAYOUT_GAP) until the time keeper's layout arrives, at most ASK_TRIES asks in all
const ASK_EVERY = 2000, ASK_TRIES = 5;
// Connection setup is used only from devices in the room (S1.6). A device that has just joined
// can send setup before this device's presence lists it, so setup from an id not in the room is
// held: at most EARLY_SIG_HOLD messages and EARLY_SIG_BYTES (as UTF-8 JSON) from each of at most
// EARLY_SIG_SENDERS ids, for at most EARLY_SIG_TTL ms. It's passed on if presence lists the sender
// in time and dropped otherwise. A message that doesn't fit is dropped and takes no slot. Real
// early setup is a key, an offer and a few candidates; a relay frame can't be early (S1.6)
export const EARLY_SIG_HOLD = 30, EARLY_SIG_SENDERS = 8, EARLY_SIG_TTL = 5000, EARLY_SIG_BYTES = 32 * 1024;
const utf8 = new TextEncoder();
const wall = () => performance.timeOrigin + performance.now();

// `onSignal` (optional) receives messages sent with s.signal(to, data): a lane for
// pages that set up direct device-to-device connections. Only the addressee handles them.
export function joinRoom({ room, id, name, size, onSignal }) {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const ch = client.channel('stitch:' + room, { config: { broadcast: { self: false }, presence: { key: id } } });
  const joinedAt = wall();
  const s = {
    id, name, room, status: 'connecting',
    peers: {},            // id -> { name, w, h, joinedAt }
    leader: null,
    offset: 0, rtt: null, samples: [],
    joins: [],
    listeners: new Set(),
    now: () => wall() + s.offset,   // shared clock (ms)
  };
  const emit = (ev, data) => s.listeners.forEach((f) => f(ev, data));
  const send = (event, payload) => ch.send({ type: 'broadcast', event, payload });
  const earlyLayouts = new Map();   // device id -> the latest layout it sent while it wasn't this device's time keeper (#61)
  const earlySigs = new Map();      // id not yet in the room -> { list: setup it sent, timer } (S1.6)

  function electLeader() {
    const all = Object.entries(s.peers).sort(([a, p], [b, q]) => (p.joinedAt - q.joinedAt) || (a < b ? -1 : 1));
    const prev = s.leader;
    s.leader = all.length ? all[0][0] : id;
    if (s.leader === id) { s.offset = 0; s.rtt = 0; }
    if (prev !== s.leader) {
      s.samples = []; emit('leader', s.leader);
      stopAsking();   // an ask to the old time keeper is over
      // a layout the new time keeper sent before this device heard it took over (#61). It is
      // checked again against who is here now, and used only if it still passes
      const early = earlyLayouts.get(s.leader);
      earlyLayouts.clear();
      if (s.leader === id) sendLayout();
      else if (early && isValidJoins(early, [...Object.keys(s.peers), id])) { s.joins = early; emit('layout'); }
      // Nothing usable was kept: a late layout from the old time keeper may have replaced it
      // (Qodo on #95). Ask the new time keeper to send its layout again. On a first election
      // there's no need: the time keeper sends its layout when it hears this device arrive
      else if (prev !== null) ask(s.leader, ASK_TRIES);
    }
  }
  // The room server can drop the ask or its answer (Qodo on #95), so the ask is sent again until
  // the time keeper's layout arrives, the time keeper changes or this device leaves. It gives up
  // after ASK_TRIES: the time keeper still sends its layout on its next presence update or join
  let askTimer = null;
  function stopAsking() { clearTimeout(askTimer); askTimer = null; }
  function ask(to, tries) {
    stopAsking();
    send('layoutask', { from: id, to });
    if (tries > 1) askTimer = setTimeout(() => { askTimer = null; if (s.leader === to) ask(to, tries - 1); },
      Math.max(LAYOUT_GAP, ASK_EVERY * (0.75 + Math.random() / 2)));   // not a secret: Math.random is fine (Rule 2)
  }

  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    s.peers = {};
    for (const [key, metas] of Object.entries(st)) {
      const m = metas[metas.length - 1];
      if (!validPeerMeta(m)) continue;                        // a device that describes itself badly isn't counted
      s.peers[key] = { name: m.name, w: m.w, h: m.h, joinedAt: m.joinedAt };
    }
    // forget joins to devices that have left, so layouts never mention absent devices
    s.joins = s.joins.filter((j) => s.peers[j.a] && s.peers[j.b]);
    for (const k of earlyLayouts.keys()) if (!s.peers[k]) earlyLayouts.delete(k);   // nothing kept from devices that have left
    electLeader();
    if (s.leader === id) sendLayout();
    emit('peers', s.peers);
    // setup held from a device that has now arrived is passed on, in the order it came (S1.6)
    for (const [from, held] of earlySigs) {
      if (!inRoom(s.peers, from) || from === id) continue;
      clearTimeout(held.timer); earlySigs.delete(from);
      for (const data of held.list) onSignal(from, data);
    }
  });

  // --- clock sync: NTP-style ping/pong with the time keeper ---
  ch.on('broadcast', { event: 'ping' }, ({ payload }) => {
    if (validPing(payload) && s.leader === id && payload.to === id) send('pong', { to: payload.from, t0: payload.t0, t1: s.now() });
  });
  ch.on('broadcast', { event: 'pong' }, ({ payload }) => {
    if (!validPong(payload) || payload.to !== id) return;
    const t2 = wall(), rtt = t2 - payload.t0;
    s.samples.push({ rtt, off: payload.t1 - (payload.t0 + t2) / 2 });
    if (s.samples.length > 30) s.samples.shift();
    // trust the quickest round trips: the less time on the wire, the less room for error
    const best = [...s.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 5);
    const offs = best.map((x) => x.off).sort((a, b) => a - b);
    s.offset = offs[offs.length >> 1];
    s.rtt = best[0].rtt;
    emit('clock');
  });
  let pings = 0;
  const pingTimer = setInterval(() => {
    if (s.status !== 'live' || !s.leader || s.leader === id) return;
    if (pings++ > 20 && pings % 4) return; // fast at first, then every 2 s
    send('ping', { from: id, to: s.leader, t0: wall() });
  }, 500);

  // --- orb pushes and joins (decided by the time keeper) ---
  // The time keeper collects a burst of pushes and solves them together once nobody
  // has pushed for a moment.
  // Pushes come from the network, so they're checked and capped: a device must be in the
  // room, the push must fit its screen and be recent, each device keeps at most 2 pending
  // pushes, a batch holds at most 8 (the pairing search grows fast), and a batch is solved
  // no later than 2.5 s after it starts even if pushes keep arriving.
  const EDGES = { L: 1, R: 1, T: 1, B: 1 }, MAX_BATCH = 8, PER_DEV = 2, DEADLINE = 2500;
  // A device that pushed gives up on that push by itself if no result names it, because the
  // time keeper can drop a push without a reply. Each push waits on its own, keyed by its time. In a busy room the time keeper can decide up to
  // WINDOW + DEADLINE after the first push of a burst, so the wait outlasts that, plus a
  // margin for the network (#68).
  const NET_MARGIN = 1000, NO_MATCH_AFTER = WINDOW + DEADLINE + NET_MARGIN;
  let pushes = [], burstTimer = null, burstStart = 0;
  const waits = new Map();   // the time of each of this device's pushes -> its no-match timer
  let latest = null;          // the time of this device's latest push
  function validPush(p) {
    const peer = p && s.peers[p.dev];
    if (!peer || !EDGES[p.edge] || !Number.isFinite(p.along) || !Number.isFinite(p.t)) return false;
    const len = p.edge === 'L' || p.edge === 'R' ? peer.h : peer.w;
    return p.along >= 0 && p.along <= len && Math.abs(p.t - s.now()) < 10000;
  }
  function onPush(p) {
    if (s.leader !== id || !validPush(p)) return;
    const mine = pushes.filter((q) => q.dev === p.dev);
    if (mine.length >= PER_DEV) pushes.splice(pushes.indexOf(mine[0]), 1); // keep the newest
    if (pushes.length >= MAX_BATCH) return;
    pushes.push({ dev: p.dev, edge: p.edge, along: p.along, t: p.t });
    if (!burstStart) burstStart = performance.now();
    clearTimeout(burstTimer);
    const wait = Math.min(900, Math.max(0, DEADLINE - (performance.now() - burstStart)));
    burstTimer = setTimeout(resolve, wait);
  }
  function resolve() {
    burstStart = 0;
    const batch = pushes; pushes = [];
    const sizes = Object.fromEntries(Object.entries(s.peers).map(([k, p]) => [k, { w: p.w, h: p.h }]));
    const { joins, retry, unmatched } = matchPushes(batch, WINDOW, { sizes, joins: s.joins });
    if (joins.length) {
      s.joins = addJoins(s.joins, joins.map(({ tA, tB, ...j }) => j), sizes);   // layouts don't carry push times
      sendLayout();
      joins.forEach((j) => announce('joined', { ...j, from: id }));
    }
    if (retry.length) announce('retry', { devs: retry, pushes: batch.map((p) => ({ dev: p.dev, t: p.t })), from: id });
    // a lone push keeps waiting until its 2 s window is over, in case the other kid is slow
    const cutoff = s.now() - WINDOW;
    for (const p of unmatched) {
      if (p.t > cutoff) pushes.push(p);
      else announce('nomatch', { dev: p.dev, t: p.t, from: id });
    }
    if (pushes.length) { burstStart = performance.now(); burstTimer = setTimeout(resolve, 400); }
  }
  // Join results go to the whole room. Broadcasts don't come back to the sender, so the
  // time keeper also hands its own results to this page.
  function announce(ev, p) { send(ev, p); result(ev, p); }
  // Only a result that names one of this device's pushes stops that push's wait: another
  // pair's join, or the answer to an earlier push, doesn't. The page is told whether the
  // result answers this device's latest push
  function result(ev, p) {
    const answered = ev === 'joined' ? [p.a === id && p.tA, p.b === id && p.tB]
      : ev === 'retry' ? p.pushes.filter((q) => q.dev === id).map((q) => q.t) : [p.dev === id && p.t];
    for (const t of answered) if (waits.has(t)) { clearTimeout(waits.get(t)); waits.delete(t); }
    emit(ev, { ...p, latest: latest !== null && answered.includes(latest) });
  }
  function sendLayout() {
    if (s.leader !== id) return;
    send('layout', { from: id, joins: s.joins });
    emit('layout');
  }
  ch.on('broadcast', { event: 'push' }, ({ payload }) => onPush(payload));
  ch.on('broadcast', { event: 'layout' }, ({ payload }) => {
    // only the current leader's layout counts, and only if it is well-formed
    if (s.leader === id || !isValidJoins(payload?.joins, [...Object.keys(s.peers), id])) return;
    if (payload.from === s.leader) { s.joins = payload.joins; earlyLayouts.clear(); stopAsking(); emit('layout'); return; }
    // From another device in the room, it isn't used. It is kept, one per device, in case this
    // device hasn't yet heard that the sender took over (#61): electLeader uses it if so. A layout
    // from the current time keeper replaces them all, and any change of time keeper clears them
    if (typeof payload.from === 'string' && Object.hasOwn(s.peers, payload.from) && payload.from !== id) earlyLayouts.set(payload.from, payload.joins);
  });
  // The time keeper answers asks for its layout by sending it to the whole room, at most once
  // every LAYOUT_GAP, so asks can't make it flood the room. An ask that comes while an answer is
  // waiting is covered by that answer, which goes out after it
  let answeredAt = -Infinity, answerTimer = null;
  ch.on('broadcast', { event: 'layoutask' }, ({ payload }) => {
    if (!validLayoutAsk(payload) || s.leader !== id || payload.to !== id || !Object.hasOwn(s.peers, payload.from) || answerTimer) return;
    answerTimer = setTimeout(() => { answerTimer = null; answeredAt = performance.now(); sendLayout(); },
      Math.max(0, answeredAt + LAYOUT_GAP - performance.now()));
  });
  // join results count only from the current time keeper, as layouts do. This stops honest
  // mistakes and stale time keepers, not forgery: anyone can write `from` until #24
  const fromLeader = (payload) => s.leader !== id && payload?.from === s.leader;
  ch.on('broadcast', { event: 'joined' }, ({ payload }) => { if (fromLeader(payload) && isValidJoins([payload], [...Object.keys(s.peers), id]) && validJoined(payload)) result('joined', payload); });
  ch.on('broadcast', { event: 'retry' }, ({ payload }) => { if (fromLeader(payload) && validRetry(payload)) result('retry', payload); });
  ch.on('broadcast', { event: 'nomatch' }, ({ payload }) => { if (fromLeader(payload) && validNoMatch(payload)) result('nomatch', payload); });

  s.push = (edge, along) => {
    const p = { dev: id, edge, along, t: s.now() };
    latest = p.t;
    clearTimeout(waits.get(p.t));   // two pushes in the same millisecond share one wait
    waits.set(p.t, setTimeout(() => { waits.delete(p.t); emit('nomatch', { dev: id, t: p.t, timedOut: true, latest: p.t === latest }); }, NO_MATCH_AFTER));
    emit('pushed', p);
    send('push', p);
    onPush(p);
  };
  s.resize = (w, h) => { if (s.status === 'live') ch.track({ name, w, h, joinedAt }); };
  if (onSignal) ch.on('broadcast', { event: 'sig' }, ({ payload }) => {
    if (!validSignal(payload) || payload.to !== id || payload.from === id) return;
    if (inRoom(s.peers, payload.from)) { onSignal(payload.from, payload.data); return; }
    const size = utf8.encode(JSON.stringify(payload.data)).length;   // bytes, not UTF-16 code units
    let held = earlySigs.get(payload.from);
    if (held ? held.list.length >= EARLY_SIG_HOLD || held.bytes + size > EARLY_SIG_BYTES : size > EARLY_SIG_BYTES) return;
    if (!held) {
      if (earlySigs.size >= EARLY_SIG_SENDERS) return;
      const from = payload.from;
      held = { list: [], bytes: 0, timer: setTimeout(() => earlySigs.delete(from), EARLY_SIG_TTL) };
      earlySigs.set(from, held);
    }
    held.list.push(payload.data); held.bytes += size;
  });
  s.signal = (to, data) => send('sig', { from: id, to, data });
  s.on = (f) => s.listeners.add(f);
  s.leave = () => { clearInterval(pingTimer); clearTimeout(answerTimer); stopAsking(); waits.forEach(clearTimeout); waits.clear();
    earlySigs.forEach((h) => clearTimeout(h.timer)); earlySigs.clear(); client.removeChannel(ch); };

  ch.subscribe(async (st) => {
    if (st === 'SUBSCRIBED') {
      s.status = 'live';
      await ch.track({ name, w: size.w, h: size.h, joinedAt });
    } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') s.status = st.toLowerCase();
    emit('status', s.status);
  });
  return s;
}
