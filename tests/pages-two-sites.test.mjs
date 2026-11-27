// #157: one Pages deploy, two apps. universal sharing stays at the root (frozen at a tag), heap is at /heap/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as invite from '../web/invite.js';

const wf = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('the root is built from the universal-sharing-final tag', () => {
  assert.match(wf, /ref:\s*universal-sharing-final/, 'a checkout of the frozen tag');
  assert.match(wf, /cp -R [\w./-]*web\/\. _site\//, "the tag's web/ is copied to the site root");
});

test("heap at /heap/ is main's web/", () => {
  assert.match(wf, /cp -R web\/\. _site\/heap\//, "main's web/ is copied to /heap/");
});

test('the uploaded site is the combined folder, not web/ alone', () => {
  assert.match(wf, /upload-pages-artifact@v3[\s\S]*?path:\s*_site/);
  assert.doesNotMatch(wf, /upload-pages-artifact@v3[\s\S]*?path:\s*web\s*$/m);
});

test('an invite made at /heap/ opens /heap/, and one at the root opens the root', () => {
  assert.equal(invite.inviteLink('https://jtbinith.github.io/qodo-hack-2026/heap/', 'ABCDEFGHJK'), 'https://jtbinith.github.io/qodo-hack-2026/heap/?room=ABCDEFGHJK&auto');
  assert.equal(invite.inviteLink('https://jtbinith.github.io/qodo-hack-2026/', 'ABCDEFGHJK'), 'https://jtbinith.github.io/qodo-hack-2026/?room=ABCDEFGHJK&auto');
});
