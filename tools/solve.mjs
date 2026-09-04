// ¿El nivel generado es superable, y cuánto puede cobrar un jugador perfecto?
//
// Programación dinámica sobre el espacio de estados (y, vy, gravedad),
// discretizado. Aproximado por el bucketeo, pero alcanza para distinguir
// "difícil" de "imposible", que es la pregunta que importa en un juego de
// precisión. La colisión se evalúa con la caja del jugador, más conservadora
// que el círculo que usa la simulación real.
//
// Uso: node tools/solve.mjs [semilla] [distanciaMax]
import { FIELD, ORB, PLAYER, TICK } from '../src/config.js';
import { createLevel } from '../src/level.js';
import { speedAt } from '../src/physics.js';

const TOP = FIELD.ceilingY + PLAYER.radius;
const BOTTOM = FIELD.floorY - PLAYER.radius;
const HIT_R = PLAYER.radius * PLAYER.hitboxScale;

export function solve(seed, maxDistance = 12000, { yStep = 3, vStep = 35 } = {}) {
  const level = createLevel(seed);
  level.ensureAhead(maxDistance + 3000);

  const NY = Math.ceil((BOTTOM - TOP) / yStep) + 1;
  const VMAX = PLAYER.maxFallSpeed;
  const NV = Math.ceil((2 * VMAX) / vStep) + 1;
  const NS = NY * NV * 2;

  // -1 = inalcanzable; >= 0 = máximo de orbes cobrados llegando a ese estado.
  let cur = new Int32Array(NS).fill(-1);
  let next = new Int32Array(NS);

  const idx = (yb, vb, db) => (yb * NV + vb) * 2 + db;
  const startY = FIELD.floorY - PLAYER.radius;
  cur[idx(Math.round((startY - TOP) / yStep), Math.round(VMAX / vStep), 0)] = 0;

  const orbs = level.orbs.slice();
  let orbCursor = 0;

  let distance = 0;
  let prevPx = FIELD.playerX;
  let bestOrbs = 0;
  const blocked = [];

  for (let t = 0; distance < maxDistance; t++) {
    distance += speedAt(distance) * TICK;
    const px = distance + FIELD.playerX;

    blocked.length = 0;
    for (const o of level.obstacles) {
      if (o.x + o.w + HIT_R < px || o.x - HIT_R > px) continue;
      blocked.push(o.y - HIT_R, o.y + o.h + HIT_R);
    }

    // Cada orbe se contabiliza solo en el tick en que se cruza su x, para no
    // cobrarlo varias veces mientras sigue dentro del radio.
    const crossing = [];
    while (orbCursor < orbs.length && orbs[orbCursor].x <= px) {
      if (orbs[orbCursor].x > prevPx) crossing.push(orbs[orbCursor]);
      orbCursor++;
    }
    prevPx = px;

    next.fill(-1);
    let any = false;

    for (let s = 0; s < NS; s++) {
      const score = cur[s];
      if (score < 0) continue;
      const db = s & 1;
      const rest = s >> 1;
      const vb = rest % NV;
      const yb = (rest - vb) / NV;
      const y = TOP + yb * yStep;
      const vy = -VMAX + vb * vStep;
      const dir = db === 0 ? 1 : -1;

      for (let f = 0; f < 2; f++) {
        const d2 = f ? -dir : dir;
        let vy2 = vy + PLAYER.gravity * d2 * TICK;
        vy2 = Math.max(-VMAX, Math.min(VMAX, vy2));
        let y2 = y + vy2 * TICK;
        if (y2 < TOP) { y2 = TOP; if (vy2 < 0) vy2 = 0; }
        if (y2 > BOTTOM) { y2 = BOTTOM; if (vy2 > 0) vy2 = 0; }

        let hit = false;
        for (let i = 0; i < blocked.length; i += 2) {
          if (y2 > blocked[i] && y2 < blocked[i + 1]) { hit = true; break; }
        }
        if (hit) continue;

        let gained = 0;
        for (const orb of crossing) {
          if (Math.abs(orb.y - y2) <= ORB.grabRadius) gained++;
        }

        const yb2 = Math.round((y2 - TOP) / yStep);
        const vb2 = Math.round((vy2 + VMAX) / vStep);
        const j = idx(yb2, vb2, d2 === 1 ? 0 : 1);
        const total = score + gained;
        if (total > next[j]) next[j] = total;
        any = true;
      }
    }

    if (!any) {
      return { passable: false, reached: distance, meters: Math.floor(distance / 10), orbs: bestOrbs };
    }

    const tmp = cur; cur = next; next = tmp;
    for (let s = 0; s < NS; s++) if (cur[s] > bestOrbs) bestOrbs = cur[s];
    if (t % 300 === 0) level.prune(px - 500);
  }

  return { passable: true, reached: distance, meters: Math.floor(distance / 10), orbs: bestOrbs };
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') ||
    process.argv[1]?.endsWith('solve.mjs')) {
  const seed = process.argv[2] || 'SEED-A';
  const max = Number(process.argv[3] || 12000);
  const t0 = Date.now();
  const r = solve(seed, max);
  console.log(`\nsemilla "${seed}" hasta ${max} unidades (${Math.floor(max / 10)} m)`);
  console.log(`  superable: ${r.passable ? 'sí' : `NO — se corta a los ${r.meters} m`}`);
  console.log(`  orbes máximos de un jugador perfecto: ${r.orbs}`);
  console.log(`  resuelto en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}
