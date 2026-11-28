// The map (wireframes 2C.1–2C.8): every screen in the room, drawn to its size, joined where edges touch
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceKind, mapTiles, edgeLabels } from '../web/map.js';

test('a screen is a phone, tablet or laptop by its size', () => {
  assert.equal(deviceKind({ w: 390, h: 844 }), 'phone');
  assert.equal(deviceKind({ w: 844, h: 390 }), 'phone', 'a phone turned sideways');
  assert.equal(deviceKind({ w: 820, h: 1180 }), 'tablet');
  assert.equal(deviceKind({ w: 1280, h: 800 }), 'laptop');
});

const sizes = { me: { w: 390, h: 844 }, lap: { w: 1280, h: 800 }, far: { w: 390, h: 700 } };
const layout = { pos: { me: [0, 0], lap: [390, 0], far: [0, 0] }, group: { me: 'g', lap: 'g', far: 'far' } };

test('the map fits its box, keeps joined screens where they are, and puts the others under Not joined', () => {
  const t = mapTiles(['me', 'lap', 'far'], layout, sizes, 'me', { w: 300, h: 120 });
  const by = Object.fromEntries(t.map((x) => [x.id, x]));
  for (const x of t) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= 300 + 1e-6 && x.y + x.h <= 120 + 1e-6, `${x.id} inside the box`);
  assert.ok(by.me.joined && by.lap.joined && !by.far.joined);
  assert.ok(Math.abs(by.lap.x - (by.me.x + by.me.w)) < 1e-6, 'the laptop sits right of me, touching');
  assert.ok(Math.abs(by.lap.w / by.me.w - 1280 / 390) < 1e-6, 'drawn to scale');
  assert.ok(by.far.x > by.lap.x + by.lap.w, 'not joined: to the right of the joined screens');
});

test('alone, my screen is the only joined one', () => {
  const t = mapTiles(['me'], { pos: { me: [0, 0] }, group: {} }, { me: sizes.me }, 'me', { w: 200, h: 100 });
  assert.equal(t.length, 1); assert.ok(t[0].joined);
});

test('edge labels: each neighbour touching my screen, on which side and where along it', () => {
  const l = edgeLabels(['me', 'lap', 'far'], layout, sizes, 'me');
  assert.deepEqual(l, [{ id: 'lap', side: 'R', along: 400 }], 'the laptop on my right, at the middle of the shared part (0..844 meets 0..800); far is not joined');
});
