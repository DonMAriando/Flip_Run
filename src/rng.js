export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Un generador propio por chunk. Es lo que garantiza que el nivel sea idéntico
// para todos: ningún consumo de azar depende de cómo jugó la persona.
export function chunkRng(seed, index) {
  return mulberry32(hashString(`${seed}#${index}`));
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailySeed(dayKey = todayKey()) {
  return `FLIPRUN-DAILY-${dayKey}`;
}

export function randomSeed() {
  return `FLIPRUN-${Math.floor(Math.random() * 0xFFFFFFFF).toString(36)}`;
}

// Helpers de rango, siempre a partir de un rng inyectado.
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}
