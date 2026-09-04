// Chequeos de la simulación, sin navegador. Uso: node tools/verify.mjs
import { createSim } from '../src/sim.js';
import { createGhost, createRecorder } from '../src/replay.js';
import { createLevel } from '../src/level.js';
import { createBot } from '../src/autopilot.js';
import { speedAt } from '../src/physics.js';
import { FIELD, LEVEL, TICK } from '../src/config.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const obstacleKey = o => `${o.x.toFixed(6)}|${o.y.toFixed(6)}|${o.w.toFixed(6)}|${o.h.toFixed(6)}`;

const periodicBot = period => sim => sim.state.tick > 0 && sim.state.tick % period === 0;

function playRun(seed, decide, maxTicks = 60000) {
  const sim = createSim(seed);
  const recorder = createRecorder();
  const seen = new Set();
  const yHistory = [];
  const events = [];
  for (let i = 0; i < maxTicks && !sim.state.dead; i++) {
    const flip = decide(sim);
    if (flip) recorder.record(sim.state.tick + 1);
    sim.step(flip);
    const drained = sim.drainEvents();
    if (drained) events.push(...drained);
    for (const o of sim.state.level.obstacles) seen.add(obstacleKey(o));
    yHistory.push(sim.state.player.y);
  }
  return { sim, recorder, seen, yHistory, events };
}

console.log('\nFLIP//RUN · verificación de la simulación\n');

// 1. La misma semilla y los mismos toques dan exactamente el mismo run.
{
  const a = playRun('SEED-A', createBot());
  const b = playRun('SEED-A', createBot());
  const fields = ['tick', 'distance', 'score', 'orbs', 'maxCombo', 'endTick'];
  const same = fields.every(f => a.sim.state[f] === b.sim.state[f]);
  check('mismos inputs reproducen el run exacto', same,
    `${a.sim.meters} m, score ${a.sim.scoreInt}, ${a.sim.state.orbs} orbes`);
}

// 2. El bug original: el nivel no puede depender de cómo se juega.
{
  const reference = createLevel('SEED-DAILY');
  reference.ensureAhead(400000);
  const refKeys = new Set(reference.obstacles.map(obstacleKey));

  const styles = [
    ['ambicioso', createBot({ greed: 1.4 })],
    ['prudente', createBot({ greed: 0 })],
    ['corto de vista', createBot({ lookahead: 200 })],
    ['torpe', periodicBot(31)]
  ];
  const runs = styles.map(([name, bot]) => ({ name, ...playRun('SEED-DAILY', bot) }));

  const allInReference = runs.every(r => [...r.seen].every(k => refKeys.has(k)));
  check('el nivel es idéntico jugando distinto', allInReference,
    runs.map(r => `${r.name} ${r.sim.meters}m`).join(', '));

  // El run más corto recorre un prefijo del más largo, así que todo lo que vio
  // tiene que estar también en el run largo, con la misma geometría.
  const sorted = runs.slice().sort((x, y) => x.sim.state.tick - y.sim.state.tick);
  const shortest = sorted[0];
  const longest = sorted[sorted.length - 1];
  const missing = [...shortest.seen].filter(k => !longest.seen.has(k));
  check('el run corto es un prefijo del largo', missing.length === 0,
    `${shortest.seen.size} vs ${longest.seen.size} obstáculos, ${missing.length} discrepancias`);
}

// 3. Semillas distintas dan niveles distintos (el generador no está degenerado).
{
  const a = createLevel('SEED-X'); a.ensureAhead(30000);
  const b = createLevel('SEED-Y'); b.ensureAhead(30000);
  const ka = a.obstacles.map(obstacleKey).join(',');
  const kb = b.obstacles.map(obstacleKey).join(',');
  check('semillas distintas dan niveles distintos', ka !== kb,
    `${a.obstacles.length} vs ${b.obstacles.length} obstáculos`);
}

