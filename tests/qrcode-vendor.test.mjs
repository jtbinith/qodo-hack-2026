// qrcode-generator 2.0.4 (MIT, Kazuhiko Arase), vendored for Invite (#102): the QR code is made on
// the device, so the room link never goes to an outside service. Pinned by sha256 (threat T-E4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const file = (p) => new URL(`../web/vendor/${p}`, import.meta.url);
const SHA256 = '79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c';

test('the vendored qrcode-generator is the pinned 2.0.4 file, with its MIT licence', () => {
  assert.ok(existsSync(file('qrcode.js')), 'web/vendor/qrcode.js');
  assert.equal(createHash('sha256').update(readFileSync(file('qrcode.js'))).digest('hex'), SHA256);
  const lic = readFileSync(file('qrcode-LICENSE'), 'utf8');
  assert.match(lic, /MIT License/); assert.match(lic, /Copyright \(c\) 2009 Kazuhiko Arase/);
});

test('it loads as a plain script and draws a QR code for a room link, with its three finder patterns', () => {
  const sandbox = {}; vm.createContext(sandbox);
  vm.runInContext(readFileSync(file('qrcode.js'), 'utf8'), sandbox);   // as a <script>: defines the global qrcode
  assert.equal(typeof sandbox.qrcode, 'function');
  const qr = sandbox.qrcode(0, 'M'); qr.addData('https://jtbinith.github.io/qodo-hack-2026/?room=ABCDEFGHJK&auto'); qr.make();
  const n = qr.getModuleCount();
  assert.equal((n - 17) % 4, 0);   // 17 + 4 x version
  // a finder pattern: a dark 7 x 7 ring with a dark 3 x 3 centre, in the top-left, top-right and bottom-left corners
  const finder = (r0, c0) => { for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const ring = r === 0 || r === 6 || c === 0 || c === 6, core = r >= 2 && r <= 4 && c >= 2 && c <= 4; if (qr.isDark(r0 + r, c0 + c) !== (ring || core)) return false; } return true; };
  assert.ok(finder(0, 0)); assert.ok(finder(0, n - 7)); assert.ok(finder(n - 7, 0));
});

test('it makes no network calls and evaluates no strings', () => {
  const src = readFileSync(file('qrcode.js'), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|\beval\(|new Function|import\(/);
});
