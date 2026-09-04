import { FIELD, FX, MAX_TICKS_PER_FRAME, TICK, VIEW } from './config.js';
import { createRenderer } from './render.js';
import { createUi } from './ui.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { createSim } from './sim.js';
import { createGhost, createRecorder } from './replay.js';
import { storage } from './storage.js';
import { dailySeed, randomSeed, todayKey } from './rng.js';
import { createBot } from './autopilot.js';

const CYAN = '#6ce8ff';
const LIME = '#a8ff3e';
const GOLD = '#ffe23e';

const lerp = (a, b, t) => a + (b - a) * t;

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const renderer = createRenderer(canvas);

// La UI en DOM se calza exactamente sobre el campo de juego virtual, y `--u`
// le da una unidad relativa al campo en lugar de a la ventana.
function layoutStage() {
  renderer.resize();
  const vp = renderer.viewport;
  const w = VIEW.W * vp.scale;
  const h = VIEW.H * vp.scale;
  stage.style.left = `${vp.offsetX}px`;
  stage.style.top = `${vp.offsetY}px`;
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  stage.style.setProperty('--u', `${w / 100}px`);
}
const ui = createUi();
const audio = createAudio();
const fx = createFx();

let state = 'menu';           // menu | playing | paused | dead
let mode = 'endless';         // endless | daily
let sim = null;
let recorder = null;
let ghost = null;
let seed = '';

let pendingFlips = 0;
let acc = 0;
let last = performance.now();
let menuCamera = 0;

// Estado del tick anterior, para interpolar el render entre pasos de simulación.
const prev = { y: 0, rot: 0, distance: 0, ghostY: 0, ghostRot: 0 };

let deadAt = 0;
let uiShown = false;
let pendingResult = null;
let sessionAttempts = 0;
let fpsAvg = 60;
let ticksLastFrame = 0;

// `?autopilot=1` deja que el controlador heurístico juegue solo. Es para
// depurar y para grabar capturas, no una ayuda dentro del juego.
const params = new URLSearchParams(location.search);
const autopilot = params.has('autopilot') ? createBot({ greed: 1.4 }) : null;
const debug = autopilot || params.has('debug');

function startRun(nextMode = mode) {
  mode = nextMode;
  const dayKey = todayKey();
  seed = mode === 'daily' ? dailySeed(dayKey) : randomSeed();

  sim = createSim(seed);
  recorder = createRecorder();
  ghost = null;

  fx.clear();
  pendingFlips = 0;
  acc = 0;
  last = performance.now();
  prev.y = sim.state.player.y;
  prev.rot = sim.state.player.rotation;
  prev.distance = 0;

  if (mode === 'daily') {
    const saved = storage.loadGhost(seed);
    if (saved) {
      ghost = createGhost(saved.flips, saved.endTick);
      prev.ghostY = ghost.player.y;
      prev.ghostRot = ghost.player.rotation;
    }
    const attempts = storage.countDailyAttempt(dayKey);
    ui.setAttempt(`INTENTO ${attempts}`);
    ui.setBestLabel(`DAILY ${storage.daily(dayKey).best.toLocaleString('es-AR')}`);
  } else {
    sessionAttempts++;
    ui.setAttempt(sessionAttempts > 1 ? `INTENTO ${sessionAttempts}` : '');
    ui.setBestLabel(`BEST ${storage.best.toLocaleString('es-AR')}`);
  }

  ui.resetHudCache();
  ui.showPlaying();

  // Hasta el primer récord se enseña la mecánica: tocar rápido para flotar es
  // lo que separa sobrevivir de jugar, y no se descubre por intuición.
  if (storage.best === 0) ui.hint('TOCÁ RÁPIDO PARA FLOTAR');
  else ui.clearHint();

  state = 'playing';
  uiShown = false;
  pendingResult = null;

  audio.unlock();
  audio.resetMusic();
  audio.start();
}

function goMenu() {
  state = 'menu';
  sim = null;
  ghost = null;
  recorder = null;
  sessionAttempts = 0;
  fx.clear();
  ui.clearHint();
  ui.setAttempt('');
  ui.showMenu('TOCÁ PARA INVERTIR LA GRAVEDAD');
}

