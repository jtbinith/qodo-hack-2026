// heap rebrand (#156, #158): colours from a few tokens, self-hosted fonts, contrast, and the home screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const web = (p) => new URL(`../web/${p}`, import.meta.url);
const html = readFileSync(web('index.html'), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

// @fontsource 5.3.0 (npm), SIL Open Font License 1.1
const FONTS = {
  'anton-latin-400-normal.woff2': 'd0fa07ff63dd60cbc0e2f58e29c802dca2a5ae0276c999f59c6111ab7bbaec3b',
  'schibsted-grotesk-latin-400-normal.woff2': '437cd97c802be9f10f60b4db8a723261e5c35dfe1529de0562981871028bd670',
  'schibsted-grotesk-latin-500-normal.woff2': '83c497a1c028bfc2ae231f88c49ec7da542e1e4bbdfe23ad207a6dbb91d4f15d',
  'schibsted-grotesk-latin-700-normal.woff2': 'd656a2dcc2bf850a9af5156f2de42f6051facfbaa8d5790cf31159de39bc2568',
};
const TOKENS = { '--ink': '#382a2b', '--paper': '#f6f3f2', '--text-mid': '#6e5e5f' };

test('the fonts are vendored, pinned and licensed', () => {
  for (const [f, sha] of Object.entries(FONTS)) assert.equal(createHash('sha256').update(readFileSync(web(`vendor/fonts/${f}`))).digest('hex'), sha, f);
  for (const l of ['anton-LICENSE', 'schibsted-grotesk-LICENSE']) assert.match(readFileSync(web(`vendor/fonts/${l}`), 'utf8'), /SIL Open Font License, Version 1\.1/, l);
});

test('fonts load from this site only, never a font service', () => {
  const srcs = [...css.matchAll(/src:\s*url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  assert.ok(srcs.length >= 4, 'an @font-face for each font file');
  for (const s of srcs) { assert.match(s, /^vendor\/fonts\//, s); assert.ok(existsSync(web(s)), s); }
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)|https?:\/\/[^"')\s]*\.(woff2?|ttf)/);
});

test('every colour in the page styles comes from the tokens', () => {
  const root = (css.match(/:root\s*{([^}]*)}/) || [, ''])[1];
  for (const [k, v] of Object.entries(TOKENS)) assert.match(root.toLowerCase(), new RegExp(`${k}:\\s*${v}`), k);
  const rest = css.replace(/:root\s*{[^}]*}/, '');
  assert.deepEqual(rest.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], 'no hex colour outside :root');
  assert.doesNotMatch(css, /monospace/, 'no monospace');
  assert.doesNotMatch(css.toLowerCase(), /#ffd23f/, 'no yellow');
});

const lum = (hex) => { const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('text colours pass AA (4.5:1) on their backgrounds', () => {
  assert.ok(ratio(TOKENS['--ink'], TOKENS['--paper']) >= 4.5, 'ink on paper');
  assert.ok(ratio(TOKENS['--text-mid'], TOKENS['--paper']) >= 4.5, 'grey text on paper');
  assert.ok(ratio(TOKENS['--paper'], TOKENS['--ink']) >= 4.5, 'paper on an ink button');
});

test('the home screen offers Start a heap and Join with a code', () => {
  const lobby = (html.match(/<div id="lobby">([\s\S]*?)<\/div>\s*<!-- \/lobby -->/) || [, ''])[1];
  assert.match(lobby, /share side by side/i, 'the tagline');
  assert.match(lobby, /<button[^>]*id="new"[^>]*>[\s\S]*Start a heap[\s\S]*You get a code to share[\s\S]*?<\/button>/, 'Start a heap');
  assert.match(lobby, /<button[^>]*id="joinwith"[^>]*>[\s\S]*Join with a code[\s\S]*Someone nearby has one[\s\S]*?<\/button>/, 'Join with a code');
  assert.match(lobby, /<form id="f"[\s\S]*<input id="code"[\s\S]*<button>Join<\/button>/, 'the code form, its first button joins');
  assert.doesNotMatch(lobby, /<i aria-hidden/, 'no glyphs on the buttons');
});

test('the wordmark is the word heap with only the a as a glyph', async () => {
  const mark = (html.match(/<h1 class="mark"[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1];
  assert.match(mark, /^\s*he<canvas id="heap-a"[^>]*aria-hidden="true"[^>]*><\/canvas>p\s*$/, 'he, the a glyph, p');
  assert.match(html, /aria-label="heap"/, 'read out as heap');
  const a = await import('../web/heap-a.js');
  assert.ok(a.field(a.A_GLYPH, 76, 64) < 0, 'the ring of the a is filled');
  assert.ok(a.field(a.A_GLYPH, 76, 92) > 0, 'the middle of the a is open');
  assert.ok(a.field(a.A_GLYPH, 112, 120) < 0, 'the stem is filled');
});

test('the table is drawn in the tokens, not the old dark wood', () => {
  const frame = (html.match(/function frame\(\) {([\s\S]*?)\n}\nframe\(\);/) || [, ''])[1];
  assert.ok(frame.length > 200, 'found the drawing code');
  assert.deepEqual(frame.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [], [], 'no colour literals: colours come from the tokens');
  assert.doesNotMatch(frame, /shadowBlur/, 'no drop shadows');
  assert.doesNotMatch(frame, /monospace/, 'no monospace');
});

test('the live table has Leave and Invite at the top and the photo actions at the bottom', () => {
  assert.match(html, /<div id="top">\s*<button id="leave"[^>]*>Leave<\/button>\s*<button id="invite"[^>]*>Invite<\/button>\s*<\/div>/);
  assert.match(html, /<div id="bar">[\s\S]*id="keep"[\s\S]*id="saveall"[\s\S]*id="pick"[\s\S]*?<\/div>/);
  assert.doesNotMatch((html.match(/<div id="bar">[\s\S]*?<\/div>/) || [''])[0], /id="(leave|invite)"/, 'Leave and Invite are not in the bottom bar');
});

test('the status box is hidden behind a small i button', () => {
  assert.match(html, /<div id="hud" hidden><\/div>/, 'hidden at first');
  assert.match(html, /<button id="info" type="button" aria-label="Status" aria-controls="hud" aria-expanded="false"[^>]*>i<\/button>/, 'an i button');
  assert.match(html, /\$\('info'\)\.onclick = \(\) => \{[^}]*\$\('hud'\)\.hidden = ![^}]*aria-expanded/, 'it toggles the box');
});
