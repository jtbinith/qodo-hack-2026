// #157: one Pages deploy, two apps. universal sharing stays at the root (frozen at a tag), heap is at /heap/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as invite from '../web/invite.js';

const wf = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

// the steps as written lines, so one copy can't stand in for the other (Qodo on #159)
const lines = wf.split('\n').map((l) => l.trim());
const checkout = wf.match(/uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*ref: universal-sharing-final\s*\n\s*path: (\S+)/);

test('the root is built from the universal-sharing-final tag', () => {
  assert.ok(checkout, 'a checkout of the frozen tag into its own folder');
  assert.ok(lines.includes(`cp -R ${checkout[1]}/web/. _site/`), "the tag's web/ is copied to the site root");
});

test("the root copy is the tag's, not main's", () => {
  assert.ok(!lines.includes('cp -R web/. _site/'), "main's web/ isn't copied to the root");
});

test("heap at /heap/ is main's web/", () => {
  assert.ok(lines.includes('cp -R web/. _site/heap/'), "main's web/ is copied to /heap/");
});

test('the uploaded site is the combined folder, not web/ alone', () => {
  assert.match(wf, /upload-pages-artifact@v3[\s\S]*?path:\s*_site/);
  assert.doesNotMatch(wf, /upload-pages-artifact@v3[\s\S]*?path:\s*web\s*$/m);
});

test('an invite made at /heap/ opens /heap/, and one at the root opens the root', () => {
  assert.equal(invite.inviteLink('https://jtbinith.github.io/qodo-hack-2026/heap/', 'ABCDEFGHJK'), 'https://jtbinith.github.io/qodo-hack-2026/heap/?room=ABCDEFGHJK&auto');
  assert.equal(invite.inviteLink('https://jtbinith.github.io/qodo-hack-2026/', 'ABCDEFGHJK'), 'https://jtbinith.github.io/qodo-hack-2026/?room=ABCDEFGHJK&auto');
});
