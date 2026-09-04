// Traza un run del bot para depurar geometría y muertes.
// Uso: node tools/trace.mjs [semilla]
import { createSim } from '../src/sim.js';
import { createLevel } from '../src/level.js';
import { FIELD, PLAYER } from '../src/config.js';
import { createBot } from '../src/autopilot.js';

const seed = process.argv[2] || 'SEED-A';

const level = createLevel(seed);
level.ensureAhead(4000);
console.log(`\nPrimeros obstáculos de "${seed}" (corredor ${FIELD.ceilingY}..${FIELD.floorY}):`);
for (const o of level.obstacles.slice(0, 10)) {
  const touchesCeiling = Math.abs(o.y - FIELD.ceilingY) < 1;
  const touchesFloor = Math.abs(o.y + o.h - FIELD.floorY) < 1;
  const anchor = touchesCeiling ? 'techo' : touchesFloor ? 'piso' : 'flotante';
  console.log(`  x=${o.x.toFixed(0).padStart(6)} w=${o.w.toFixed(0).padStart(3)} y=${o.y.toFixed(0).padStart(4)}..${(o.y + o.h).toFixed(0).padStart(4)} ${anchor}`);
}
console.log('\nPrimeros orbes:');
for (const o of level.orbs.slice(0, 8)) {
  console.log(`  x=${o.x.toFixed(0).padStart(6)} y=${o.y.toFixed(0)}`);
}

const sim = createSim(seed);
const bot = createBot({ greed: 1.4 });
let flips = 0;
const samples = [];
for (let i = 0; i < 60000 && !sim.state.dead; i++) {
  const flip = bot(sim);
  if (flip) flips++;
  sim.step(flip);
  sim.drainEvents();
  if (i % 20 === 0) samples.push({ d: sim.state.distance, y: sim.state.player.y, dir: sim.state.player.dir });
}

console.log(`\nMuerte: distancia ${sim.state.distance.toFixed(0)} (${sim.meters} m), ${flips} toques, ${sim.state.orbs} orbes`);
if (sim.state.killer) {
  const k = sim.state.killer;
  console.log(`Culpable: x=${k.x.toFixed(0)}..${(k.x + k.w).toFixed(0)} y=${k.y.toFixed(0)}..${(k.y + k.h).toFixed(0)}`);
  console.log(`Jugador:  x=${(sim.state.distance + FIELD.playerX).toFixed(0)} y=${sim.state.player.y.toFixed(0)} (r=${PLAYER.radius})`);
}

console.log('\nTrayectoria (distancia → y):');
for (const s of samples.slice(-14)) {
  const col = Math.round(((s.y - FIELD.ceilingY) / (FIELD.floorY - FIELD.ceilingY)) * 50);
  console.log(`  ${s.d.toFixed(0).padStart(6)} ${' '.repeat(Math.max(0, col))}${s.dir > 0 ? 'v' : '^'} y=${s.y.toFixed(0)}`);
}
console.log();
