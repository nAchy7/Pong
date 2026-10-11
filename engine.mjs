const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 100;
const PADDLE_SPEED = 560;
const BALL_RADIUS = 9;
const INITIAL_BALL_SPEED = 420;
const MAX_BALL_SPEED = 960;
const SERVE_DELAY = 0.65;
const MAX_FRAME_TIME = 1 / 30;
const MAX_STEP_TIME = 1 / 240;

const AI_SETTINGS = {
  easy: { speed: 280, prediction: 0.35, error: 100 },
  normal: { speed: 400, prediction: 0.75, error: 42 },
  hard: { speed: 540, prediction: 1, error: 10 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validAxis = (value) => Number.isFinite(value) ? clamp(value, -1, 1) : 0;

/**
 * DOM-independent Pong simulation. Positions use a 1000 × 600 logical field;
 * paddle y is its top edge, while ball x/y describe its center.
 * Input axes range from -1 (up) to +1 (down), and pointer targets are centers.
 * Large animation gaps are capped to avoid teleporting after a suspended tab.
 */
export class PongGame {
  constructor({ mode = 'solo', difficulty = 'normal', winningScore = 7, random = Math.random } = {}) {
    this.width = FIELD_WIDTH;
    this.height = FIELD_HEIGHT;
    this.winningScore = Number.isInteger(winningScore) && winningScore > 0 ? winningScore : 7;
    this.random = typeof random === 'function' ? random : Math.random;
    this.paddles = {
      left: { x: 32, y: 0, width: PADDLE_WIDTH, height: PADDLE_HEIGHT },
      right: { x: FIELD_WIDTH - 32 - PADDLE_WIDTH, y: 0, width: PADDLE_WIDTH, height: PADDLE_HEIGHT },
    };
    this.ball = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0, radius: BALL_RADIUS };
    this.scores = { left: 0, right: 0 };
    this._events = [];
    this.reset({ mode, difficulty });
  }

  reset({ mode = this.mode, difficulty = this.difficulty } = {}) {
    this.mode = mode === 'duo' ? 'duo' : 'solo';
    this.difficulty = Object.hasOwn(AI_SETTINGS, difficulty) ? difficulty : 'normal';
    this.status = 'ready';
    this.winner = null;
    this.scores.left = 0;
    this.scores.right = 0;
    this.paddles.left.y = (this.height - PADDLE_HEIGHT) / 2;
    this.paddles.right.y = (this.height - PADDLE_HEIGHT) / 2;
    this.ball.x = this.width / 2;
    this.ball.y = this.height / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.serveRemaining = 0;
    this._aiBias = 0;
    this._events.length = 0;
    return this;
  }

  start() {
    this.reset();
    this.status = 'playing';
    this._serve(this._randomUnit() < 0.5 ? -1 : 1);
    return this;
  }

  pause() {
    if (this.status === 'playing') this.status = 'paused';
    else if (this.status === 'paused') this.status = 'playing';
    return this;
  }

  drainEvents() {
    return this._events.splice(0);
  }

  update(dt, input = {}) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;

    const frameTime = Math.min(dt, MAX_FRAME_TIME);
    const steps = Math.ceil(frameTime / MAX_STEP_TIME);
    const stepTime = frameTime / steps;

    for (let step = 0; step < steps && this.status === 'playing'; step += 1) {
      this._movePaddle(this.paddles.left, input.left, input.leftTarget, PADDLE_SPEED, stepTime);

      if (this.mode === 'solo') {
        const settings = AI_SETTINGS[this.difficulty];
        this._movePaddle(this.paddles.right, 0, this._cpuTarget(settings), settings.speed, stepTime);
      } else {
        this._movePaddle(this.paddles.right, input.right, input.rightTarget, PADDLE_SPEED, stepTime);
      }

      let activeTime = stepTime;
      if (this.serveRemaining > 0) {
        const waitingTime = Math.min(this.serveRemaining, stepTime);
        this.serveRemaining = Math.max(0, this.serveRemaining - waitingTime);
        activeTime -= waitingTime;
      }
      if (activeTime > 0) this._moveBall(activeTime);
    }
  }

  _randomUnit() {
    const value = this.random();
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
  }

  _serve(direction) {
    const angle = (this._randomUnit() - 0.5) * 0.65;
    this.ball.x = this.width / 2;
    this.ball.y = this.height / 2;
    this.ball.vx = direction * INITIAL_BALL_SPEED * Math.cos(angle);
    this.ball.vy = INITIAL_BALL_SPEED * Math.sin(angle);
    this.serveRemaining = SERVE_DELAY;
    this._aiBias = (this._randomUnit() * 2 - 1) * AI_SETTINGS[this.difficulty].error;
  }

  _movePaddle(paddle, axis, target, speed, dt) {
    const distance = Number.isFinite(target)
      ? clamp(target - (paddle.y + paddle.height / 2), -speed * dt, speed * dt)
      : validAxis(axis) * speed * dt;
    paddle.y = clamp(paddle.y + distance, 0, this.height - paddle.height);
  }

  _cpuTarget(settings) {
    if (this.ball.vx <= 0) return this.height / 2;

    const face = this.paddles.right.x - this.ball.radius;
    const travelTime = Math.max(0, (face - this.ball.x) / this.ball.vx);
    const span = this.height - this.ball.radius * 2;
    const projected = this.ball.y - this.ball.radius + this.ball.vy * travelTime;
    const folded = ((projected % (2 * span)) + 2 * span) % (2 * span);
    const interception = this.ball.radius + (folded <= span ? folded : 2 * span - folded);
    return clamp(
      this.ball.y + (interception - this.ball.y) * settings.prediction + this._aiBias,
      PADDLE_HEIGHT / 2,
      this.height - PADDLE_HEIGHT / 2,
    );
  }

  _moveBall(dt) {
    const ball = this.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y < ball.radius) {
      ball.y = 2 * ball.radius - ball.y;
      ball.vy = Math.abs(ball.vy);
      this._events.push({ type: 'wall', side: 'top' });
    } else if (ball.y > this.height - ball.radius) {
      ball.y = 2 * (this.height - ball.radius) - ball.y;
      ball.vy = -Math.abs(ball.vy);
      this._events.push({ type: 'wall', side: 'bottom' });
    }

    const side = ball.vx < 0 ? 'left' : 'right';
    const paddle = this.paddles[side];
    const nearestX = clamp(ball.x, paddle.x, paddle.x + paddle.width);
    const nearestY = clamp(ball.y, paddle.y, paddle.y + paddle.height);
    if ((ball.x - nearestX) ** 2 + (ball.y - nearestY) ** 2 <= ball.radius ** 2) {
      const offset = clamp((ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2), -1, 1);
      const angle = offset * Math.PI * 0.34;
      const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.065);
      ball.x = side === 'left' ? paddle.x + paddle.width + ball.radius : paddle.x - ball.radius;
      ball.vx = (side === 'left' ? 1 : -1) * speed * Math.cos(angle);
      ball.vy = speed * Math.sin(angle);
      this._events.push({ type: 'paddle', side });
    }

    if (ball.x + ball.radius < 0) this._score('right');
    else if (ball.x - ball.radius > this.width) this._score('left');
  }

  _score(side) {
    this.scores[side] += 1;
    this._events.push({ type: 'score', side });

    if (this.scores[side] >= this.winningScore) {
      this.status = 'finished';
      this.winner = side;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this._events.push({ type: 'win', side });
      return;
    }

    // Serve toward the player who conceded the point.
    this._serve(side === 'left' ? 1 : -1);
  }
}
