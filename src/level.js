import { FIELD, LEVEL, ORB, PLAYER } from './config.js';
import { speedAt, travelFor } from './physics.js';
import { chunkRng, range } from './rng.js';

// Generador determinista de niveles.
//
// Contrato de cada patrón: además de sus elementos, declara la ventana de
// alturas seguras donde el jugador puede estar al entrar y al salir. Con eso
// el generador calcula la separación mínima usando la física real, y ningún
// patrón puede volverse imposible al subir la dificultad. Al agregar patrones
// nuevos hay que respetar el contrato y validar con `node tools/audit.mjs`.

const lerp = (a, b, t) => a + (b - a) * t;
const R = PLAYER.radius;
const CEIL = FIELD.ceilingY;
const FLOOR = FIELD.floorY;

// Una ventana degenerada (lo > hi) significaría un patrón imposible; se colapsa
// a su punto medio para que el cálculo de separación siga siendo conservador.
const win = (lo, hi) => (lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2]);

const fullWindow = () => win(CEIL + R, FLOOR - R);
const floorWindow = h => win(CEIL + R, FLOOR - h - R);
const ceilWindow = h => win(CEIL + h + R, FLOOR - R);
const gapWindow = (cy, gap) => win(cy - gap / 2 + R, cy + gap / 2 - R);

// Separación vertical entre dos ventanas seguras: 0 si se solapan.
function windowGap(a, b) {
  if (!a || !b) return 0;
  if (b[0] > a[1]) return b[0] - a[1];
  if (a[0] > b[1]) return a[0] - b[1];
  return 0;
}

function floorBlock(x, w, h) {
  return { x, y: FLOOR - h, w, h, kind: 'block' };
}

function ceilBlock(x, w, h) {
  return { x, y: CEIL, w, h, kind: 'block' };
}

function pillarBlock(x, w, cy, h) {
  return { x, y: cy - h / 2, w, h, kind: 'pillar' };
}

function gapCenterY(t, gap) {
  const margin = gap / 2 + 10;
  return lerp(CEIL + margin, FLOOR - margin, t);
}

// Gate: bloque de techo + bloque de piso con un hueco. Obliga a enhebrar.
// El orbe se apoya contra uno de los labios, así cobrarlo exige rozar.
function gate(out, x, w, gap, t, rng, withOrb = true) {
  const cy = gapCenterY(t, gap);
  const topH = cy - gap / 2 - CEIL;
  const botH = FLOOR - (cy + gap / 2);
  if (topH > 6) out.obstacles.push(ceilBlock(x, w, topH));
  if (botH > 6) out.obstacles.push(floorBlock(x, w, botH));
  if (withOrb) {
    // En huecos angostos el orbe se corre al centro antes que volverse imposible.
    const lip = Math.min(ORB.faceOffset, gap / 2);
    out.orbs.push({ x: x + w / 2, y: rng() < 0.5 ? cy - gap / 2 + lip : cy + gap / 2 - lip });
  }
  return gapWindow(cy, gap);
}

function orbAtFace(x, faceY, outward) {
  return { x, y: faceY + outward * ORB.faceOffset };
}

