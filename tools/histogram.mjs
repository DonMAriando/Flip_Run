// Distribución de duración de runs del autopilot sobre semillas aleatorias.
// Uso: node tools/histogram.mjs [cantidad]
import { createSim } from '../src/sim.js';
import { createBot } from '../src/autopilot.js';
import { randomSeed } from '../src/rng.js';

const N = Number(process.argv[2] || 200);
const bot = createBot({ greed: 1.4 });

const results = [];
for (let i = 0; i < N; i++) {
  const seed = randomSeed();
  const sim = createSim(seed);
  for (let t = 0; t < 60000 && !sim.state.dead; t++) {
    sim.step(bot(sim));
    sim.drainEvents();
  }
  results.push({ seed, meters: sim.meters, orbs: sim.state.orbs, score: sim.scoreInt });
}

results.sort((a, b) => a.meters - b.meters);
const q = p => results[Math.floor(p * (results.length - 1))].meters;

console.log(`\n${N} runs del autopilot con semillas aleatorias\n`);
console.log(`  mínimo ${q(0)} m · p10 ${q(0.1)} m · mediana ${q(0.5)} m · p90 ${q(0.9)} m · máximo ${q(1)} m`);

const buckets = [50, 100, 200, 400, 800, 1600, Infinity];
let from = 0;
for (const to of buckets) {
  const n = results.filter(r => r.meters >= from && r.meters < to).length;
  const label = to === Infinity ? `${from}+` : `${from}-${to}`;
  console.log(`  ${label.padStart(10)} m  ${'#'.repeat(Math.round((n / N) * 50)).padEnd(50)} ${n}`);
  from = to;
}

const early = results.filter(r => r.meters < 100);
console.log(`\n  ${early.length}/${N} runs mueren antes de los 100 m (primer obstáculo)`);
if (early.length) {
  console.log('  ejemplos: ' + early.slice(0, 5).map(r => `${r.seed} (${r.meters}m)`).join(', '));
}
console.log();
