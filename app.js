import { PongGame } from './engine.mjs';

const game = new PongGame();
const byId = (id) => document.getElementById(id);
const canvas = byId('game-canvas');
const ctx = canvas.getContext('2d');
const court = byId('court');
const overlay = byId('court-overlay');
const keys = new Set();
const pointers = new Map();
const trail = [];
const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let lastTime = performance.now();
let previousStatus = null;
let previousUIState = '';
let audio = null;
let soundEnabled = false;
let rally = 0;
let longestRally = 0;
let scoreFlash = 0;

function announce(message) { byId('announcer').textContent = message; }

function clearInput() { keys.clear(); pointers.clear(); }

function resetEffects() {
  trail.length = 0;
  rally = 0;
  longestRally = 0;
  scoreFlash = 0;
  byId('rally-count').textContent = '0';
  clearInput();
}

function resetMatch(options) {
  game.reset(options);
  game.drainEvents();
  resetEffects();
  syncUI();
  announce('Nový zápas je připraven.');
}

function activateAudio() {
  if (!soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audio ??= new AudioContext();
  audio.resume().catch(() => {});
}

function beep(type) {
  if (!soundEnabled || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  const duration = type === 'win' ? 0.35 : type === 'score' ? 0.18 : 0.06;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime({ paddle: 480, wall: 300, score: 660, win: 880 }[type] || 400, now);
  oscillator.frequency.exponentialRampToValueAtTime(type === 'win' ? 1320 : 150, now + duration);
  gain.gain.setValueAtTime(0.035, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playOrPause() {
  activateAudio();
  if (game.status === 'ready' || game.status === 'finished') {
    resetEffects();
    game.start();
    canvas.focus({ preventScroll: true });
    announce('Zápas začíná.');
  } else {
    game.pause();
    clearInput();
    if (game.status === 'playing') canvas.focus({ preventScroll: true });
    announce(game.status === 'paused' ? 'Hra je pozastavená.' : 'Hra pokračuje.');
  }
  syncUI();
}

function syncUI() {
  const countdown = byId('serve-countdown');
  const serving = game.status === 'playing' && game.serveRemaining > 0;
  countdown.hidden = !serving;
  if (serving) countdown.textContent = Math.ceil(game.serveRemaining);
  const uiState = [game.status, game.mode, game.difficulty, game.scores.left, game.scores.right].join(':');
  if (uiState === previousUIState) return;
  previousUIState = uiState;
  const solo = game.mode === 'solo';
  byId('left-score').textContent = game.scores.left;
  byId('right-score').textContent = game.scores.right;
  byId('left-name').textContent = solo ? 'TY' : 'HRÁČ 1';
  byId('right-name').textContent = solo ? 'POČÍTAČ' : 'HRÁČ 2';
  byId('left-control-name').textContent = solo ? 'Tvoje pálka' : 'Hráč 1';
  byId('right-control-name').textContent = solo ? 'Také funguje' : 'Hráč 2';
  byId('court-help').textContent = solo ? 'Pohybuj pálkou pomocí W / S nebo šipek.' : 'Hráč 1: W / S. Hráč 2: šipky ↑ / ↓.';
  byId('difficulty-detail').textContent = solo ? { easy: 'Na rozehřátí', normal: 'Tak akorát', hard: 'Bez slitování' }[game.difficulty] : 'Hrajete proti sobě';
  document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === game.mode)));
  document.querySelectorAll('[data-difficulty]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.difficulty === game.difficulty));
    button.disabled = !solo;
  });
  byId('game-status').textContent = { ready: 'PŘIPRAVENO', playing: 'HRAJE SE', paused: 'PAUZA', finished: 'KONEC ZÁPASU' }[game.status];
  byId('game-status-dot').classList.toggle('is-paused', game.status === 'paused');
  byId('pause-button').disabled = !['playing', 'paused'].includes(game.status);
  byId('pause-button').setAttribute('aria-label', game.status === 'paused' ? 'Pokračovat ve hře' : 'Pozastavit hru');
  overlay.hidden = game.status === 'playing';
  if (previousStatus !== game.status) {
    trail.length = 0;
    const title = byId('overlay-title');
    const description = byId('overlay-description');
    const eyebrow = byId('overlay-eyebrow');
    if (game.status === 'ready') {
      eyebrow.textContent = 'TAK CO, JDEME NA TO?';
      title.innerHTML = 'Tvůj další<br />oblíbený souboj.';
      description.textContent = 'Pálka pod kontrolou. Oči na míčku.';
      byId('play-label').textContent = 'Začít hrát';
    } else if (game.status === 'paused') {
      eyebrow.textContent = 'NIC TI NEUTEČE';
      title.textContent = 'Malá pauza.';
      description.textContent = 'Až budeš připraven, pokračujeme.';
      byId('play-label').textContent = 'Pokračovat';
    } else if (game.status === 'finished') {
      const won = game.winner === 'left';
      eyebrow.textContent = 'DOBRÁ HRA!';
      title.textContent = solo ? (won ? 'Vítězství je tvoje.' : 'Příště to vyjde.') : `Hráč ${won ? '1' : '2'} vítězí.`;
      description.textContent = `Konečné skóre ${game.scores.left} : ${game.scores.right}. Dáme odvetu?`;
      byId('play-label').textContent = 'Ještě jeden zápas';
      announce(`${title.textContent} ${description.textContent}`);
    }
    previousStatus = game.status;
  }
}

