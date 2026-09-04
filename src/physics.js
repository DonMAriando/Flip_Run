import { FIELD, PLAYER, SPEED, TICK } from './config.js';

// Física del jugador, aislada para que la use tanto la simulación como el
// generador de niveles y las herramientas, sin dependencias circulares.

export function speedAt(distance) {
  return Math.min(SPEED.max, SPEED.start + distance * SPEED.rampPerUnit);
}

export function createPlayerState() {
  return {
    y: FIELD.floorY - PLAYER.radius,
    vy: 0,
    dir: 1,
    rotation: 0
  };
}

// Compartida entre jugador y ghost: si divergiera, el replay dejaría de calzar.
export function stepPlayerPhysics(p) {
  p.vy += PLAYER.gravity * p.dir * TICK;
  p.vy = Math.max(-PLAYER.maxFallSpeed, Math.min(PLAYER.maxFallSpeed, p.vy));
  p.y += p.vy * TICK;

  const top = FIELD.ceilingY + PLAYER.radius;
  const bottom = FIELD.floorY - PLAYER.radius;
  if (p.y < top) { p.y = top; if (p.vy < 0) p.vy = 0; }
  if (p.y > bottom) { p.y = bottom; if (p.vy > 0) p.vy = 0; }

  p.rotation += p.vy * 0.00026;
}

// Avance horizontal necesario para desplazarse `dy` en vertical partiendo
// quieto: t = sqrt(2*dy/g), por la velocidad de avance. Es la restricción que
// vuelve un patrón alcanzable o imposible, y por eso el generador la consulta
// en lugar de asumir separaciones fijas.
export function travelFor(dy, speed, safety = 1.25, base = 28) {
  if (!(dy > 0)) return 0;
  return speed * Math.sqrt((2 * dy) / PLAYER.gravity) * safety + base;
}
