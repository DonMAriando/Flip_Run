import { VIEW } from './config.js';

// Capa puramente cosmética. Usa Math.random y tiempo real a propósito:
// nada de esto puede influir en la simulación.

export function createFx() {
  const particles = [];
  const stars = [];
  for (let i = 0; i < 64; i++) {
    stars.push({ x: Math.random() * VIEW.W, y: Math.random() * VIEW.H, z: 0.2 + Math.random() * 0.8 });
  }

  const fx = {
    particles,
    stars,
    shake: 0,
    flash: 0,
    pulse: 0,
    slowmo: 0,

    burst(x, y, count, color, speed) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.25 + Math.random() * 0.75);
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.35 + Math.random() * 0.45,
          max: 0.8,
          size: 2 + Math.random() * 5,
          color
        });
      }
    },

    ring(x, y, count, color, speed) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        particles.push({
          x, y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 0.3,
          max: 0.3,
          size: 3.5,
          color
        });
      }
    },

    trail(x, y, speed, color) {
      particles.push({
        x: x - 10 + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 14,
        vx: -speed * (0.12 + Math.random() * 0.2),
        vy: (Math.random() - 0.5) * 30,
        life: 0.16 + Math.random() * 0.18,
        max: 0.4,
        size: 2 + Math.random() * 4,
        color
      });
    },

    update(dt) {
      fx.shake = Math.max(0, fx.shake - dt * 4);
      fx.flash = Math.max(0, fx.flash - dt * 6);
      fx.pulse = Math.max(0, fx.pulse - dt * 5);
      fx.slowmo = Math.max(0, fx.slowmo - dt);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const drag = Math.pow(0.985, dt * 60);
        p.vx *= drag;
        p.vy *= drag;
      }
    },

    scrollStars(dt, speed) {
      for (const s of stars) {
        s.x -= speed * s.z * dt * 0.14;
        if (s.x < -3) { s.x = VIEW.W + 3; s.y = Math.random() * VIEW.H; }
      }
    },

    clear() {
      particles.length = 0;
      fx.shake = fx.flash = fx.pulse = fx.slowmo = 0;
    }
  };

  return fx;
}