function render(dt) {
  ctx.clearRect(0, 0, 1000, 600);
  ctx.fillStyle = '#111b15';
  ctx.fillRect(0, 0, 1000, 600);
  ctx.strokeStyle = '#758b5120';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 50; x < 1000; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, 600); }
  for (let y = 50; y < 600; y += 50) { ctx.moveTo(0, y); ctx.lineTo(1000, y); }
  ctx.stroke();
  ctx.strokeStyle = '#80916424';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 12]);
  ctx.beginPath();
  ctx.moveTo(500, 20);
  ctx.lineTo(500, 580);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#8091641c';
  ctx.beginPath();
  ctx.arc(500, 300, 82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#82915f24';
  ctx.beginPath();
  ctx.arc(500, 300, 4, 0, Math.PI * 2);
  ctx.fill();

  if (game.status === 'playing' && game.serveRemaining <= 0 && !motionReduced.matches) {
    trail.push({ x: game.ball.x, y: game.ball.y });
    if (trail.length > 9) trail.shift();
  } else { trail.length = 0; }
  trail.forEach((point, index) => {
    ctx.fillStyle = `rgba(205,249,112,${(index / trail.length) * 0.18})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, game.ball.radius * (index + 1) / trail.length, 0, Math.PI * 2);
    ctx.fill();
  });

  for (const [side, paddle] of Object.entries(game.paddles)) {
    ctx.fillStyle = side === 'left' ? '#cdf970' : '#edf3e5';
    ctx.shadowColor = side === 'left' ? '#cdf97038' : '#edf3e520';
    ctx.shadowBlur = motionReduced.matches ? 0 : 18;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 4);
    ctx.fill();
  }
  ctx.fillStyle = '#cdf970';
  ctx.shadowColor = '#cdf97080';
  ctx.shadowBlur = motionReduced.matches ? 0 : 18;
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (scoreFlash > 0 && !motionReduced.matches) {
    ctx.fillStyle = `rgba(205,249,112,${scoreFlash * 0.1})`;
    ctx.fillRect(0, 0, 1000, 600);
    scoreFlash = Math.max(0, scoreFlash - dt * 2.8);
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  const arrows = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
  const wasd = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
  const input = { left: game.mode === 'solo' ? Math.max(-1, Math.min(1, wasd + arrows)) : wasd, right: arrows };
  for (const pointer of pointers.values()) input[`${pointer.side}Target`] = pointer.y;
  game.update(dt, input);
  for (const event of game.drainEvents()) {
    beep(event.type);
    if (event.type === 'paddle') {
      rally++;
      longestRally = Math.max(longestRally, rally);
      byId('rally-count').textContent = longestRally;
    } else if (event.type === 'score') {
      rally = 0;
      trail.length = 0;
      scoreFlash = 1;
      announce(`Skóre ${game.scores.left} : ${game.scores.right}.`);
    }
  }
  syncUI();
  render(dt);
  requestAnimationFrame(frame);
}

byId('play-button').addEventListener('click', playOrPause);
byId('pause-button').addEventListener('click', playOrPause);
byId('reset-button').addEventListener('click', () => resetMatch());
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
  if (game.mode !== button.dataset.mode) resetMatch({ mode: button.dataset.mode });
}));
document.querySelectorAll('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
  if (game.difficulty !== button.dataset.difficulty) resetMatch({ difficulty: button.dataset.difficulty });
}));
byId('sound-button').addEventListener('click', () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) { announce('Tento prohlížeč nepodporuje herní zvuk.'); return; }
  soundEnabled = !soundEnabled;
  byId('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  const label = soundEnabled ? 'Vypnout zvuk' : 'Zapnout zvuk';
  byId('sound-button').setAttribute('aria-label', label);
  byId('sound-button').title = label;
  byId('sound-waves').setAttribute('d', soundEnabled ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6');
  activateAudio();
  beep('paddle');
});
if (!document.fullscreenEnabled) byId('fullscreen-button').hidden = true;
byId('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('.game-card').requestFullscreen();
  } catch { announce('Celá obrazovka není v tomto prohlížeči dostupná.'); }
});
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Ukončit celou obrazovku' : 'Celá obrazovka';
  byId('fullscreen-button').setAttribute('aria-label', label);
  byId('fullscreen-button').title = label;
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  } else if (event.code === 'Space') {
    if (event.target.closest('button, a')) return;
    event.preventDefault();
    if (!event.repeat) playOrPause();
  } else if (event.code === 'Escape' && game.status === 'playing') {
    event.preventDefault();
    game.pause();
    clearInput();
    syncUI();
  }
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
function autoPause() {
  clearInput();
  if (game.status === 'playing') { game.pause(); syncUI(); }
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

function pointerPosition(event) {
  const rect = court.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * 1000, y: (event.clientY - rect.top) / rect.height * 600 };
}
canvas.addEventListener('pointerdown', (event) => {
  if (game.status !== 'playing') return;
  event.preventDefault();
  const point = pointerPosition(event);
  pointers.set(event.pointerId, { side: game.mode === 'duo' && point.x >= 500 ? 'right' : 'left', y: point.y });
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({ preventScroll: true });
});
canvas.addEventListener('pointermove', (event) => {
  const pointer = pointers.get(event.pointerId);
  if (pointer) pointer.y = pointerPosition(event).y;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(event, (event) => pointers.delete(event.pointerId));
}

syncUI();
requestAnimationFrame(frame);
