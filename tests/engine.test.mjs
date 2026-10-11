import test from 'node:test';
import assert from 'node:assert/strict';
import { PongGame } from '../engine.mjs';

const makeGame = (options = {}) => new PongGame({ mode: 'duo', random: () => 0.5, ...options });
const tick = (game, seconds, input = {}) => {
  const frame = 1 / 240;
  for (let remaining = seconds; remaining > 1e-10; remaining -= frame) {
    game.update(Math.min(frame, remaining), input);
  }
};
const launch = (game, ball) => {
  game.start();
  game.serveRemaining = 0;
  Object.assign(game.ball, ball);
};

test('ready, start, pause, resume, and reset preserve the expected state', () => {
  const game = makeGame();
  assert.equal(game.status, 'ready');
  assert.deepEqual(game.scores, { left: 0, right: 0 });
  game.pause();
  assert.equal(game.status, 'ready');

  game.start();
  assert.equal(game.status, 'playing');
  assert.ok(game.serveRemaining > 0);
  tick(game, 0.7);
  assert.ok(game.ball.x > 500);
  game.pause();
  const state = structuredClone({ ball: game.ball, paddles: game.paddles });
  tick(game, 0.3, { left: 1, right: -1 });
  assert.deepEqual({ ball: game.ball, paddles: game.paddles }, state);
  game.pause();
  assert.equal(game.status, 'playing');

  game.reset({ mode: 'solo', difficulty: 'hard' });
  assert.equal(game.status, 'ready');
  assert.equal(game.mode, 'solo');
  assert.equal(game.difficulty, 'hard');
  assert.equal(game.winner, null);
  assert.equal(game.ball.x, 500);
  assert.equal(game.ball.y, 300);
  assert.equal(game.ball.vx, 0);
  assert.equal(game.paddles.left.y, 250);
});

test('keyboard and pointer movement are rate limited and stay inside the field', () => {
  const game = makeGame().start();
  tick(game, 0.1, { left: -1, right: 1 });
  assert.ok(Math.abs(game.paddles.left.y - 194) < 1e-8);
  assert.ok(Math.abs(game.paddles.right.y - 306) < 1e-8);
  tick(game, 1, { left: -1, right: 1 });
  assert.equal(game.paddles.left.y, 0);
  assert.equal(game.paddles.right.y, 500);

  game.update(1 / 60, { leftTarget: 450, rightTarget: 100 });
  assert.ok(game.paddles.left.y > 0 && game.paddles.left.y < 10);
  assert.ok(game.paddles.right.y < 500 && game.paddles.right.y > 490);
  tick(game, 1, { leftTarget: 450, rightTarget: 100 });
  assert.ok(Math.abs(game.paddles.left.y - 400) < 1e-8);
  assert.ok(Math.abs(game.paddles.right.y - 50) < 1e-8);
});

test('invalid frame durations and inputs do not poison the simulation', () => {
  const game = makeGame().start();
  const state = structuredClone(game.ball);
  for (const dt of [NaN, Infinity, -1, 0]) game.update(dt, { left: NaN });
  assert.deepEqual(game.ball, state);
  game.update(1, { left: Infinity, right: NaN, leftTarget: NaN });
  assert.equal(game.paddles.left.y, 250);
  assert.equal(game.paddles.right.y, 250);
  assert.ok(game.serveRemaining > 0.6, 'long frames should be capped');
});

test('top and bottom wall collisions reflect velocity and keep the ball in bounds', () => {
  const game = makeGame();
  launch(game, { x: 500, y: 10, vx: 100, vy: -400 });
  game.update(1 / 60);
  assert.ok(game.ball.vy > 0);
  assert.ok(game.ball.y >= game.ball.radius);
  assert.deepEqual(game.drainEvents(), [{ type: 'wall', side: 'top' }]);

  Object.assign(game.ball, { x: 500, y: 590, vx: 100, vy: 400 });
  game.update(1 / 60);
  assert.ok(game.ball.vy < 0);
  assert.ok(game.ball.y <= game.height - game.ball.radius);
  assert.deepEqual(game.drainEvents(), [{ type: 'wall', side: 'bottom' }]);
  assert.deepEqual(game.drainEvents(), []);
});

