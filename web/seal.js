// End-to-end encryption between two devices, so the room server (Supabase) can carry
// photos without being able to read them.
//
// Each device makes a fresh ECDH P-256 key pair when it joins. Two devices swap public
// keys through the room and each derives the same AES-256-GCM key:
//   key = HKDF-SHA256(ECDH(mine, theirs), salt = table name, info = both ids, sorted)
// The server only ever sees public keys and ciphertext.
//
// Known limit (spike): the server could swap public keys in transit (an active attack).
// Detecting that needs a check both people can compare, e.g. matching words or a tune
// built from fingerprint().

const enc = new TextEncoder();

export async function makeKeyPair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { kp, pub };
}

export async function deriveKey(kp, theirPub, { table, a, b }) {
  if (!(theirPub instanceof Uint8Array) || theirPub.length !== 65 || theirPub[0] !== 4) throw new Error('bad public key');
  const their = await crypto.subtle.importKey('raw', theirPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: their }, kp.privateKey, 256);
  const hk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const [x, y] = [a, b].sort();
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('phototable:' + table), info: enc.encode(x + '|' + y) },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Associated data ties each message to who sent it and to whom, so a ciphertext can't be
// replayed in the other direction or redirected to someone else.
const aad = (from, to) => enc.encode(from + '>' + to);

export async function seal(key, bytes, from, to) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh for every message
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(from, to) }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}

export async function open(key, box, from, to) {
  if (box.length < 12 + 16) throw new Error('too short');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.subarray(0, 12), additionalData: aad(from, to) }, key, box.subarray(12));
  return new Uint8Array(pt);
}

// Short fingerprint of both public keys, for a future "do these match?" check.
export async function fingerprint(pubA, pubB) {
  const [x, y] = [pubA, pubB].sort((p, q) => { for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0; });
  const cat = new Uint8Array(x.length + y.length); cat.set(x); cat.set(y, x.length);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', cat)).subarray(0, 4);
}

export const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Check words (wireframe 5.3): four words from both devices' public keys (sorted, so both sides agree) and the heap.
// A device in the middle would hold other keys, so the two screens would show different words.
export const WORDS = ('acorn anchor apple arrow aspen badger bamboo banjo barley basil beacon beaver birch bison blossom bluebell bonfire boulder bramble breeze brook bubble buckle burrow butter cabin cactus camel candle canoe canyon carrot castle cedar cello chalk cherry chestnut cider cinder clover cobble comet coral cotton cougar crane crater cricket crystal cuckoo daisy dawn delta denim dingo dolphin donkey dragon drift drum dune eagle easel echo ember emerald falcon fennel fern ferry fiddle finch fjord flame flint flute forest fossil fox frost galaxy garnet gecko geyser ginger glacier globe goose granite grape gravel gull hammock harbor hazel heron hickory hill honey hornet husky iceberg igloo indigo iris island ivory ivy jade jaguar jasmine jelly jetty juniper kayak kelp kettle kite kiwi koala ladder lagoon lantern larch lark lava lemon lilac lily lime linen lizard llama lobster locket lotus lynx magnet mango maple marble meadow melon meteor mint mitten moose moss moth mountain muffin mushroom nectar nest nutmeg oasis oak oat ocean olive onyx opal orbit orchid osprey otter owl oyster paddle panda pansy parrot peach pebble pelican pepper pine plum pond poppy prairie puffin pumpkin quail quartz quill rabbit radish raven reef ribbon river robin rocket rose ruby saddle saffron salmon sandal sapphire seal sequoia shell sierra silver sparrow spruce squid star stone storm sugar summit swan tangerine thistle thunder tiger timber toffee topaz tortoise tulip tundra turtle valley velvet violet volcano walnut walrus wave willow wind winter wolf wren yak yarrow yew zebra zephyr zinnia bay cove glen moor reed tide vale plume fable crest prism').split(' ');
export async function checkWords(pubA, pubB, table) {
  const [x, y] = [pubA, pubB].sort((a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; });
  const t = new TextEncoder().encode(table), all = new Uint8Array(x.length + y.length + t.length);
  all.set(x); all.set(y, x.length); all.set(t, x.length + y.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  return [...h.slice(0, 4)].map((b) => WORDS[b]);
}