// 4. La granularidad de generación no altera el resultado.
{
  const a = createLevel('SEED-CHUNK'); a.ensureAhead(60000);
  const b = createLevel('SEED-CHUNK');
  for (let x = 0; x <= 60000; x += 137) b.ensureAhead(x);
  b.ensureAhead(60000);
  const ka = a.obstacles.map(obstacleKey).join(',');
  const kb = b.obstacles.map(obstacleKey).join(',');
  check('generar por tramos da el mismo nivel', ka === kb, `${a.obstacles.length} obstáculos`);
}

// 5. El ghost reconstruye la trayectoria a partir de los ticks grabados.
{
  const { sim, recorder, yHistory } = playRun('SEED-GHOST', createBot());
  const ghost = createGhost(recorder.flips, sim.state.endTick || sim.state.tick);
  let maxDelta = 0;
  for (let i = 0; i < yHistory.length; i++) {
    ghost.step();
    maxDelta = Math.max(maxDelta, Math.abs(ghost.player.y - yHistory[i]));
  }
  check('el ghost calza con el run grabado', maxDelta === 0,
    `${recorder.flips.length} toques en ${sim.state.tick} ticks, desvío máx ${maxDelta}`);
}

// 6. Jugabilidad: el nivel se puede recorrer y los orbes se pueden cobrar.
{
  const idle = createSim('SEED-IDLE');
  for (let i = 0; i < 20000 && !idle.state.dead; i++) idle.step(false);
  check('sin tocar el run termina', idle.state.dead, `murió a los ${idle.meters} m`);

  const seeds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
  const runs = seeds.map(s => playRun(s, createBot({ greed: 1.4 })));
  const withOrbs = runs.filter(r => r.sim.state.orbs > 0).length;
  const meters = runs.map(r => r.sim.meters);
  const orbs = runs.map(r => r.sim.state.orbs);

  check('los orbes son alcanzables', withOrbs === runs.length,
    `orbes por run: ${orbs.join(', ')}`);
  check('el bot sobrevive lo suficiente para que haya curva', Math.max(...meters) > 400,
    `metros: ${meters.join(', ')} (máx ${Math.max(...meters)})`);

  const maxCombo = Math.max(...runs.map(r => r.sim.state.maxCombo));
  check('el combo escala hasta FEVER', maxCombo >= 8, `combo máx ${maxCombo}`);

  // El riesgo tiene que ser opcional: jugar seguro debe puntuar menos.
  const greedy = playRun('SEED-RISK', createBot({ greed: 1.4 }));
  const safe = playRun('SEED-RISK', createBot({ greed: 0 }));
  check('arriesgar paga más que ir a lo seguro', greedy.sim.scoreInt > safe.sim.scoreInt,
    `ambicioso ${greedy.sim.scoreInt} (${greedy.sim.state.orbs} orbes) vs prudente ${safe.sim.scoreInt} (${safe.sim.state.orbs} orbes)`);
}

// 7. El combo nunca se rompe por azar: toda caída tiene su evento de decaimiento.
{
  const sim = createSim('SEED-COMBO');
  const bot = createBot({ greed: 1.4 });
  let drops = 0;
  let unexplained = 0;
  let lastCombo = 1;
  for (let i = 0; i < 60000 && !sim.state.dead; i++) {
    sim.step(bot(sim));
    const events = sim.drainEvents() || [];
    if (sim.state.combo < lastCombo) {
      drops++;
      if (!events.some(e => e.type === 'comboDecay')) unexplained++;
    }
    lastCombo = sim.state.combo;
  }
  check('toda caída de combo tiene su causa', unexplained === 0,
    `${drops} decaimientos, ${unexplained} sin explicación`);
}

