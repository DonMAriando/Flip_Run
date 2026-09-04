import { FIELD, ORB, PLAYER, VIEW } from './config.js';

const CYAN = '#6ce8ff';
const LIME = '#a8ff3e';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const vp = { scale: 1, offsetX: 0, offsetY: 0, dpr: 1, cssW: 0, cssH: 0 };
  // Rectángulo del canvas expresado en unidades virtuales, para pintar el
  // fondo también en las bandas del letterbox.
  const bleed = { x: 0, y: 0, w: VIEW.W, h: VIEW.H };

  function resize() {
    vp.dpr = Math.min(window.devicePixelRatio || 1, 2);
    vp.cssW = Math.max(1, window.innerWidth);
    vp.cssH = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(vp.cssW * vp.dpr);
    canvas.height = Math.floor(vp.cssH * vp.dpr);
    canvas.style.width = `${vp.cssW}px`;
    canvas.style.height = `${vp.cssH}px`;

    vp.scale = Math.min(vp.cssW / VIEW.W, vp.cssH / VIEW.H);
    vp.offsetX = (vp.cssW - VIEW.W * vp.scale) / 2;
    vp.offsetY = (vp.cssH - VIEW.H * vp.scale) / 2;

    bleed.x = -vp.offsetX / vp.scale;
    bleed.y = -vp.offsetY / vp.scale;
    bleed.w = vp.cssW / vp.scale;
    bleed.h = vp.cssH / vp.scale;
  }

  function applyTransform(shakeX = 0, shakeY = 0) {
    const k = vp.dpr * vp.scale;
    ctx.setTransform(k, 0, 0, k, vp.dpr * (vp.offsetX + shakeX * vp.scale), vp.dpr * (vp.offsetY + shakeY * vp.scale));
  }

  function drawBackground(fever, time, camera) {
    const g = ctx.createLinearGradient(0, bleed.y, 0, bleed.y + bleed.h);
    g.addColorStop(0, fever ? '#11160a' : '#070914');
    g.addColorStop(0.5, fever ? '#121a0d' : '#0b1023');
    g.addColorStop(1, '#03050a');
    ctx.fillStyle = g;
    ctx.fillRect(bleed.x, bleed.y, bleed.w, bleed.h);

    const glow = ctx.createRadialGradient(VIEW.W * 0.5, VIEW.H * 0.35, 0, VIEW.W * 0.5, VIEW.H * 0.35, VIEW.W * 0.9);
    glow.addColorStop(0, fever ? 'rgba(168,255,62,.10)' : 'rgba(108,232,255,.09)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(bleed.x, bleed.y, bleed.w, bleed.h);

    const horizon = VIEW.H * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.075;
    ctx.strokeStyle = fever ? LIME : CYAN;
    ctx.lineWidth = 1.2;
    const off = camera * 0.2 % 60;
    for (let x = bleed.x - 60 + off; x < bleed.x + bleed.w + 60; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, horizon - VIEW.H * 0.26);
      ctx.lineTo(x, horizon + VIEW.H * 0.26);
      ctx.stroke();
    }
    for (let y = horizon - VIEW.H * 0.24; y <= horizon + VIEW.H * 0.24; y += 42) {
      ctx.beginPath();
      ctx.moveTo(bleed.x, y);
      ctx.lineTo(bleed.x + bleed.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStars(stars) {
    ctx.save();
    for (const s of stars) {
      ctx.globalAlpha = 0.12 + s.z * 0.42;
      ctx.fillStyle = s.z > 0.65 ? CYAN : '#ffffff';
      const sz = 0.9 + s.z * 1.5;
      ctx.fillRect(s.x, s.y, sz, sz);
    }
    ctx.restore();
  }

  function drawField(fever, pulse) {
    const accent = fever ? LIME : CYAN;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16 + pulse * 18;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, FIELD.ceilingY);
    ctx.lineTo(VIEW.W, FIELD.ceilingY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, FIELD.floorY);
    ctx.lineTo(VIEW.W, FIELD.floorY);
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacles(obstacles, camera) {
    for (const o of obstacles) {
      const x = o.x - camera;
      if (x + o.w < bleed.x - 40 || x > bleed.x + bleed.w + 40) continue;

      const grad = ctx.createLinearGradient(x, o.y, x + o.w, o.y + o.h);
      grad.addColorStop(0, '#ff3d81');
      grad.addColorStop(1, '#ff8c42');
      ctx.save();
      ctx.shadowColor = '#ff3d81';
      ctx.shadowBlur = 16 + o.glow * 12;
      ctx.fillStyle = grad;
      roundRect(ctx, x, o.y, o.w, o.h, o.kind === 'pillar' ? 10 : 8);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      for (let sy = o.y + 11; sy < o.y + o.h - 5; sy += 19) {
        ctx.fillRect(x + 7, sy, Math.max(4, o.w - 14), 2);
      }
      ctx.restore();
    }
  }

  function drawOrbs(orbs, camera, time, fever) {
    const color = fever ? LIME : '#ffe23e';
    ctx.save();
    for (const orb of orbs) {
      if (orb.taken) continue;
      const x = orb.x - camera;
      if (x < bleed.x - 30 || x > bleed.x + bleed.w + 30) continue;
      const pulse = 1 + Math.sin(time * 0.006 + orb.x * 0.02) * 0.14;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, orb.y, ORB.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fffdf0';
      ctx.beginPath();
      ctx.arc(x, orb.y, ORB.radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawShip(x, y, rotation, accent, alpha, glow) {
    const r = PLAYER.radius;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.shadowColor = accent;
    ctx.shadowBlur = glow;
    ctx.fillStyle = alpha < 1 ? accent : '#f8fbff';
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(-r * 0.7, -r * 0.95);
    ctx.lineTo(-r * 0.42, 0);
    ctx.lineTo(-r * 0.7, r * 0.95);
    ctx.closePath();
    ctx.fill();
    if (alpha === 1) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(-r * 0.16, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(particles) {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.restore();
  }

  // Marca el obstáculo culpable: la muerte tiene que ser legible.
  function drawKiller(killer, camera, time) {
    const x = killer.x - camera;
    const t = 0.55 + Math.sin(time * 0.02) * 0.45;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + t * 0.5})`;
    ctx.shadowColor = '#ff3d81';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 3.5;
    roundRect(ctx, x - 4, killer.y - 4, killer.w + 8, killer.h + 8, 11);
    ctx.stroke();
    ctx.restore();
  }

  // El campo jugable tiene que leerse como una franja definida: si las bandas
  // del letterbox parecieran jugables, los obstáculos aparecerían de la nada.
  function drawMask() {
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,10,.84)';
    const right = bleed.x + bleed.w;
    const bottom = bleed.y + bleed.h;
    if (bleed.x < 0) ctx.fillRect(bleed.x, bleed.y, -bleed.x, bleed.h);
    if (right > VIEW.W) ctx.fillRect(VIEW.W, bleed.y, right - VIEW.W, bleed.h);
    if (bleed.y < 0) ctx.fillRect(0, bleed.y, VIEW.W, -bleed.y);
    if (bottom > VIEW.H) ctx.fillRect(0, VIEW.H, VIEW.W, bottom - VIEW.H);

    ctx.strokeStyle = 'rgba(108,232,255,.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, VIEW.W, VIEW.H);
    ctx.restore();
  }

  function draw(scene) {
    const { sim, fx, view, state, time } = scene;
    const fever = sim ? sim.state.fever : false;

    let shakeX = 0, shakeY = 0;
    if (fx.shake > 0) {
      const mag = fx.shake * 10;
      shakeX = (Math.random() - 0.5) * mag;
      shakeY = (Math.random() - 0.5) * mag;
    }
    applyTransform(shakeX, shakeY);

    drawBackground(fever, time, view.camera);
    drawStars(fx.stars);
    drawField(fever, fx.pulse);

    // Todo el gameplay queda recortado al campo virtual para que nada se
    // derrame sobre las bandas del letterbox.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.W, VIEW.H);
    ctx.clip();

    if (sim) {
      drawObstacles(sim.state.level.obstacles, view.camera);
      drawOrbs(sim.state.level.orbs, view.camera, time, fever);
    }
    drawParticles(fx.particles);

    if (view.ghostActive) {
      drawShip(FIELD.playerX, view.ghostY, view.ghostRotation, CYAN, 0.3, 12);
    }

    if (state === 'playing' || state === 'dead') {
      if (!(state === 'dead' && Math.floor(time / 90) % 2 === 0)) {
        drawShip(FIELD.playerX, view.playerY, view.playerRotation, fever ? LIME : CYAN, 1, 26 + fx.pulse * 24);
      }
    } else {
      const bob = FIELD.floorY - PLAYER.radius - Math.abs(Math.sin(time * 0.0016)) * 300;
      drawShip(FIELD.playerX, bob, Math.sin(time * 0.002) * 0.28, CYAN, 1, 26);
    }

    if (state === 'dead' && sim && sim.state.killer) {
      drawKiller(sim.state.killer, view.camera, time);
    }

    ctx.restore();

    drawMask();

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.4})`;
      ctx.fillRect(bleed.x, bleed.y, bleed.w, bleed.h);
    }
  }

  return { resize, draw, viewport: vp };
}