function handleDeath() {
  state = 'dead';
  deadAt = performance.now();
  uiShown = false;
  ui.clearHint();

  fx.shake = 1;
  fx.flash = 1;
  const py = sim.state.player.y;
  fx.burst(FIELD.playerX, py, 34, LIME, 420);
  fx.burst(FIELD.playerX, py, 18, CYAN, 320);
  audio.crash();

  const score = sim.scoreInt;
  const meters = sim.meters;
  const orbs = sim.state.orbs;
  const dayKey = todayKey();

  // El récord previo se lee antes de enviar el run, para poder mostrar el
  // progreso contra la marca a batir.
  const priorBest = mode === 'daily' ? storage.daily(dayKey).bestDistance : storage.bestDistance;

  const record = mode === 'daily'
    ? storage.submitDaily(score, meters, orbs, dayKey)
    : storage.submitEndless(score, meters);

  if (mode === 'daily' && record) {
    storage.saveGhost(seed, recorder.flips, sim.state.endTick, score);
  }

  let progress = 1;
  let progressLabel = 'PRIMER RUN';
  if (priorBest > 0) {
    progress = meters / priorBest;
    progressLabel = record
      ? 'RÉCORD SUPERADO'
      : `${Math.min(99, Math.round(progress * 100))}% DE TU RÉCORD · ${priorBest} M`;
  }

  pendingResult = {
    score,
    meters,
    orbs,
    maxCombo: sim.state.maxCombo,
    // En el primer run no había nada que superar: anunciar récord ahí le quita
    // valor al cartel cuando de verdad rompés tu marca.
    record: record && priorBest > 0,
    subtitle: mode === 'daily' ? `DAILY RUN · ${dayKey}` : 'UN TOQUE MÁS',
    attempt: mode === 'daily' ? `INTENTO ${storage.daily(dayKey).attempts}` : (sessionAttempts > 1 ? `INTENTO ${sessionAttempts}` : ''),
    progress,
    progressLabel
  };
}

function consumeEvents() {
  const events = sim.drainEvents();
  if (!events) return;
  for (const e of events) {
    switch (e.type) {
      case 'flip':
        fx.pulse = 1;
        fx.burst(FIELD.playerX, sim.state.player.y, 8, CYAN, 130);
        audio.flip(e.dir);
        break;
      case 'orb': {
        const x = e.x - sim.state.distance;
        fx.ring(x, e.y, 10, sim.state.fever ? LIME : GOLD, 150);
        audio.orb(e.combo);
        if (e.fever) {
          audio.feverOn();
          fx.flash = 0.45;
          ui.toast('FEVER', 'fever');
        } else if (e.combo > 1 && e.combo % 5 === 0) {
          ui.toast(`x${e.combo}`, 'combo');
        }
        break;
      }
      case 'graze':
        audio.graze();
        break;
      case 'comboDecay':
        audio.comboDecay();
        break;
    }
  }
}

function stepSimulation(rawDt) {
  acc += rawDt;
  let steps = 0;
  while (acc >= TICK && steps < MAX_TICKS_PER_FRAME) {
    prev.y = sim.state.player.y;
    prev.rot = sim.state.player.rotation;
    prev.distance = sim.state.distance;
    if (ghost && !ghost.finished) {
      prev.ghostY = ghost.player.y;
      prev.ghostRot = ghost.player.rotation;
    }

    let flip;
    if (autopilot) {
      flip = autopilot(sim);
    } else {
      flip = pendingFlips > 0;
      if (flip) pendingFlips--;
    }
    if (flip) recorder.record(sim.state.tick + 1);
    sim.step(flip);
    if (ghost) ghost.step();

    acc -= TICK;
    steps++;
    if (sim.state.dead) break;
  }
  ticksLastFrame = steps;
  // Si el navegador estuvo en segundo plano, se descarta el atraso en lugar de
  // simular cientos de ticks de golpe.
  if (steps >= MAX_TICKS_PER_FRAME) acc = 0;

  consumeEvents();
  if (sim.state.dead) handleDeath();
}

