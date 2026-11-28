// The host (wireframes 2D.9–2D.12): the host leaves, you're the host now, end the heap for everyone
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countdown, END_GRACE } from '../web/words.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
const box = (k) => (html.match(new RegExp(`<div id="${k}"[^>]*>([\\s\\S]*?)<\\/div><!-- \\/${k} -->`)) || [, ''])[1];

test('the closing countdown', () => {
  assert.equal(END_GRACE, 5 * 60000);
  assert.equal(countdown(299000), '4:59'); assert.equal(countdown(60000), '1:00'); assert.equal(countdown(9000), '0:09'); assert.equal(countdown(-5), '0:00');
});

test('the host left (2D.9): everyone is told who looks after the heap now', () => {
  assert.match(html, /`\$\{gone\} left\. \$\{now\} is now the host\.`/);
});

test('you are the host now (2D.10)', () => {
  const b = box('hostbox');
  assert.match(b, /<h2>You’re the host now<\/h2>\s*<p id="hostsub"><\/p>/);
  assert.match(b, /Let people in[\s\S]*Move screens[\s\S]*End the heap[\s\S]*id="hostok">Got it<\/button>/);
});

test('end the heap for everyone (2D.11, 2D.12): five minutes to save, then nothing is kept', () => {
  assert.match(html, /id="endheap"[^>]*><span><b>End the heap<\/b>/);
  assert.match(box('endbox'), /<h2 id="endtitle"><\/h2>[\s\S]*Everyone’s table closes\. People get 5 minutes to save photos they haven’t saved yet\. Nothing is kept anywhere after that\.[\s\S]*id="endyes">End heap<\/button>[\s\S]*id="endno">Keep it open<\/button>/);
  assert.match(html, /<div id="endbanner" role="status" hidden><\/div>/);
  assert.match(html, /`\$\{by\} ended the heap\. It closes in \$\{countdown\(/);
  assert.match(box('unsavedbox'), /<h2 id="unsavedtitle"><\/h2>[\s\S]*They’re only in this tab\. Save them before the heap closes\.[\s\S]*id="unsavedsave"[\s\S]*id="unsavedleave">Leave without saving<\/button>/);
  assert.match(html, /<div class="step" id="s-ended" hidden>[\s\S]*This heap has ended[\s\S]*Nothing from it is kept\./);
  assert.match(net, /ended: payload\.ended/, 'the end rides with who is in, so a late device hears it');
  assert.match(html, /if \(net\.admits\.ended/, 'a device that arrives after the end is turned away');
});
