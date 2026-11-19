// Blind 7: frames that relay() drops come back false without throwing, so sendFile "succeeds" with 0 sent.
import { pathToFileURL } from 'node:url'; import { join } from 'node:path';
class FakeChannel extends EventTarget { readyState = 'open'; bufferedAmount = 0; send() {} }
globalThis.RTCPeerConnection = class { connectionState = 'new'; createDataChannel() { return new FakeChannel(); } };
const { createPeers } = await import(pathToFileURL(join(process.argv[2], 'web/peers.js')).href);
const sent = []; const peers = createPeers({ myId: 'a', table: 'T', signal: (to, d) => sent.push([to, d]) });
await peers.onSignal('c', { pub: 'bm90IGEga2V5', reply: true });   // a malformed key: keyFailed
const frames = () => sent.filter(([t, d]) => t === 'c' && d.r).length;
let outcome;
try { const r = await peers.sendFile('c', 'f1', new Blob([new Uint8Array(3 * 24576)])); outcome = `resolved (${r === undefined ? 'no value' : r}), no error, so index.html never calls undo`; }
catch (e) { outcome = `rejected, e.sent = ${e.sent}`; }
console.log('blind 7, relay with a bad key: sendFile', outcome, '| relay frames actually sent:', frames());