test('paddle hits bounce at an angle, accelerate, and are not counted repeatedly', () => {
  const game = makeGame();
  launch(game, { x: 60, y: 275, vx: -420, vy: 0 });
  game.update(1 / 30);
  assert.ok(game.ball.vx > 0);
  assert.ok(game.ball.vy < 0, 'the upper half sends the ball upward');
  assert.ok(Math.hypot(game.ball.vx, game.ball.vy) > 420);
  assert.deepEqual(game.drainEvents(), [{ type: 'paddle', side: 'left' }]);
  game.update(1 / 30);
  assert.deepEqual(game.drainEvents(), []);

  Object.assign(game.ball, { x: 940, y: 325, vx: 940, vy: 0 });
  game.update(1 / 30);
  assert.ok(game.ball.vx < 0);
  assert.ok(game.ball.vy > 0);
  assert.ok(Math.hypot(game.ball.vx, game.ball.vy) <= 960 + 1e-8);
  assert.deepEqual(game.drainEvents(), [{ type: 'paddle', side: 'right' }]);
});

test('a fast ball cannot tunnel through a paddle and a miss can cross the goal', () => {
  const game = makeGame();
  launch(game, { x: 65, y: 300, vx: -960, vy: 0 });
  game.update(1 / 30);
  assert.ok(game.ball.vx > 0);
  assert.equal(game.scores.right, 0);

  Object.assign(game.ball, { x: 15, y: 100, vx: -960, vy: 0 });
  game.update(1 / 30);
  assert.equal(game.scores.right, 1);
  assert.equal(game.status, 'playing');
  assert.equal(game.ball.x, 500);
  assert.equal(game.ball.y, 300);
  assert.ok(game.ball.vx < 0);
  assert.ok(game.serveRemaining > 0);
  assert.deepEqual(game.drainEvents(), [
    { type: 'paddle', side: 'left' },
    { type: 'score', side: 'right' },
  ]);
});

test('scoring waits for the whole ball to cross, ends at the winning score, and can restart', () => {
  const game = makeGame({ winningScore: 2 });
  launch(game, { x: 1008, y: 100, vx: 1, vy: 0 });
  game.update(1 / 60);
  assert.equal(game.scores.left, 0);
  game.ball.x = 1010;
  game.update(1 / 60);
  assert.equal(game.scores.left, 1);
  assert.equal(game.status, 'playing');
  assert.deepEqual(game.drainEvents(), [{ type: 'score', side: 'left' }]);

  game.serveRemaining = 0;
  Object.assign(game.ball, { x: 1010, y: 100, vx: 420, vy: 0 });
  game.update(1 / 60);
  assert.equal(game.scores.left, 2);
  assert.equal(game.status, 'finished');
  assert.equal(game.winner, 'left');
  assert.equal(game.ball.vx, 0);
  assert.deepEqual(game.drainEvents(), [{ type: 'score', side: 'left' }, { type: 'win', side: 'left' }]);
  tick(game, 1);
  assert.equal(game.scores.left, 2);
  game.pause();
  assert.equal(game.status, 'finished');
  game.start();
  assert.equal(game.status, 'playing');
  assert.equal(game.winner, null);
  assert.deepEqual(game.scores, { left: 0, right: 0 });
});

test('solo CPU intercepts the ball, follows difficulty speed caps, and ignores player-two input', () => {
  const movement = [];
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const game = makeGame({ mode: 'solo', difficulty });
    launch(game, { x: 700, y: 100, vx: 420, vy: 0 });
    game.update(1 / 30, { right: 1, rightTarget: 600 });
    assert.ok(game.paddles.right.y < 250);
    movement.push(250 - game.paddles.right.y);
  }
  assert.ok(movement[0] < movement[1] && movement[1] < movement[2]);

  const game = makeGame({ mode: 'solo', difficulty: 'hard' });
  launch(game, { x: 700, y: 80, vx: 420, vy: -300 });
  tick(game, 0.6);
  assert.ok(game.ball.vx < 0, 'CPU should return a shot after a top-wall bounce');
  assert.ok(game.drainEvents().some((event) => event.type === 'paddle' && event.side === 'right'));
});
