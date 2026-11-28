// Flicks (wireframes 2A.3, 2A.8): a photo let go while moving glides on, slowing down, and lands on a screen it crossed
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { velocity, glideAt, landing, MAX_SPEED, TAU } from '../web/flick.js';

test('the speed when let go comes from the last moments of the drag', () => {
  const v = velocity([{ x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 100 }, { x: 20, y: 5, t: 110 }, { x: 40, y: 15, t: 120 }]);
  assert.ok(Math.abs(v.vx - 1.5) < 1e-9 && Math.abs(v.vy - 0.75) < 1e-9, JSON.stringify(v));
  assert.deepEqual(velocity([{ x: 5, y: 5, t: 0 }]), { vx: 0, vy: 0 }, 'no movement, no flick');
  const fast = velocity([{ x: 0, y: 0, t: 0 }, { x: 900, y: 0, t: 10 }]);
  assert.ok(Math.hypot(fast.vx, fast.vy) <= MAX_SPEED + 1e-9, 'capped');
});

test('it glides on, slowing down, and stops after a while', () => {
  const at = (t) => glideAt({ x: 0, y: 0, vx: 2, vy: 0 }, t);
  assert.equal(at(0).x, 0);
  assert.ok(at(100).x > 0 && at(200).x > at(100).x, 'keeps going');
  assert.ok(at(200).x - at(100).x < at(100).x - at(0).x, 'slows down');
  assert.ok(Math.abs(at(1e6).x - 2 * TAU) < 1e-6, 'stops after speed × TAU');
  assert.equal(at(1e6).done, true);
  assert.equal(at(50).done, false);
});

test('it lands on the last screen it crossed, even if it would have slid past it', () => {
  const on = (x) => (x < 0 ? null : x < 100 ? 'me' : x < 200 ? 'them' : null);   // two screens side by side, nothing either side
  assert.deepEqual(landing([50, 120, 180, 260, 400], on), { at: 180, on: 'them' });
  assert.deepEqual(landing([50, 60, 70], on), { at: 70, on: 'me' }, 'stayed on my screen');
  assert.deepEqual(landing([50, 80, 120], on), { at: 120, on: 'them' });
  assert.deepEqual(landing([50, 20, -40, -90], on), { at: 20, on: null }, 'went off into nowhere: no screen there');
});
