import { STORAGE_KEYS } from './config.js';
import { todayKey } from './rng.js';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado o cuota llena: el juego sigue funcionando sin persistencia */
  }
}

function readNumber(key) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) ? n : 0;
}

// Cache en memoria: la versión anterior leía localStorage en cada frame.
const cache = {
  best: readNumber(STORAGE_KEYS.best),
  bestDistance: readNumber(STORAGE_KEYS.bestDistance),
  muted: localStorage.getItem(STORAGE_KEYS.sound) === '0',
  daily: readJson(STORAGE_KEYS.daily, null),
  ghost: readJson(STORAGE_KEYS.ghost, null)
};

function freshDaily(dayKey) {
  return { day: dayKey, best: 0, bestDistance: 0, attempts: 0, orbs: 0 };
}

function dailyFor(dayKey) {
  if (!cache.daily || cache.daily.day !== dayKey) {
    cache.daily = freshDaily(dayKey);
  }
  return cache.daily;
}

export const storage = {
  get best() { return cache.best; },
  get bestDistance() { return cache.bestDistance; },
  get muted() { return cache.muted; },

  setMuted(value) {
    cache.muted = value;
    try { localStorage.setItem(STORAGE_KEYS.sound, value ? '0' : '1'); } catch {}
  },

  // Devuelve true si el run fue récord en su modo.
  submitEndless(score, distance) {
    let record = false;
    if (score > cache.best) {
      cache.best = score;
      try { localStorage.setItem(STORAGE_KEYS.best, String(score)); } catch {}
      record = true;
    }
    if (distance > cache.bestDistance) {
      cache.bestDistance = distance;
      try { localStorage.setItem(STORAGE_KEYS.bestDistance, String(distance)); } catch {}
    }
    return record;
  },

  daily(dayKey = todayKey()) {
    return { ...dailyFor(dayKey) };
  },

  countDailyAttempt(dayKey = todayKey()) {
    const d = dailyFor(dayKey);
    d.attempts++;
    writeJson(STORAGE_KEYS.daily, d);
    return d.attempts;
  },

  submitDaily(score, distance, orbs, dayKey = todayKey()) {
    const d = dailyFor(dayKey);
    let record = false;
    if (score > d.best) {
      d.best = score;
      d.orbs = orbs;
      record = true;
    }
    if (distance > d.bestDistance) d.bestDistance = distance;
    writeJson(STORAGE_KEYS.daily, d);
    return record;
  },

  // El ghost guarda solo la semilla y los ticks en los que se tocó: con la sim
  // determinista eso alcanza para reconstruir el run exacto.
  loadGhost(seed) {
    const g = cache.ghost;
    if (!g || g.seed !== seed || !Array.isArray(g.flips)) return null;
    return g;
  },

  saveGhost(seed, flips, endTick, score) {
    const prev = cache.ghost;
    if (prev && prev.seed === seed && prev.score >= score) return;
    cache.ghost = { seed, flips, endTick, score };
    writeJson(STORAGE_KEYS.ghost, cache.ghost);
  }
};
