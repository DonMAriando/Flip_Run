(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const ui = {
    overlay: document.getElementById('overlay'),
    menu: document.getElementById('menu'),
    gameOver: document.getElementById('gameOver'),
    play: document.getElementById('playBtn'),
    daily: document.getElementById('dailyBtn'),
    retry: document.getElementById('retryBtn'),
    home: document.getElementById('homeBtn'),
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    combo: document.getElementById('combo'),
    fever: document.getElementById('fever'),
    finalScore: document.getElementById('finalScore'),
    runStats: document.getElementById('runStats'),
    newRecord: document.getElementById('newRecord'),
    sound: document.getElementById('soundBtn'),
    toast: document.getElementById('toast'),
    subtitle: document.getElementById('subtitle')
  };

  const STORAGE = {
    best: 'fliprun_best_v1',
    sound: 'fliprun_sound_v1',
    dailyPrefix: 'fliprun_daily_'
  };

  let W = 0, H = 0, DPR = 1;
  let state = 'menu';
  let last = performance.now();
  let currentMode = 'normal';
  let runRng = Math.random;
  let muted = localStorage.getItem(STORAGE.sound) === '0';
  let bestScore = Number(localStorage.getItem(STORAGE.best) || 0);
  let toastTimer = 0;

  const world = {
    floorY: 0,
    ceilingY: 0,
    speed: 360,
    baseSpeed: 360,
    maxSpeed: 860,
    distance: 0,
    score: 0,
    combo: 1,
    maxCombo: 1,
    perfects: 0,
    fever: false,
    elapsed: 0,
    difficulty: 0,
    spawnTimer: 0,
    nextSpawn: 1.1,
    shake: 0,
    flash: 0,
    pulse: 0
  };

  const player = {
    x: 0,
    y: 0,
    vy: 0,
    r: 18,
    gravityDir: 1,
    rotation: 0,
    dead: false
  };

  const obstacles = [];
  const particles = [];
  const stars = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, window.innerWidth);
    H = Math.max(480, window.innerHeight);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    world.ceilingY = H * 0.16;
    world.floorY = H * 0.84;
    player.x = W * 0.26;
    player.r = Math.max(14, Math.min(20, W * 0.045));
    if (state === 'menu') player.y = world.floorY - player.r;

    if (!stars.length) {
      for (let i = 0; i < 50; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: .2 + Math.random() * .8 });
    }
  }

  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function reset(mode = currentMode) {
    currentMode = mode;
    runRng = mode === 'daily' ? mulberry32(hashString(`FLIPRUN-${todayKey()}`)) : Math.random;
    obstacles.length = 0;
    particles.length = 0;
    Object.assign(world, {
      speed: 360,
      baseSpeed: 360,
      distance: 0,
      score: 0,
      combo: 1,
      maxCombo: 1,
      perfects: 0,
      fever: false,
      elapsed: 0,
      difficulty: 0,
      spawnTimer: 0,
      nextSpawn: .95,
      shake: 0,
      flash: 0,
      pulse: 0
    });
    Object.assign(player, {
      x: W * .26,
      y: world.floorY - player.r,
      vy: 0,
      gravityDir: 1,
      rotation: 0,
      dead: false
    });
    ui.score.textContent = '0';
    ui.combo.textContent = 'x1';
    ui.best.textContent = currentMode === 'daily'
      ? `DAILY ${Number(localStorage.getItem(STORAGE.dailyPrefix + todayKey()) || 0)}`
      : `BEST ${bestScore}`;
    ui.fever.classList.add('hidden');
    ui.overlay.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.gameOver.classList.add('hidden');
    ui.menu.classList.add('hidden');
    state = 'playing';
    audio.start();
    audio.blip(280, .05, .04);
  }

  function goMenu() {
    state = 'menu';
    ui.overlay.classList.remove('hidden');
    ui.menu.classList.remove('hidden');
    ui.gameOver.classList.add('hidden');
    ui.hud.classList.add('hidden');
    ui.subtitle.textContent = 'TOCÁ PARA INVERTIR LA GRAVEDAD';
    obstacles.length = 0;
    particles.length = 0;
  }

  function flip() {
    if (state !== 'playing' || player.dead) return;
    player.gravityDir *= -1;
    player.vy += player.gravityDir * 70;
    world.pulse = 1;
    emit(player.x, player.y, 8, '#6ce8ff', 130);
    audio.flip(player.gravityDir);
  }

  function gameOver() {
    if (player.dead) return;
    player.dead = true;
    state = 'dead';
    world.shake = 1;
    world.flash = 1;
    emit(player.x, player.y, 34, '#a8ff3e', 420);
    emit(player.x, player.y, 18, '#6ce8ff', 320);
    audio.crash();

    const score = Math.floor(world.score);
    let record = false;
    if (currentMode === 'daily') {
      const key = STORAGE.dailyPrefix + todayKey();
      const prev = Number(localStorage.getItem(key) || 0);
      if (score > prev) { localStorage.setItem(key, score); record = true; }
    } else if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(STORAGE.best, String(bestScore));
      record = true;
    }

    setTimeout(() => {
      ui.overlay.classList.remove('hidden');
      ui.menu.classList.add('hidden');
      ui.gameOver.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      ui.finalScore.textContent = score.toLocaleString('es-AR');
      ui.runStats.textContent = `${world.perfects} PERFECT · x${world.maxCombo} MAX`;
      ui.newRecord.classList.toggle('hidden', !record);
      ui.subtitle.textContent = currentMode === 'daily' ? `DAILY RUN · ${todayKey()}` : 'UN TOQUE MÁS';
    }, 420);
  }

  function spawnObstacle() {
    const gapH = Math.max(94, H * .14);
    const lane = runRng() < .5 ? 'floor' : 'ceiling';
    const difficulty = Math.min(1, world.elapsed / 75);
    const width = 34 + runRng() * (28 + difficulty * 22);
    const minH = H * (.11 + difficulty * .015);
    const maxH = H * (.24 + difficulty * .055);
    const height = minH + runRng() * (maxH - minH);

    obstacles.push({
      x: W + width + 30,
      y: lane === 'floor' ? world.floorY - height : world.ceilingY,
      w: width,
      h: Math.min(height, (world.floorY - world.ceilingY) - gapH),
      lane,
      passed: false,
      minGap: Infinity,
      glow: runRng()
    });

    if (world.elapsed > 20 && runRng() < .18 + difficulty * .18) {
      const lane2 = lane === 'floor' ? 'ceiling' : 'floor';
      const h2 = minH * (.7 + runRng() * .35);
      obstacles.push({
        x: W + width + 30 + 110 + runRng() * 65,
        y: lane2 === 'floor' ? world.floorY - h2 : world.ceilingY,
        w: Math.max(28, width * .82),
        h: h2,
        lane: lane2,
        passed: false,
        minGap: Infinity,
        glow: runRng()
      });
    }
  }

  function aabbCircleGap(o) {
    const nearestX = Math.max(o.x, Math.min(player.x, o.x + o.w));
    const nearestY = Math.max(o.y, Math.min(player.y, o.y + o.h));
    const dx = player.x - nearestX;
    const dy = player.y - nearestY;
    return Math.sqrt(dx*dx + dy*dy) - player.r;
  }

  function collision(o) {
    const nearestX = Math.max(o.x, Math.min(player.x, o.x + o.w));
    const nearestY = Math.max(o.y, Math.min(player.y, o.y + o.h));
    const dx = player.x - nearestX;
    const dy = player.y - nearestY;
    return dx*dx + dy*dy < player.r*player.r * .84;
  }

  function perfect(gap) {
    world.perfects++;
    world.combo++;
    world.maxCombo = Math.max(world.maxCombo, world.combo);
    const bonus = Math.round((18 - Math.max(0, gap)) * world.combo * 2.2);
    world.score += Math.max(18, bonus);
    const oldFever = world.fever;
    world.fever = world.combo >= 10;
    ui.combo.textContent = `x${world.combo}`;
    ui.fever.classList.toggle('hidden', !world.fever);
    showToast(gap < 5 ? 'INSANE!' : 'PERFECT!');
    emit(player.x + 12, player.y, 18, world.fever ? '#a8ff3e' : '#6ce8ff', 250);
    audio.perfect(world.combo);
    if (world.fever && !oldFever) audio.feverOn();
  }

  function breakCombo() {
    if (world.combo <= 1) return;
    world.combo = 1;
    world.fever = false;
    ui.combo.textContent = 'x1';
    ui.fever.classList.add('hidden');
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.remove('show');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 320);
  }

  function emit(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (.25 + Math.random() * .75);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: .35 + Math.random() * .45,
        max: .8,
        size: 2 + Math.random() * 5,
        color
      });
    }
  }

  function update(dt) {
    world.pulse = Math.max(0, world.pulse - dt * 5);
    world.shake = Math.max(0, world.shake - dt * 4);
    world.flash = Math.max(0, world.flash - dt * 6);

    for (const s of stars) {
      s.x -= (state === 'playing' ? world.speed : 50) * s.z * dt * .12;
      if (s.x < -3) { s.x = W + 3; s.y = Math.random() * H; }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(.985, dt * 60);
      p.vy *= Math.pow(.985, dt * 60);
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (state !== 'playing') return;

    world.elapsed += dt;
    const wave = Math.sin(world.elapsed * .18) * .5 + .5;
    const calm = (world.elapsed % 28) > 22 ? .72 : 1;
    world.difficulty = Math.min(1, world.elapsed / 90);
    world.speed = Math.min(world.maxSpeed, world.baseSpeed + world.elapsed * 5.2) * calm;
    const mult = world.fever ? 2 : 1;
    world.distance += world.speed * dt;
    world.score += world.speed * dt * .026 * mult;

    const gravity = 2100 * player.gravityDir;
    player.vy += gravity * dt;
    player.vy = Math.max(-1250, Math.min(1250, player.vy));
    player.y += player.vy * dt;
    player.rotation += (player.vy * .0019) * dt * 60;

    const top = world.ceilingY + player.r;
    const bottom = world.floorY - player.r;
    if (player.y < top) { player.y = top; if (player.vy < 0) player.vy = 0; }
    if (player.y > bottom) { player.y = bottom; if (player.vy > 0) player.vy = 0; }

    if (Math.random() < .7) particles.push({
      x: player.x - player.r * .7,
      y: player.y + (Math.random() - .5) * player.r,
      vx: -world.speed * (.12 + Math.random() * .18),
      vy: (Math.random() - .5) * 30,
      life: .18 + Math.random() * .18,
      max: .4,
      size: 2 + Math.random() * 4,
      color: world.fever ? '#a8ff3e' : '#6ce8ff'
    });

    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      spawnObstacle();
      const base = 1.03 - world.difficulty * .33;
      world.spawnTimer = Math.max(.46, base + (runRng() - .5) * .22 + wave * .08);
    }

    let passedCleanThisFrame = false;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= world.speed * dt;

      if (o.x < player.x + player.r * 2 && o.x + o.w > player.x - player.r * 2) {
        const gap = aabbCircleGap(o);
        o.minGap = Math.min(o.minGap, gap);
        if (collision(o)) { gameOver(); return; }
      }

      if (!o.passed && o.x + o.w < player.x - player.r) {
        o.passed = true;
        if (o.minGap < 18) perfect(o.minGap);
        else passedCleanThisFrame = true;
      }
      if (o.x + o.w < -80) obstacles.splice(i, 1);
    }
    if (passedCleanThisFrame && runRng() < .2) breakCombo();

    ui.score.textContent = String(Math.floor(world.score));
    ui.best.textContent = currentMode === 'daily'
      ? `DAILY ${Number(localStorage.getItem(STORAGE.dailyPrefix + todayKey()) || 0)}`
      : `BEST ${bestScore}`;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, world.fever ? '#11160a' : '#070914');
    g.addColorStop(.5, world.fever ? '#121a0d' : '#0b1023');
    g.addColorStop(1, '#03050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    for (const s of stars) {
      ctx.globalAlpha = .14 + s.z * .45;
      ctx.fillStyle = s.z > .65 ? '#6ce8ff' : '#ffffff';
      const sz = .8 + s.z * 1.4;
      ctx.fillRect(s.x, s.y, sz, sz);
    }
    ctx.restore();

    const horizon = H * .5;
    ctx.save();
    ctx.globalAlpha = .08;
    ctx.strokeStyle = world.fever ? '#a8ff3e' : '#6ce8ff';
    ctx.lineWidth = 1;
    const gridOffset = (world.distance * .18) % 54;
    for (let x = -54 + gridOffset; x < W + 54; x += 54) {
      ctx.beginPath(); ctx.moveTo(x, horizon - H*.24); ctx.lineTo(x, horizon + H*.24); ctx.stroke();
    }
    for (let y = horizon - H*.22; y <= horizon + H*.22; y += 38) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld() {
    const accent = world.fever ? '#a8ff3e' : '#6ce8ff';
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14 + world.pulse * 18;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = .68;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, world.ceilingY); ctx.lineTo(W, world.ceilingY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, world.floorY); ctx.lineTo(W, world.floorY); ctx.stroke();
    ctx.restore();

    for (const o of obstacles) {
      const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
      grad.addColorStop(0, '#ff3d81');
      grad.addColorStop(1, '#ff8c42');
      ctx.save();
      ctx.shadowColor = '#ff3d81';
      ctx.shadowBlur = 18 + o.glow * 12;
      ctx.fillStyle = grad;
      roundRect(ctx, o.x, o.y, o.w, o.h, Math.min(9, o.w*.22));
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = .35;
      ctx.fillStyle = '#fff';
      for (let sy = o.y + 10; sy < o.y + o.h - 4; sy += 18) {
        ctx.fillRect(o.x + 7, sy, Math.max(4, o.w - 14), 2);
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rotation);
    const accent = world.fever ? '#a8ff3e' : '#6ce8ff';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26 + world.pulse * 24;

    const r = player.r;
    ctx.fillStyle = '#f8fbff';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r*.55, -r*.78);
    ctx.lineTo(-r*.36, 0);
    ctx.lineTo(-r*.55, r*.78);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(-r*.2, 0, r*.26, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.restore();
  }

  function drawMenuDemo(t) {
    if (state !== 'menu') return;
    const y = world.floorY - player.r - Math.abs(Math.sin(t*.0016)) * (world.floorY-world.ceilingY)*.43;
    const ghost = { y: player.y, rotation: player.rotation };
    player.y = y;
    player.rotation = Math.sin(t*.002) * .28;
    drawPlayer();
    player.y = ghost.y;
    player.rotation = ghost.rotation;
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x+rr, y);
    c.arcTo(x+w, y, x+w, y+h, rr);
    c.arcTo(x+w, y+h, x, y+h, rr);
    c.arcTo(x, y+h, x, y, rr);
    c.arcTo(x, y, x+w, y, rr);
    c.closePath();
  }

  function draw(t) {
    ctx.save();
    if (world.shake > 0) {
      const mag = world.shake * 9;
      ctx.translate((Math.random()-.5)*mag, (Math.random()-.5)*mag);
    }
    drawBackground();
    drawWorld();
    drawParticles();
    if (state === 'playing' || state === 'dead') drawPlayer();
    else drawMenuDemo(t);
    ctx.restore();

    if (world.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${world.flash*.35})`;
      ctx.fillRect(0,0,W,H);
    }
  }

  function loop(now) {
    const dt = Math.min(.034, (now - last) / 1000 || .016);
    last = now;
    update(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  const audio = (() => {
    let ac = null;
    let master = null;
    let started = false;
    let beatTimer = null;

    function ensure() {
      if (muted) return null;
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = .16;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }

    function tone(freq, dur=.05, vol=.05, type='sine', slide=0) {
      if (muted) return;
      const a = ensure(); if (!a) return;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq+slide), a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + dur);
      o.connect(g); g.connect(master); o.start(); o.stop(a.currentTime + dur);
    }

    function noise(dur=.09, vol=.06) {
      if (muted) return;
      const a = ensure(); if (!a) return;
      const buffer = a.createBuffer(1, a.sampleRate*dur, a.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i] = Math.random()*2-1;
      const src = a.createBufferSource();
      const g = a.createGain();
      src.buffer = buffer; g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime+dur);
      src.connect(g); g.connect(master); src.start();
    }

    function start() {
      ensure();
      if (started) return;
      started = true;
      let step = 0;
      beatTimer = setInterval(() => {
        if (state !== 'playing' || muted) return;
        step = (step + 1) % 8;
        if (step % 2 === 0) tone(world.fever ? 92 : 74, .045, .025, 'triangle', -12);
        if (world.fever && (step === 2 || step === 6)) tone(184, .035, .018, 'square', 20);
      }, 170);
    }

    function setMuted(v) {
      muted = v;
      localStorage.setItem(STORAGE.sound, v ? '0' : '1');
      ui.sound.classList.toggle('muted', v);
      ui.sound.textContent = v ? '×' : '♪';
      if (!v) ensure();
    }

    return {
      start,
      setMuted,
      blip: (f,d,v) => tone(f,d,v,'triangle',30),
      flip: dir => tone(dir > 0 ? 260 : 390, .055, .05, 'square', dir > 0 ? -80 : 80),
      perfect: combo => { tone(520 + Math.min(combo,20)*24, .07, .065, 'triangle', 120); },
      feverOn: () => { tone(220,.18,.08,'sawtooth',500); setTimeout(()=>tone(440,.16,.07,'sawtooth',600),80); },
      crash: () => { noise(.14,.13); tone(120,.22,.11,'sawtooth',-80); }
    };
  })();

  function primaryAction(e) {
    if (e) e.preventDefault();
    if (state === 'playing') flip();
    else if (state === 'dead') reset(currentMode);
  }

  canvas.addEventListener('pointerdown', primaryAction, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state === 'menu') reset('normal'); else primaryAction();
    }
  });

  ui.play.addEventListener('click', e => { e.stopPropagation(); reset('normal'); });
  ui.daily.addEventListener('click', e => { e.stopPropagation(); reset('daily'); });
  ui.retry.addEventListener('click', e => { e.stopPropagation(); reset(currentMode); });
  ui.home.addEventListener('click', e => { e.stopPropagation(); goMenu(); });
  ui.sound.addEventListener('click', e => { e.stopPropagation(); audio.setMuted(!muted); });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  audio.setMuted(muted);
  resize();
  goMenu();
  requestAnimationFrame(loop);
})();
