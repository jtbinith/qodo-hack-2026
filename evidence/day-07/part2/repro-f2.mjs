// Finding 7e800d93 (Busy rooms can reset a device's send limit): the real askLimiter from #87's
// web/check.js (8ddeaf8) with a fake clock. Run: node repro-f2.mjs <path to the #87 worktree>
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { askLimiter, LIMITS } = await import(pathToFileURL(join(process.argv[2], 'web/check.js')).href);

let t = 0;
const lim = askLimiter(() => t);
const whole = (dev, fid) => lim.allow(dev, fid, 'whole');
const sendsOfBig = () => { let n = 0; for (let k = 0; k < 20; k++) if (whole('B', 'big-photo')) n++; return n; };

console.log(`LIMITS.wholeSends ${LIMITS.wholeSends} per ${LIMITS.wholeWindow / 1000} s, LIMITS.askRecords ${LIMITS.askRecords}`);
console.log(`t=0 s    B asks for big-photo 20 times: sent ${sendsOfBig()}`);
// 2000 other live (device, file) counters within the minute: e.g. 4 device ids x 500 thumbnails.
// Each is one allowed whole send of a thumbnail (<= LIMITS.thumbBytes), live for 60 s.
t = 5000; let filled = 0;
for (let d = 0; d < 4; d++) for (let f = 0; f < 500; f++) if (whole('X' + d, 'thumb:' + f)) filled++;
console.log(`t=5 s    ${filled} other whole asks allowed (4 ids x 500 thumbnails), counters kept: ${lim.size}`);
console.log(`t=5 s    B asks for big-photo 20 times again: sent ${sendsOfBig()}   <- limit reset, well inside B's 60 s window`);
let total = 3 + 0; t = 5000;
// keep cycling for the rest of the minute: each cycle the thumbnail keys can each be asked again
// (3 per minute each), pushing B's newest counter out again
let cycles = 0;
for (t = 6000; t < 60000 && cycles < 2; t += 1000) {
  let again = 0; for (let d = 0; d < 4; d++) for (let f = 0; f < 500; f++) if (whole('X' + d, 'thumb:' + f)) again++;
  if (again < LIMITS.askRecords) break;
  cycles++; console.log(`t=${t / 1000} s    ${again} more thumbnail asks; B asks again: sent ${sendsOfBig()}`);
}
// control: the same room without the 2000 other counters
t = 0; const lim2 = askLimiter(() => t); let n2 = 0;
for (const at of [0, 5000, 6000, 7000]) { t = at; for (let k = 0; k < 20; k++) if (lim2.allow('B', 'big-photo', 'whole')) n2++; }
console.log(`control  without the other counters, B gets ${n2} sends of big-photo in the same minute`);
