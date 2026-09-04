import {
  COMBO, FIELD, FX, LEVEL, ORB, PLAYER, SCORE, SPEED, TICK, VIEW
} from './config.js';
import { createLevel } from './level.js';
import { createPlayerState, speedAt, stepPlayerPhysics } from './physics.js';

// La simulación es una función pura de (semilla, secuencia de toques).
// Nada de Math.random ni de tiempo real acá: eso vive en la capa de FX.

export function createSim(seed) {
  const level = createLevel(seed);
  const player = createPlayerState();
  const events = [];

  const s = {
    seed,
    level,
    player,
    tick: 0,
    endTick: 0,
    distance: 0,
    speed: SPEED.start,
    score: 0,
    combo: 1,
    maxCombo: 1,
    orbs: 0,
    comboDistance: 0,
    fever: false,
    dead: false,
    killer: null,
    nearest: Infinity,
    grazing: false
  };

  function collect(orb) {
    orb.taken = true;
    s.orbs++;
    s.combo = Math.min(COMBO.max, s.combo + 1);
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.comboDistance = 0;
    s.score += ORB.baseValue * s.combo;
    const wasFever = s.fever;
    s.fever = s.combo >= COMBO.feverAt;
    events.push({
      type: 'orb', x: orb.x, y: orb.y, combo: s.combo, fever: s.fever && !wasFever
    });
  }

  function die(o) {
    s.dead = true;
    s.endTick = s.tick;
    s.killer = { x: o.x, y: o.y, w: o.w, h: o.h };
    events.push({ type: 'death' });
  }

  function step(flip) {
    if (s.dead) return;

    s.tick++;
    if (flip) {
      player.dir *= -1;
      events.push({ type: 'flip', dir: player.dir });
    }

    stepPlayerPhysics(player);

    s.speed = speedAt(s.distance);
    const moved = s.speed * TICK;
    s.distance += moved;
    s.score += moved * SCORE.perUnitDistance * (s.fever ? SCORE.feverMultiplier : 1);

    const camera = s.distance;
    const px = camera + FIELD.playerX;
    level.ensureAhead(camera + VIEW.W + LEVEL.spawnAhead);
    level.prune(camera - LEVEL.despawnBehind);

    const grab2 = ORB.grabRadius * ORB.grabRadius;
    for (const orb of level.orbs) {
      if (orb.taken) continue;
      const dx = orb.x - px;
      if (dx > ORB.grabRadius || dx < -ORB.grabRadius) continue;
      const dy = orb.y - player.y;
      if (dx * dx + dy * dy <= grab2) collect(orb);
    }

    const r = PLAYER.radius * PLAYER.hitboxScale;
    let nearest = Infinity;
    for (const o of level.obstacles) {
      const nx = Math.max(o.x, Math.min(px, o.x + o.w));
      const ny = Math.max(o.y, Math.min(player.y, o.y + o.h));
      const dx = px - nx;
      const dy = player.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) { die(o); return; }
      const gap = Math.sqrt(d2) - r;
      if (gap < nearest) nearest = gap;
    }
    s.nearest = nearest;

    // Histéresis para que el aviso de roce se dispare una vez por pasada.
    if (!s.grazing && nearest < FX.grazeDistance) {
      s.grazing = true;
      events.push({ type: 'graze' });
    } else if (s.grazing && nearest > FX.grazeDistance * 1.8) {
      s.grazing = false;
    }

    s.comboDistance += moved;
    if (s.combo > 1 && s.comboDistance >= COMBO.decayDistance) {
      s.comboDistance = 0;
      s.combo--;
      s.fever = s.combo >= COMBO.feverAt;
      events.push({ type: 'comboDecay', combo: s.combo });
    }
  }

  return {
    state: s,
    step,
    drainEvents() {
      if (!events.length) return null;
      const out = events.slice();
      events.length = 0;
      return out;
    },
    get comboProgress() {
      return s.combo > 1 ? 1 - s.comboDistance / COMBO.decayDistance : 0;
    },
    get meters() {
      return Math.floor(s.distance / 10);
    },
    get scoreInt() {
      return Math.floor(s.score);
    }
  };
}