const PATTERNS = {
  singleSpike({ rng, d }, out) {
    const w = range(rng, 48, 76);
    const h = lerp(160, 265, d) * range(rng, 0.86, 1.08);
    const onFloor = rng() < 0.5;
    out.obstacles.push(onFloor ? floorBlock(0, w, h) : ceilBlock(0, w, h));
    out.orbs.push(orbAtFace(w / 2, onFloor ? FLOOR - h : CEIL + h, onFloor ? -1 : 1));
    const win = onFloor ? floorWindow(h) : ceilWindow(h);
    return { length: w, entry: win, exit: win };
  },

  // Púas alternadas. No fuerzan cruzar el corredor (las ventanas se solapan en
  // el centro), así que funciona como patrón de lectura y ritmo.
  stagger3({ rng, d, travel }, out) {
    const w = range(rng, 44, 62);
    const minRoom = lerp(190, 130, d);
    let onFloor = rng() < 0.5;
    let x = 0;
    let firstWin = null;
    let lastWin = null;

    for (let i = 0; i < 3; i++) {
      const h = lerp(150, 245, d) * range(rng, 0.85, 1.05);
      const win = onFloor ? floorWindow(h) : ceilWindow(h);
      if (i > 0) x += w + Math.max(minRoom, travel(windowGap(lastWin, win)));
      out.obstacles.push(onFloor ? floorBlock(x, w, h) : ceilBlock(x, w, h));
      out.orbs.push(orbAtFace(x + w / 2, onFloor ? FLOOR - h : CEIL + h, onFloor ? -1 : 1));
      if (i === 0) firstWin = win;
      lastWin = win;
      onFloor = !onFloor;
    }
    return { length: x + w, entry: firstWin, exit: lastWin };
  },

  // Tres bloques del mismo lado. Es el complemento de stagger3: en vez de
  // obligar a cruzar el corredor, enseña a sostener una altura con toques
  // cortos, que es la habilidad de base del juego.
  sameSideRun({ rng, d, travel }, out) {
    const onFloor = rng() < 0.5;
    const w = range(rng, 50, 72);
    const count = 2 + (rng() < 0.5 ? 1 : 0);
    let x = 0;
    let firstWin = null;
    let lastWin = null;

    for (let i = 0; i < count; i++) {
      const h = lerp(130, 205, d) * range(rng, 0.88, 1.08);
      const wi = onFloor ? floorWindow(h) : ceilWindow(h);
      if (i > 0) x += w + Math.max(lerp(200, 150, d), travel(windowGap(lastWin, wi)));
      out.obstacles.push(onFloor ? floorBlock(x, w, h) : ceilBlock(x, w, h));
      out.orbs.push(orbAtFace(x + w / 2, onFloor ? FLOOR - h : CEIL + h, onFloor ? -1 : 1));
      if (i === 0) firstWin = wi;
      lastWin = wi;
    }
    return { length: x + w, entry: firstWin, exit: lastWin };
  },

  wideGate({ rng, d }, out) {
    const w = range(rng, 52, 78);
    const win = gate(out, 0, w, lerp(210, 165, d), range(rng, 0.22, 0.78), rng);
    return { length: w, entry: win, exit: win };
  },

  // Respiro con recompensa: hay que trazar el arco con toques cortos.
  orbArc({ rng, travel }, out) {
    const t0 = range(rng, 0.15, 0.4);
    const t1 = range(rng, 0.6, 0.88);
    const span = Math.abs(gapCenterY(t1, 0) - gapCenterY(t0, 0));
    const len = Math.max(420, travel(span) * 1.6);
    const count = 5 + Math.floor(rng() * 3);
    const flip = rng() < 0.5;

    for (let i = 0; i < count; i++) {
      const p = i / (count - 1);
      const curve = flip ? Math.sin(p * Math.PI) : 1 - Math.sin(p * Math.PI);
      out.orbs.push({ x: p * len, y: gapCenterY(lerp(t0, t1, curve), 0) });
    }
    return { length: len, entry: fullWindow(), exit: fullWindow() };
  },

  // Onda de dos crestas, sin obstáculos. Entrena el ritmo de subir y bajar
  // sostenido, que es lo que separa flotar de caerse. Cobrar la cadena entera
  // exige encadenar con inercia, no ir orbe por orbe.
  orbWave({ rng, travel }, out) {
    const lo = range(rng, 0.16, 0.3);
    const hi = range(rng, 0.7, 0.88);
    const span = Math.abs(gapCenterY(hi, 0) - gapCenterY(lo, 0));
    const len = Math.max(860, travel(span) * 3);
    const count = 9 + Math.floor(rng() * 4);
    const rising = rng() < 0.5;

    for (let i = 0; i < count; i++) {
      const p = i / (count - 1);
      const phase = (1 - Math.cos(p * Math.PI * 4)) / 2;
      const t = lerp(lo, hi, rising ? phase : 1 - phase);
      out.orbs.push({ x: p * len, y: gapCenterY(t, 0) });
    }
    return { length: len, entry: fullWindow(), exit: fullWindow() };
  },

  gateRun({ rng, d, travel }, out) {
    const w = range(rng, 48, 68);
    const gap = lerp(200, 155, d);
    const tA = range(rng, 0.2, 0.5);
    const tB = tA + range(rng, 0.28, 0.48);
    const winA = gapWindow(gapCenterY(tA, gap), gap);
    const winB = gapWindow(gapCenterY(tB, gap), gap);
    const step = w + Math.max(lerp(230, 165, d), travel(windowGap(winA, winB)));
    gate(out, 0, w, gap, tA, rng);
    gate(out, step, w, gap, tB, rng);
    return { length: step + w, entry: winA, exit: winB };
  },

  pillarPair({ rng, d, travel }, out) {
    const w = range(rng, 46, 66);
    const h = lerp(190, 300, d);
    const cyA = gapCenterY(range(rng, 0.28, 0.44), 0);
    const cyB = gapCenterY(range(rng, 0.56, 0.72), 0);
    // Se declara un solo lado como ruta prevista; el otro queda como opción.
    const belowA = rng() < 0.5;
    const belowB = rng() < 0.5;
    const winA = belowA ? win(cyA + h / 2 + R, FLOOR - R) : win(CEIL + R, cyA - h / 2 - R);
    const winB = belowB ? win(cyB + h / 2 + R, FLOOR - R) : win(CEIL + R, cyB - h / 2 - R);
    const step = w + Math.max(lerp(220, 160, d), travel(windowGap(winA, winB)));

    out.obstacles.push(pillarBlock(0, w, cyA, h));
    out.obstacles.push(pillarBlock(step, w, cyB, h));
    out.orbs.push(orbAtFace(w / 2, belowA ? cyA + h / 2 : cyA - h / 2, belowA ? 1 : -1));
    out.orbs.push(orbAtFace(step + w / 2, belowB ? cyB + h / 2 : cyB - h / 2, belowB ? 1 : -1));
    return { length: step + w, entry: winA, exit: winB };
  },

  // Obliga a cruzar el corredor en diagonal, sin poder acampar en una pared.
  pinch({ rng, d, travel }, out) {
    const w = range(rng, 60, 86);
    const h = lerp(300, 420, d);
    const topFirst = rng() < 0.5;
    const winA = topFirst ? ceilWindow(h) : floorWindow(h);
    const winB = topFirst ? floorWindow(h) : ceilWindow(h);
    const step = w + Math.max(lerp(200, 150, d), travel(windowGap(winA, winB)));

    out.obstacles.push(topFirst ? ceilBlock(0, w, h) : floorBlock(0, w, h));
    out.obstacles.push(topFirst ? floorBlock(step, w, h) : ceilBlock(step, w, h));
    out.orbs.push(orbAtFace(w / 2, topFirst ? CEIL + h : FLOOR - h, topFirst ? 1 : -1));
    out.orbs.push(orbAtFace(step + w / 2, topFirst ? FLOOR - h : CEIL + h, topFirst ? -1 : 1));
    return { length: step + w, entry: winA, exit: winB };
  },

  spikeComb({ rng, d }, out) {
    const count = 3 + Math.floor(rng() * 2);
    const w = range(rng, 26, 38);
    const step = lerp(140, 96, d);
    const h = lerp(170, 250, d);
    const onFloor = rng() < 0.5;
    for (let i = 0; i < count; i++) {
      out.obstacles.push(onFloor ? floorBlock(i * step, w, h) : ceilBlock(i * step, w, h));
    }
    const len = (count - 1) * step + w;
    out.orbs.push(orbAtFace(len / 2, onFloor ? FLOOR - h : CEIL + h, onFloor ? -1 : 1));
    const win = onFloor ? floorWindow(h) : ceilWindow(h);
    return { length: len, entry: win, exit: win };
  },

  narrowGate({ rng, d }, out) {
    const w = range(rng, 56, 84);
    const win = gate(out, 0, w, lerp(158, 116, d), range(rng, 0.18, 0.82), rng);
    return { length: w, entry: win, exit: win };
  },

  zigzagGates({ rng, d, travel }, out) {
    const w = range(rng, 44, 60);
    const gap = lerp(185, 140, d);
    const high = rng() < 0.5;
    const minRoom = lerp(240, 175, d);
    let x = 0;
    let firstWin = null;
    let lastWin = null;

    for (let i = 0; i < 3; i++) {
      const t = (i % 2 === 0) === high ? range(rng, 0.16, 0.32) : range(rng, 0.68, 0.84);
      const cy = gapCenterY(t, gap);
      const win = gapWindow(cy, gap);
      if (i > 0) x += w + Math.max(minRoom, travel(windowGap(lastWin, win)));
      gate(out, x, w, gap, t, rng, i !== 1);
      if (i === 0) firstWin = win;
      lastWin = win;
    }
    return { length: x + w, entry: firstWin, exit: lastWin };
  },

  // El test de habilidad principal: sostener la altura con toques rápidos.
  tunnel({ rng, d }, out) {
    const len = lerp(320, 460, rng());
    const laneH = lerp(168, 118, d);
    const cy = gapCenterY(range(rng, 0.2, 0.8), laneH);
    const topH = cy - laneH / 2 - CEIL;
    const botH = FLOOR - (cy + laneH / 2);
    if (topH > 6) out.obstacles.push(ceilBlock(0, len, topH));
    if (botH > 6) out.obstacles.push(floorBlock(0, len, botH));
    for (let i = 0; i < 3; i++) out.orbs.push({ x: len * (i + 0.5) / 3, y: cy });
    const win = gapWindow(cy, laneH);
    return { length: len, entry: win, exit: win };
  },

  crossPinch({ rng, d, travel }, out) {
    const w = range(rng, 70, 96);
    const h = lerp(420, 500, d);
    const topFirst = rng() < 0.5;
    const winA = topFirst ? ceilWindow(h) : floorWindow(h);
    const winB = topFirst ? floorWindow(h) : ceilWindow(h);
    const step = w + Math.max(lerp(240, 190, d), travel(windowGap(winA, winB)));

    out.obstacles.push(topFirst ? ceilBlock(0, w, h) : floorBlock(0, w, h));
    out.obstacles.push(topFirst ? floorBlock(step, w, h) : ceilBlock(step, w, h));
    out.orbs.push({ x: step / 2 + w / 2, y: gapCenterY(0.5, 0) });
    return { length: step + w, entry: winA, exit: winB };
  },

  needleGates({ rng, d, travel }, out) {
    const w = range(rng, 40, 54);
    const gap = lerp(140, 108, d);
    const tA = range(rng, 0.25, 0.75);
    const tB = tA + (rng() < 0.5 ? 0.2 : -0.2);
    const winA = gapWindow(gapCenterY(tA, gap), gap);
    const winB = gapWindow(gapCenterY(tB, gap), gap);
    const step = w + Math.max(lerp(215, 170, d), travel(windowGap(winA, winB)));

    gate(out, 0, w, gap, tA, rng);
    gate(out, step, w, gap, tB, rng, false);
    return { length: step + w, entry: winA, exit: winB };
  },

  // Escalera de carriles: el salto entre tramos se dimensiona con la física.
  staircase({ rng, d, travel }, out) {
    const laneH = lerp(190, 152, d);
    const segW = lerp(122, 96, d);
    const stepY = 70;
    const segments = 4;

    const minCy = CEIL + laneH / 2 + 12;
    const maxCy = FLOOR - laneH / 2 - 12;
    const travelY = stepY * (segments - 1);
    const down = rng() < 0.5;
    const startCy = down
      ? range(rng, minCy, Math.max(minCy, maxCy - travelY))
      : range(rng, Math.min(maxCy, minCy + travelY), maxCy);

    let x = 0;
    let firstWin = null;
    let lastWin = null;

    for (let i = 0; i < segments; i++) {
      const cy = startCy + (down ? 1 : -1) * stepY * i;
      const win = gapWindow(cy, laneH);
      if (i > 0) x += segW + Math.max(110, travel(windowGap(lastWin, win)));
      const topH = cy - laneH / 2 - CEIL;
      const botH = FLOOR - (cy + laneH / 2);
      if (topH > 6) out.obstacles.push(ceilBlock(x, segW, topH));
      if (botH > 6) out.obstacles.push(floorBlock(x, segW, botH));
      out.orbs.push({ x: x + segW / 2, y: cy });
      if (i === 0) firstWin = win;
      lastWin = win;
    }
    return { length: x + segW, entry: firstWin, exit: lastWin };
  }
};

