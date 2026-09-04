// Todos los números que se tocan al balancear el juego viven acá.
// El resto del código no debería tener constantes de gameplay hardcodeadas.

// Campo de juego virtual. Se escala con letterbox al canvas real, así que el
// juego es idéntico en cualquier pantalla: misma ventana de reacción para todos.
export const VIEW = { W: 540, H: 960 };

export const TICK = 1 / 120;
export const MAX_TICKS_PER_FRAME = 12;

export const FIELD = {
  ceilingY: 132,
  floorY: 858,
  playerX: 128
};

export const CORRIDOR_H = FIELD.floorY - FIELD.ceilingY;

export const PLAYER = {
  radius: 15,
  gravity: 4600,
  maxFallSpeed: 2100,
  // Hitbox algo menor que el sprite: las muertes deben sentirse merecidas.
  hitboxScale: 0.8
};

export const SPEED = {
  start: 470,
  max: 760,
  // La velocidad depende de la distancia, no del tiempo: mantiene el
  // determinismo y hace que dos runs de la misma semilla sean idénticas.
  rampPerUnit: 0.0235
};

export const ORB = {
  radius: 9,
  grabRadius: 30,
  baseValue: 12,
  // Distancia entre la cara del obstáculo y el centro del orbe. Tiene que ser
  // al menos `PLAYER.radius + grabRadius` para que la zona de cobro entera
  // caiga en territorio seguro: el orbe debe pedir precisión, no un imposible.
  faceOffset: 45
};

export const COMBO = {
  feverAt: 8,
  max: 99,
  // Distancia sin cobrar orbes antes de perder un multiplicador.
  decayDistance: 780
};

export const SCORE = {
  perUnitDistance: 0.006,
  feverMultiplier: 2
};

export const LEVEL = {
  spawnAhead: 1000,
  despawnBehind: 240,
  restStart: 340,
  restMin: 150,
  difficultyDistance: 14000,
  // Holgura sobre la distancia teórica que exige un cambio de altura. Bajarlo
  // aprieta el juego; si baja demasiado, `tools/audit.mjs` empieza a encontrar
  // tramos imposibles.
  travelSafety: 1.25,
  travelBase: 28
};

export const FX = {
  grazeDistance: 26,
  deathFreezeMs: 240,
  deathUiDelayMs: 260
};

export const STORAGE_KEYS = {
  best: 'fliprun.best.v2',
  bestDistance: 'fliprun.bestDistance.v2',
  sound: 'fliprun.sound.v2',
  daily: 'fliprun.daily.v2',
  ghost: 'fliprun.ghost.v2'
};
