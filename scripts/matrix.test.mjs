import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatrix, stepMatrix, segmentDistance, strikePixels, BULLET_LIMIT } from '../src/matrix.js';

const bounds = { left: 44, right: 956, top: 44, bottom: 550 };
const body = { x: 500, y: 180 };

test('agents close the distance, fire, and stay inside the newly scrolled view', () => {
  const state = createMatrix(1000);
  stepMatrix(state, 1 / 60, body, bounds);
  const distance = Math.hypot(state.agents[0].x - body.x, state.agents[0].y - body.y);
  for (let i = 0; i < 180; i++) stepMatrix(state, 1 / 60, body, bounds, { dodging: true });
  assert.ok(Math.hypot(state.agents[0].x - body.x, state.agents[0].y - body.y) < distance - 60);
  assert.ok(state.bullets.length > 0, 'the chase includes visible projectiles');
  const scrolled = { ...bounds, top: 700, bottom: 1100 };
  stepMatrix(state, 1 / 60, { ...body, y: 820 }, scrolled);
  assert.ok(state.agents.every(a => a.y >= 700 && a.y <= 1100), 'scrolling cannot strand pursuers on another screen');
});

test('bullet time slows projectile travel and firing while a paused scene does no work', () => {
  const normal = createMatrix(1000), slow = createMatrix(1000);
  for (const state of [normal, slow]) {
    state.started = true; state.agents.forEach(a => { a.cooldown = 100; });
    state.bullets.push({ x: 100, y: 300, px: 100, py: 300, vx: 260, vy: 0, life: 4, hits: 0 });
  }
  for (let i = 0; i < 60; i++) {
    stepMatrix(normal, 1 / 60, body, bounds);
    stepMatrix(slow, 1 / 60, body, bounds, { slow: true });
  }
  assert.ok(slow.bullets[0].x - 100 < (normal.bullets[0].x - 100) * .2, 'slowing time leaves bullets available to dodge');
  assert.ok(slow.agents[0].cooldown > normal.agents[0].cooldown, 'slowing time also delays the next shot');
  const snapshot = JSON.stringify(slow);
  stepMatrix(slow, 1 / 60, body, bounds, { paused: true });
  assert.equal(JSON.stringify(slow), snapshot, 'dialogs and reduced motion cannot advance the action');
  stepMatrix(slow, 1 / 60, body, null);
  assert.equal(JSON.stringify(slow), snapshot, 'off-screen worlds cannot fire');
});

test('swept bullets hit real pixels, scatter locally, and cannot repeatedly strike the same app', () => {
  const shot = { px: 0, py: 100, x: 120, y: 100, vx: 260, vy: 0, hits: 0 };
  assert.equal(segmentDistance(60, 100, shot), 0, 'fast projectiles cannot tunnel between frames');
  const pixels = new Float32Array([60, 100, 12, 70, 110, 12, 160, 100, 12]);
  const velocity = new Float32Array(6);
  assert.deepEqual(strikePixels(shot, pixels, velocity, 0), { x: 60, y: 100 });
  assert.ok(velocity[0] > 100 && velocity[3] > 0, 'impact pushes the contacted pixel and its neighbours');
  assert.equal(velocity[4], 0, 'distant lettering stays intact');
  const snapshot = [...velocity];
  assert.equal(strikePixels(shot, pixels, velocity, 0), null);
  assert.deepEqual([...velocity], snapshot);
  assert.ok(strikePixels(shot, pixels, velocity, 1), 'one projectile can affect another app farther along its path');
  assert.equal(strikePixels({ ...shot, py: 80, y: 80, hits: 0 }, pixels, velocity, 0), null, 'empty space between pixels is not a hit');
});

test('dodging lets a bullet pass without the involuntary hit reaction; shooting stays bounded', () => {
  const run = dodging => {
    const state = createMatrix(390); state.started = true;
    state.agents.forEach(a => { a.cooldown = 100; });
    state.bullets.push({ x: 490, y: 172, px: 490, py: 172, vx: 260, vy: 0, life: 4, hits: 0 });
    stepMatrix(state, 1 / 60, body, bounds, { dodging }); return state;
  };
  assert.equal(run(true).hitAt, -10);
  assert.ok(run(false).hitAt >= 0);
  const state = createMatrix(1000);
  for (let i = 0; i < 7200; i++) {
    stepMatrix(state, 1 / 60, body, bounds);
    assert.ok(state.bullets.length <= BULLET_LIMIT);
  }
  assert.ok(state.bullets.every(b => b.life > 0), 'expired bullets are removed rather than accumulated');
});
