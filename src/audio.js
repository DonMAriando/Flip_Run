import { storage } from './storage.js';

const BEAT = 0.17;
const LOOKAHEAD = 0.2;

export function createAudio() {
  let ac = null;
  let master = null;
  let muted = storage.muted;
  let nextBeat = 0;
  let beatStep = 0;

  function ensure() {
    if (muted) return null;
    if (!ac) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ac = new Ctx();
      master = ac.createGain();
      master.gain.value = 0.16;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur = 0.05, vol = 0.05, type = 'sine', slide = 0, when = 0) {
    const a = ensure();
    if (!a) return;
    const t = when || a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(dur = 0.09, vol = 0.06) {
    const a = ensure();
    if (!a) return;
    const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    const gain = a.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(vol, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    src.connect(gain);
    gain.connect(master);
    src.start();
  }

  return {
    get muted() { return muted; },

    unlock() { ensure(); },

    setMuted(value) {
      muted = value;
      storage.setMuted(value);
      if (!value) ensure();
    },

    resetMusic() {
      nextBeat = 0;
      beatStep = 0;
    },

    // Scheduler con lookahead llamado desde el loop. Reemplaza al setInterval
    // de la versión anterior, que nunca se limpiaba.
    updateMusic(playing, fever) {
      if (muted || !playing) return;
      const a = ensure();
      if (!a) return;
      const now = a.currentTime;
      if (nextBeat < now) nextBeat = now + 0.05;
      while (nextBeat < now + LOOKAHEAD) {
        if (beatStep % 2 === 0) tone(fever ? 92 : 74, 0.045, 0.025, 'triangle', -12, nextBeat);
        if (fever && (beatStep === 2 || beatStep === 6)) tone(184, 0.035, 0.018, 'square', 20, nextBeat);
        beatStep = (beatStep + 1) % 8;
        nextBeat += BEAT;
      }
    },

    flip(dir) { tone(dir > 0 ? 260 : 390, 0.055, 0.05, 'square', dir > 0 ? -80 : 80); },
    orb(combo) { tone(430 + Math.min(combo, 24) * 26, 0.07, 0.06, 'triangle', 130); },
    graze() { tone(1250, 0.03, 0.02, 'sine', -300); },
    feverOn() {
      tone(220, 0.18, 0.08, 'sawtooth', 500);
      setTimeout(() => tone(440, 0.16, 0.07, 'sawtooth', 600), 80);
    },
    comboDecay() { tone(180, 0.09, 0.035, 'sine', -60); },
    start() { tone(280, 0.05, 0.04, 'triangle', 30); },
    crash() {
      noise(0.14, 0.13);
      tone(120, 0.22, 0.11, 'sawtooth', -80);
    }
  };
}
