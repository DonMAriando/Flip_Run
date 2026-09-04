const $ = id => document.getElementById(id);

export function createUi() {
  const els = {
    hud: $('hud'),
    score: $('score'),
    best: $('best'),
    meters: $('meters'),
    combo: $('combo'),
    decayFill: $('decayFill'),
    fever: $('fever'),
    attempt: $('attempt'),
    overlay: $('overlay'),
    logoWrap: $('logoWrap'),
    subtitle: $('subtitle'),
    menu: $('menu'),
    gameOver: $('gameOver'),
    newRecord: $('newRecord'),
    finalScore: $('finalScore'),
    runStats: $('runStats'),
    progressFill: $('progressFill'),
    progressLabel: $('progressLabel'),
    play: $('playBtn'),
    daily: $('dailyBtn'),
    retry: $('retryBtn'),
    home: $('homeBtn'),
    sound: $('soundBtn'),
    toast: $('toast')
  };

  // Cache de los valores ya escritos: el HUD se refresca cada frame y no
  // conviene tocar el DOM si nada cambió.
  const shown = { score: -1, meters: -1, combo: -1, fever: null, decay: -1 };
  let toastTimer = 0;

  return {
    els,

    setHud({ score, meters, combo, comboProgress, fever }) {
      if (score !== shown.score) {
        shown.score = score;
        els.score.textContent = score.toLocaleString('es-AR');
      }
      if (meters !== shown.meters) {
        shown.meters = meters;
        els.meters.textContent = `${meters} M`;
      }
      if (combo !== shown.combo) {
        shown.combo = combo;
        els.combo.textContent = `x${combo}`;
        els.combo.classList.remove('bump');
        void els.combo.offsetWidth;
        els.combo.classList.add('bump');
      }
      const decay = Math.round(comboProgress * 100) / 100;
      if (decay !== shown.decay) {
        shown.decay = decay;
        els.decayFill.style.transform = `scaleX(${Math.max(0, decay)})`;
      }
      if (fever !== shown.fever) {
        shown.fever = fever;
        els.fever.classList.toggle('hidden', !fever);
      }
    },

    setBestLabel(text) {
      els.best.textContent = text;
    },

    setAttempt(text) {
      els.attempt.textContent = text || '';
      els.attempt.classList.toggle('hidden', !text);
    },

    resetHudCache() {
      shown.score = shown.meters = shown.combo = shown.decay = -1;
      shown.fever = null;
    },

    showMenu(subtitle) {
      els.subtitle.textContent = subtitle;
      els.overlay.classList.remove('hidden');
      els.logoWrap.classList.remove('hidden');
      els.menu.classList.remove('hidden');
      els.gameOver.classList.add('hidden');
      els.hud.classList.add('hidden');
    },

    showPlaying() {
      els.overlay.classList.add('hidden');
      els.menu.classList.add('hidden');
      els.gameOver.classList.add('hidden');
      els.hud.classList.remove('hidden');
    },

    showGameOver({ score, meters, orbs, maxCombo, record, subtitle, attempt, progress, progressLabel }) {
      els.finalScore.textContent = score.toLocaleString('es-AR');
      els.runStats.textContent = `${meters} M · ${orbs} ORBES · x${maxCombo} MAX`;
      els.newRecord.classList.toggle('hidden', !record);
      els.subtitle.textContent = subtitle;
      els.progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
      els.progressLabel.textContent = progressLabel;
      els.attempt.textContent = attempt || '';
      els.attempt.classList.toggle('hidden', !attempt);
      els.overlay.classList.remove('hidden');
      els.logoWrap.classList.add('hidden');
      els.menu.classList.add('hidden');
      els.gameOver.classList.remove('hidden');
      els.hud.classList.add('hidden');
    },

    toast(text, tone = '') {
      els.toast.textContent = text;
      els.toast.className = `toast ${tone}`;
      void els.toast.offsetWidth;
      els.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => els.toast.classList.remove('show'), 340);
    },

    setSoundMuted(muted) {
      els.sound.classList.toggle('muted', muted);
      els.sound.textContent = muted ? '×' : '♪';
    }
  };
}
