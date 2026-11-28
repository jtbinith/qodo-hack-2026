// Invite (S16): which room a page opens, the link others join with and when a join has worked.
// The room code lives in the invite and in this tab's sessionStorage, not in the address bar.
import { isRoomCode } from './check.js';

export const ROOM_KEY = 'room';     // sessionStorage key: this tab's room, written only once joined
// A join that reports nothing (no live, no error) for this long has failed: the lobby comes back (ms)
export const JOIN_TIMEOUT = 30000;

// Which room to show in the lobby (`fill`) and which to join straight away (`join`, or null).
// A ?room=CODE&auto link is the newest choice, so it wins over the room stored for this tab, even
// when it isn't a valid code (the join's own check then says so). A ?room=CODE link without &auto
// only fills the lobby. With no link, a valid stored code goes straight back into its room.
export function pickRoom(search, stored) {
  const params = new URLSearchParams(search);
  const link = (params.get('room') || '').trim().toUpperCase();
  if (link) return { fill: link, join: params.has('auto') ? link : null, from: 'link' };   // from: a link asks for the name first
  if (isRoomCode(stored)) return { fill: stored, join: stored, from: 'stored' };           // this tab's heap: back in at once
  return { fill: '', join: null };
}

// The link others join with: this page with ?room=CODE&auto and nothing else
export function inviteLink(href, code) {
  const u = new URL(href);
  return `${u.origin}${u.pathname}?room=${code}&auto`;
}

// The address bar once joined: this page without room and auto, keeping any other settings
export function cleanUrl(href) {
  const u = new URL(href);
  for (const k of ['room', 'auto', 'pair', 'by', 'as']) u.searchParams.delete(k);   // nothing about the heap or a pairing stays in the address bar
  const q = u.searchParams.toString().replace(/=(?=&|$)/g, '');   // ?relay, not ?relay=
  return u.pathname + (q ? '?' + q : '');
}

// Watches one join attempt on `net` (web/net.js, which emits ('status', s)). `joined()` runs on
// the first 'live'. `failed(why)` runs on channel_error, timed_out or closed before that, or after
// JOIN_TIMEOUT with neither. Each runs at most once and nothing is reported after either, or after
// stop(): a drop after live is the socket's own rejoin, and a failed attempt's late 'live' is ignored.
export function watchJoin(net, { joined, failed, timeout = JOIN_TIMEOUT, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let done = false;
  const finish = () => { done = true; clearTimer(timer); };
  const timer = setTimer(() => { if (!done) { finish(); failed('timeout'); } }, timeout);
  net.on((ev, st) => {
    if (done || ev !== 'status') return;
    if (st === 'live') { finish(); joined(); }
    else if (st === 'channel_error' || st === 'timed_out' || st === 'closed') { finish(); failed(st); }
  });
  return { stop: finish };
}
