// Share more than photos (wireframes 3.1, 3.4, 3.9, 3.10)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refused, validPrint, cleanText, isWebLink, BIG_FILE } from '../web/check.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const box = (k) => (html.match(new RegExp(`<div id="${k}"[^>]*>([\\s\\S]*?)<\\/div><!-- \\/${k} -->`)) || [, ''])[1];

test('programs and scripts are refused (3.9)', () => {
  for (const n of ['setup.exe', 'run.BAT', 'x.msi', 'a.apk', 'go.sh', 'macro.vbs', 'p.ps1', 'thing.jar', 'App.dmg', 'tool.scr', 'page.html', 'evil.svg', 'x.js'])
    assert.ok(refused(n, ''), n);
  assert.ok(refused('notes', 'application/x-msdownload'), 'by type too');
  for (const n of ['IMG_1.JPG', 'clip.mov', 'menu.pdf', 'notes.txt', 'song.mp3', 'sheet.xlsx']) assert.ok(!refused(n, ''), n);
});

test('a link or note carries its text, plain and short', () => {
  const base = { pid: '0123456789abcdef', owner: 'dev1', anchor: 'dev1', name: 'note.txt', type: 'text/plain', size: 5, thumbSize: 0, sha: 'a'.repeat(64), x: 0, y: 0, w: 150, h: 150, rot: 0, holders: ['dev1'] };
  assert.ok(validPrint({ ...base, text: 'hello' }));
  assert.ok(validPrint(base), 'photos have none');
  assert.equal(validPrint({ ...base, text: 'x'.repeat(501) }), false);
  assert.equal(cleanText('  hi\u0000 there‮  '), 'hi there');
  assert.equal(cleanText('a\n\n\n\nb'), 'a\n\nb', 'no walls of blank lines');
  assert.ok(isWebLink('https://maps.example.com/place/1')); assert.ok(isWebLink('http://x.org'));
  assert.ok(!isWebLink('javascript:alert(1)')); assert.ok(!isWebLink('data:text/html,hi')); assert.ok(!isWebLink('maps'));
  assert.equal(BIG_FILE, 25 * 1024 * 1024);
});

test('the share sheet (3.1): photos and videos, files, a link, a note', () => {
  assert.match(html, /<button type="button" id="share">\+ Add photos &amp; files<\/button>/);
  const b = box('sharebox');
  assert.match(b, /<label class="item" for="pick">[\s\S]*Photos and videos[\s\S]*<label class="item" for="pickfile">[\s\S]*Files[\s\S]*id="sharelink"[\s\S]*Paste a link[\s\S]*id="sharenote"[\s\S]*Write a note/);
  assert.match(html, /<input id="pickfile" type="file" multiple hidden>/);
});

test('a link or note (3.4): plain text everyone sees, nothing opens until tapped', () => {
  const b = box('textbox');
  assert.match(b, /<h2 id="texttitle"><\/h2>[\s\S]*<textarea id="textfield" maxlength="500"[\s\S]*Everyone sees it as plain text\. Nothing opens until they tap it\.[\s\S]*id="textshare">Share<\/button>/);
  assert.match(html, /function addText\(/);
  assert.doesNotMatch(html, /innerHTML\s*=\s*[^'"]*p\.text/, 'never HTML');
});

test('big files wait for a tap, and problems are listed in the deck (3.9)', () => {
  assert.match(html, /p\.size > BIG_FILE && !tapped/);
  assert.match(html, /<div id="deckproblems"[^>]*><\/div>/);
  assert.match(html, /couldn’t arrive/);
  assert.match(html, /Big files wait until you tap them/);
});

test('preview (3.10): hold a photo to look closer, with Get, Pick and Send to', () => {
  const b = box('previewbox');
  assert.match(b, /id="previewback">‹ Back<\/button>[\s\S]*<img id="previewimg" alt="">[\s\S]*<p id="previewinfo"><\/p>[\s\S]*id="previewget"[\s\S]*id="previewpick"[\s\S]*id="previewsend"/);
  assert.match(b, /id="previewprev"[\s\S]*id="previewnext"/);
  assert.match(html, /function openPreview\(/);
  assert.match(html, /Tap photos to pick them\. Hold one to look closer\. Drag one out to put it on the table or send it\./);
});