const TIERS = [
  { from: 0.00, names: ['singleSpike', 'stagger3', 'sameSideRun', 'wideGate', 'orbArc', 'orbWave'] },
  { from: 0.15, names: ['gateRun', 'pillarPair', 'pinch', 'spikeComb'] },
  { from: 0.42, names: ['narrowGate', 'zigzagGates', 'tunnel', 'crossPinch'] },
  { from: 0.70, names: ['needleGates', 'staircase'] }
];

// Patrones sin obstáculos: recompensa sin riesgo. Sirven para dar aire después
// de un tramo exigente, pero su frecuencia se controla por ritmo, no por azar.
const BREATHERS = new Set(['orbArc', 'orbWave']);

function eligible(d) {
  const names = [];
  for (const tier of TIERS) if (d >= tier.from) names.push(...tier.names);
  return names;
}

// Elige el patrón respetando el ritmo de respiros.
function choosePattern(rng, d, sinceBreather, lastName) {
  const all = eligible(d);
  const forced = sinceBreather >= LEVEL.breatherMax;
  const allowed = all.filter(n => (BREATHERS.has(n)
    ? forced || sinceBreather >= LEVEL.breatherMin
    : !forced));
  const names = allowed.length ? allowed : all;

  const name = names[Math.floor(rng() * names.length)];
  // Un solo reintento para evitar repetir patrón; sigue siendo determinista.
  return name === lastName ? names[Math.floor(rng() * names.length)] : name;
}