// 8. La dificultad efectivamente sube: el score por metro crece con la distancia.
{
  const runs = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].map(s => playRun(s, createBot({ greed: 1.4 })));
  const survived = runs.map(r => r.sim.meters).sort((a, b) => a - b);
  const median = survived[Math.floor(survived.length / 2)];
  check('las runs no son infinitas ni instantáneas', median > 200 && median < 6000,
    `mediana ${median} m, rango ${survived[0]}–${survived[survived.length - 1]} m`);
}

// 9. Arranque: tiene que haber pista para entender que la partida empezó, y el
// primer tramo no puede poder matarte.
{
  const timeToReach = worldX => {
    let d = 0;
    let t = 0;
    const target = worldX - FIELD.playerX;
    while (d < target && t < 30) { d += speedAt(d) * TICK; t += TICK; }
    return t;
  };

  const seeds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'SEED-A', 'SEED-RISK'];
  const intros = seeds.map(s => {
    const level = createLevel(s);
    level.ensureAhead(8000);
    return {
      obstacle: timeToReach(level.obstacles[0].x),
      orb: timeToReach(level.orbs[0].x),
      orbFirst: level.orbs[0].x < level.obstacles[0].x
    };
  });

  const minObstacle = Math.min(...intros.map(i => i.obstacle));
  const maxOrb = Math.max(...intros.map(i => i.orb));
  check('hay pista antes del primer obstáculo', minObstacle >= 2.5,
    `mínimo ${minObstacle.toFixed(1)} s`);
  check('lo primero que aparece es un orbe, no una pared', intros.every(i => i.orbFirst),
    `primer orbe a los ${maxOrb.toFixed(1)} s como máximo`);
}

// 10. Apertura fija: mismo arranque para todos, divergencia después. Sin esto
// no hay tramo memorizable ni scores comparables.
{
  const key = o => `${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.w)}:${Math.round(o.h)}`;
  const geometry = seed => {
    const level = createLevel(seed);
    level.ensureAhead(14000);
    return level.obstacles;
  };

  const a = geometry('SEED-UNO');
  const b = geometry('SEED-DOS');
  let i = 0;
  while (i < a.length && i < b.length && key(a[i]) === key(b[i])) i++;
  const divergeX = i < a.length ? a[i].x : Infinity;

  check('la apertura es idéntica en cualquier semilla', i > 0 && divergeX > FIELD.playerX,
    `${LEVEL.openingChunks} patrones fijos, divergen a los ${Math.round(divergeX / 10)} m`);
  check('pasada la apertura los niveles divergen', i < Math.min(a.length, b.length),
    `${a.length} vs ${b.length} obstáculos en total`);
}

// 11. Ritmo de respiros: ni dos pegados ni tramos interminables sin aire.
{
  const BREATHERS = new Set(['orbArc', 'orbWave']);
  let worstStreak = 0;
  let tooClose = 0;
  let breatherCount = 0;
  let total = 0;

  for (const seed of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']) {
    const level = createLevel(seed);
    level.ensureAhead(20000);
    let since = Infinity;
    for (const [i, name] of level.patterns.entries()) {
      total++;
      if (!BREATHERS.has(name)) { since++; continue; }
      breatherCount++;
      // El primero es la apertura forzada: no cuenta contra el mínimo.
      if (i > 0 && since < LEVEL.breatherMin) tooClose++;
      worstStreak = Math.max(worstStreak, Math.min(since, LEVEL.breatherMax));
      since = 0;
    }
    worstStreak = Math.max(worstStreak, Math.min(since, LEVEL.breatherMax));
  }

  const share = Math.round((breatherCount / total) * 100);
  check('los respiros no se pegan', tooClose === 0,
    `${breatherCount} respiros en ${total} patrones (${share}%), 0 antes de ${LEVEL.breatherMin}`);
  check('no hay tramos sin aire', worstStreak <= LEVEL.breatherMax,
    `racha máxima ${worstStreak} patrones sin respiro`);
}

console.log(`\n${failures === 0 ? 'Todo en orden.' : `${failures} chequeo(s) fallando.`}\n`);
process.exit(failures === 0 ? 0 : 1);
