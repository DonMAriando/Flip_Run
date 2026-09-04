import { createPlayerState, stepPlayerPhysics } from './physics.js';

// Un run se guarda como la lista de ticks en los que se tocó. Con la sim
// determinista eso reconstruye la trayectoria exacta, y como la posición
// horizontal solo depende del tick, el ghost no necesita nivel ni colisiones.

export function createRecorder() {
  const flips = [];
  return {
    flips,
    record(tick) { flips.push(tick); }
  };
}

export function createGhost(flips, endTick) {
  const player = createPlayerState();
  let cursor = 0;
  let tick = 0;

  return {
    player,
    get finished() { return tick >= endTick; },
    step() {
      if (tick >= endTick) return;
      tick++;
      if (cursor < flips.length && flips[cursor] === tick) {
        player.dir *= -1;
        cursor++;
      }
      stepPlayerPhysics(player);
    }
  };
}
