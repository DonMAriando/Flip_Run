// Controlador heurístico. Cumple dos funciones: en las herramientas valida que
// el nivel sea jugable y los orbes alcanzables, y en el juego habilita el modo
// autopilot (`?autopilot=1`) para depurar sin jugar a mano.
//
// No pretende jugar óptimo: para eso está `tools/solve.mjs`. Sirve como proxy
// de una persona competente, para detectar diseños que "en teoría se pueden"
// pero en la práctica no se leen.
import { FIELD, ORB, PLAYER } from './config.js';

const TOP = FIELD.ceilingY + PLAYER.radius;
const BOTTOM = FIELD.floorY - PLAYER.radius;

function reachableWindow(obstacles, bandStart, bandEnd, y) {
  const blocked = [];
  for (const o of obstacles) {
    if (o.x + o.w < bandStart || o.x > bandEnd) continue;
    blocked.push([o.y, o.y + o.h]);
  }
  if (!blocked.length) return [TOP, BOTTOM];

  blocked.sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = FIELD.ceilingY;
  for (const [a, b] of blocked) {
    if (a - cursor > PLAYER.radius * 2) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (FIELD.floorY - cursor > PLAYER.radius * 2) gaps.push([cursor, FIELD.floorY]);
  if (!gaps.length) return null;

  // El hueco más alcanzable, no el más grande.
  let best = gaps[0];
  let bestCost = Infinity;
  for (const g of gaps) {
    const center = (g[0] + g[1]) / 2;
    const cost = Math.abs(center - y) - (g[1] - g[0]) * 0.35;
    if (cost < bestCost) { bestCost = cost; best = g; }
  }
  return [best[0] + PLAYER.radius, best[1] - PLAYER.radius];
}

// Control sobre la energía: se invierte la gravedad justo antes de pasarse del
// objetivo. `vy²/2g` es cuánto se seguiría avanzando si invirtiéramos ahora.
function desiredDir(p, target) {
  const stop = (p.vy * p.vy) / (2 * PLAYER.gravity);
  const err = target - p.y;
  const movingDown = p.vy > 0;

  if (Math.abs(err) < 3 && Math.abs(p.vy) < 40) {
    return movingDown ? -1 : 1;   // sostener la altura alternando
  }
  if (err > 0) {
    if (!movingDown) return 1;
    return stop >= err ? -1 : 1;
  }
  if (movingDown) return -1;
  return stop >= -err ? 1 : -1;
}

export function createBot({ greed = 1, lookahead = 480, margin = 6 } = {}) {
  return function decide(sim) {
    const st = sim.state;
    const p = st.player;
    const px = st.distance + FIELD.playerX;

    let wallX = Infinity;
    for (const o of st.level.obstacles) {
      if (o.x + o.w > px + 6 && o.x < px + lookahead) wallX = Math.min(wallX, Math.max(o.x, px));
    }

    let range = [TOP, BOTTOM];
    if (wallX < Infinity) {
      const found = reachableWindow(st.level.obstacles, wallX - 2, wallX + 72, p.y);
      if (found) range = found;
    }
    const lo = Math.min(range[0] + margin, range[1]);
    const hi = Math.max(range[1] - margin, range[0]);

    let target = (lo + hi) / 2;
    if (greed > 0) {
      for (const orb of st.level.orbs) {
        if (orb.taken) continue;
        if (orb.x < px - ORB.grabRadius || orb.x > px + 320 * greed) continue;
        if (orb.y >= lo && orb.y <= hi) { target = orb.y; break; }
      }
    }
    target = Math.max(lo, Math.min(hi, target));

    return desiredDir(p, target) !== p.dir;
  };
}
