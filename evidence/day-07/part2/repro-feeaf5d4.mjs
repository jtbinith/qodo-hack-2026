import { pathToFileURL } from 'node:url'; import { join } from 'node:path';
const { askLimiter, askBytes, LIMITS } = await import(pathToFileURL(join(process.argv[2], 'web/check.js')).href);
let t = 0; const lim = askLimiter(() => t), size = 65537;   // 2 pieces at 64 KB: 65536 bytes, then a 1-byte tail
const cost = askBytes({ t: 'want', pid: 'p' }, size);
let sentBytes = 0, allowed = 0;
for (let k = 0; k < 20; k++) {
  const tok = lim.allow('b', 'p', cost, size, false); if (!tok) continue;
  allowed++; sentBytes += 65536;                     // the first piece leaves, the 1-byte tail fails
  const s = { sent: 1, of: 2 };                      // what sendFile reports
  lim.undo(tok, (s.of - s.sent) / s.of);             // index.html's refund: half the charge back
}
console.log(`${allowed} whole-file asks allowed in one window; ${(sentBytes / 2 ** 20).toFixed(2)} MB sent against a budget of ${(LIMITS.wholeSends * size / 2 ** 20).toFixed(2)} MB (${(sentBytes / size).toFixed(1)} files' worth, limit ${LIMITS.wholeSends})`);