export function createLevel(seed) {
  const obstacles = [];
  const orbs = [];
  let index = 0;
  let cursor = LEVEL.introRunway;
  let lastName = '';
  let sinceBreather = 0;
  // Secuencia de patrones generados. No la usa el juego: existe para poder
  // auditar el ritmo desde las herramientas.
  const patterns = [];
  // El jugador arranca apoyado en el piso.
  let prevExit = [FLOOR - R, FLOOR - R];

  function generateChunk() {
    // La apertura ignora la semilla del run: mismo arranque para todos, y el
    // tramo procedural arranca siempre desde el mismo estado.
    const rng = chunkRng(index < LEVEL.openingChunks ? LEVEL.openingSeed : seed, index);
    const d = Math.min(1, cursor / LEVEL.difficultyDistance);
    const speed = speedAt(cursor);
    const ctx = {
      rng,
      d,
      travel: dy => travelFor(dy, speed, LEVEL.travelSafety, LEVEL.travelBase)
    };

    // El primer tramo es siempre la cadena de orbes: no tiene obstáculos, así
    // que enseña a maniobrar y premia antes de poder matarte.
    const name = index === 0 ? 'orbArc' : choosePattern(rng, d, sinceBreather, lastName);
    lastName = name;
    sinceBreather = BREATHERS.has(name) ? 0 : sinceBreather + 1;
    patterns.push(name);

    const out = { obstacles: [], orbs: [] };
    const shape = PATTERNS[name](ctx, out);

    // Aire previo: nunca menos de lo que exige reubicarse desde el patrón
    // anterior hasta la ventana de entrada de este.
    const base = lerp(LEVEL.restStart, LEVEL.restMin, d);
    const rest = Math.max(base, ctx.travel(windowGap(prevExit, shape.entry)));
    const originX = cursor + rest;

    for (const o of out.obstacles) {
      o.x += originX;
      o.glow = rng();
      o.pattern = name;
      obstacles.push(o);
    }
    for (const o of out.orbs) {
      orbs.push({ x: o.x + originX, y: o.y, taken: false, pattern: name });
    }

    cursor = originX + shape.length;
    prevExit = shape.exit;
    index++;
  }

  return {
    obstacles,
    orbs,
    patterns,
    ensureAhead(worldX) {
      while (cursor < worldX) generateChunk();
    },
    prune(minX) {
      let i = 0;
      while (i < obstacles.length && obstacles[i].x + obstacles[i].w < minX) i++;
      if (i > 0) obstacles.splice(0, i);
      let j = 0;
      while (j < orbs.length && orbs[j].x < minX) j++;
      if (j > 0) orbs.splice(0, j);
    }
  };
}
