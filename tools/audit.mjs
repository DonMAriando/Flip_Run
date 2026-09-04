// Audita varias semillas con el solver: superabilidad y techo de orbes.
// Uso: node tools/audit.mjs [distanciaMax]
import { solve } from './solve.mjs';
import { dailySeed } from '../src/rng.js';

const MAX = Number(process.argv[2] || 22000);

const seeds = [
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8',
  'SEED-DAILY', 'SEED-A', 'SEED-RISK',
  dailySeed('2026-09-04'), dailySeed('2026-09-05'), dailySeed('2026-12-31')
];

console.log(`\nAuditoría del generador · hasta ${MAX} unidades (${Math.floor(MAX / 10)} m)\n`);
let broken = 0;
const orbTotals = [];

for (const seed of seeds) {
  const t0 = Date.now();
  const r = solve(seed, MAX);
  if (!r.passable) broken++;
  orbTotals.push(r.orbs);
  const verdict = r.passable ? 'superable' : `IMPOSIBLE a los ${r.meters} m`;
  console.log(`  ${seed.padEnd(28)} ${verdict.padEnd(24)} orbes máx ${String(r.orbs).padStart(3)}   ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const avg = orbTotals.reduce((a, b) => a + b, 0) / orbTotals.length;
console.log(`\n  ${seeds.length - broken}/${seeds.length} semillas superables · techo medio de orbes ${avg.toFixed(0)}\n`);
process.exit(broken === 0 ? 0 : 1);