function frame(now) {
  const rawDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  if (rawDt > 0) fpsAvg = fpsAvg * 0.9 + (1 / rawDt) * 0.1;

  if (state === 'playing') stepSimulation(rawDt);

  const alpha = state === 'playing' ? Math.min(1, acc / TICK) : 1;
  const view = sim
    ? {
        camera: lerp(prev.distance, sim.state.distance, alpha),
        playerY: lerp(prev.y, sim.state.player.y, alpha),
        playerRotation: lerp(prev.rot, sim.state.player.rotation, alpha),
        ghostY: ghost ? lerp(prev.ghostY, ghost.player.y, alpha) : 0,
        ghostRotation: ghost ? lerp(prev.ghostRot, ghost.player.rotation, alpha) : 0,
        ghostActive: !!ghost && !ghost.finished && state !== 'menu'
      }
    : { camera: menuCamera, playerY: 0, playerRotation: 0, ghostY: 0, ghostRotation: 0, ghostActive: false };

  if (!sim) menuCamera += rawDt * 90;

  fx.update(rawDt);
  fx.scrollStars(rawDt, state === 'playing' ? sim.state.speed : 110);

  if (state === 'playing' && Math.random() < 0.75) {
    fx.trail(FIELD.playerX, view.playerY, sim.state.speed, sim.state.fever ? LIME : CYAN);
  }

  if (state === 'playing') {
    ui.setHud({
      score: sim.scoreInt,
      meters: sim.meters,
      combo: sim.state.combo,
      comboProgress: sim.comboProgress,
      fever: sim.state.fever
    });
  }

  if (state === 'dead' && !uiShown && now - deadAt >= FX.deathUiDelayMs) {
    uiShown = true;
    ui.showGameOver(pendingResult);
  }

  renderer.draw({
    sim,
    fx,
    view,
    state: state === 'paused' ? 'playing' : state,
    time: now
  });

  audio.updateMusic(state === 'playing', sim ? sim.state.fever : false);
  requestAnimationFrame(frame);
}

function primaryAction() {
  if (state === 'playing') {
    // Se acumulan hasta 3 toques por si llegan varios en un mismo frame.
    pendingFlips = Math.min(pendingFlips + 1, 3);
  } else if (state === 'paused') {
    state = 'playing';
    last = performance.now();
    acc = 0;
  } else if (state === 'dead') {
    startRun(mode);
  } else {
    startRun('endless');
  }
}

window.addEventListener('pointerdown', e => {
  if (e.target instanceof Element && e.target.closest('button')) return;
  e.preventDefault();
  primaryAction();
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    primaryAction();
  } else if (e.code === 'KeyD' && state === 'menu') {
    startRun('daily');
  }
});

ui.els.play.addEventListener('click', () => startRun('endless'));
ui.els.daily.addEventListener('click', () => startRun('daily'));
ui.els.retry.addEventListener('click', () => startRun(mode));
ui.els.home.addEventListener('click', goMenu);
ui.els.sound.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  ui.setSoundMuted(audio.muted);
});

window.addEventListener('resize', layoutStage);
window.addEventListener('orientationchange', layoutStage);

// Perder por cambiar de pestaña se siente injusto: se pausa y se retoma al tocar.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    state = 'paused';
    ui.toast('PAUSA', 'combo');
  }
  last = performance.now();
  acc = 0;
});

if (debug) {
  window.__fliprun = {
    info: () => ({
      state,
      mode,
      seed,
      fps: Math.round(fpsAvg),
      ticksLastFrame,
      tick: sim ? sim.state.tick : 0,
      meters: sim ? sim.meters : 0,
      score: sim ? sim.scoreInt : 0,
      orbs: sim ? sim.state.orbs : 0,
      combo: sim ? sim.state.combo : 0,
      playerY: sim ? Math.round(sim.state.player.y) : 0,
      dir: sim ? sim.state.player.dir : 0,
      vy: sim ? Math.round(sim.state.player.vy) : 0,
      pendingFlips,
      dead: sim ? sim.state.dead : false,
      killer: sim && sim.state.killer ? sim.state.killer : null,
      obstacles: sim ? sim.state.level.obstacles.length : 0,
      ghost: !!ghost && !ghost.finished,
      ghostY: ghost ? Math.round(ghost.player.y) : null
    }),
    start: m => startRun(m || 'endless')
  };
}

ui.setSoundMuted(audio.muted);
layoutStage();
goMenu();
requestAnimationFrame(frame);
window.__fliprunBooted = true;

// En desarrollo el service worker sólo estorba: se registra en producción y se
// desregistra explícitamente en local para no servir código viejo.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

if ('serviceWorker' in navigator) {
  if (isLocal || debug) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => {});
    if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
  } else if (location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}
