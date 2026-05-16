/* ============================================
   CHRONOX — STOPWATCH ENGINE
   ============================================ */
'use strict';

// ── State ──────────────────────────────────────
const state = {
  startTime:    0,
  elapsed:      0,       // total ms at last pause
  lapStart:     0,       // ms at which the current lap began
  running:      false,
  rafId:        null,
  laps:         [],      // [{lapMs, totalMs}]
};

// ── DOM References ─────────────────────────────
const $ = id => document.getElementById(id);

const els = {
  hours:        $('timeHours'),
  minutes:      $('timeMinutes'),
  seconds:      $('timeSeconds'),
  ms:           $('timeMs'),
  statusText:   $('statusText'),
  statusDot:    $('statusDot'),
  statusPill:   $('statusPill'),
  ring:         $('ringProgress'),
  lapCount:     $('lapCount'),
  bestLap:      $('bestLap'),
  avgLap:       $('avgLap'),
  btnStart:     $('btnStartPause'),
  btnLapReset:  $('btnLapReset'),
  lapResetLbl:  $('lapResetLabel'),
  btnShare:     $('btnShare'),
  btnClearLaps: $('btnClearLaps'),
  lapsEmpty:    $('lapsEmpty'),
  lapsList:     $('lapsList'),
  toast:        $('toast'),
  iconPlay:     document.querySelector('.icon-play'),
  iconPause:    document.querySelector('.icon-pause'),
};

// Ring circumference is 2 * PI * 148 ≈ 929.9
const RING_CIRC = 929.9;

// ── Utilities ──────────────────────────────────
function pad(n, len = 2) {
  return String(Math.floor(n)).padStart(len, '0');
}

function formatMs(ms) {
  const totalMs  = Math.max(0, ms);
  const h  = Math.floor(totalMs / 3_600_000);
  const m  = Math.floor((totalMs % 3_600_000) / 60_000);
  const s  = Math.floor((totalMs %     60_000) / 1_000);
  const cs = Math.floor((totalMs %      1_000));
  return { h, m, s, cs };
}

function toDisplayMs(ms) {
  const { h, m, s, cs } = formatMs(ms);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function toLapString(ms) {
  const { h, m, s, cs } = formatMs(ms);
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs, 3).slice(0,2)}`;
  return `${pad(m)}:${pad(s)}.${pad(cs, 3).slice(0,2)}`;
}

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

// ── Ring Updater ───────────────────────────────
function updateRing(secondsFraction) {
  // The ring completes 1 revolution every 60 seconds
  const frac = secondsFraction % 1;
  const offset = RING_CIRC * (1 - frac);
  els.ring.style.strokeDashoffset = offset;
}

// ── Display Updater ────────────────────────────
function updateDisplay(totalElapsed) {
  const { h, m, s, cs } = formatMs(totalElapsed);
  els.hours.textContent   = pad(h);
  els.minutes.textContent = pad(m);
  els.seconds.textContent = pad(s);
  els.ms.textContent      = '.' + pad(cs, 3);

  // Ring: fraction through current minute
  const secondsFraction = (m * 60 + s + cs / 1000) / 60;
  updateRing(secondsFraction);
}

// ── Tick ──────────────────────────────────────
function tick() {
  const now     = performance.now();
  const elapsed = state.elapsed + (now - state.startTime);
  updateDisplay(elapsed);
  state.rafId = requestAnimationFrame(tick);
}

// ── Control Logic ──────────────────────────────
function startTimer() {
  state.startTime = performance.now();
  if (state.lapStart === 0) state.lapStart = state.elapsed;
  state.running = true;
  state.rafId   = requestAnimationFrame(tick);

  // UI
  document.body.classList.add('running');
  document.body.classList.remove('paused');
  els.iconPlay.style.display  = 'none';
  els.iconPause.style.display = '';
  els.statusText.textContent  = 'Running';
  els.btnStart.setAttribute('aria-label', 'Pause stopwatch');
  els.btnLapReset.disabled    = false;
  els.lapResetLbl.textContent = 'Lap';
}

function pauseTimer() {
  cancelAnimationFrame(state.rafId);
  state.elapsed += performance.now() - state.startTime;
  state.running  = false;

  // UI
  document.body.classList.remove('running');
  document.body.classList.add('paused');
  els.iconPlay.style.display  = '';
  els.iconPause.style.display = 'none';
  els.statusText.textContent  = 'Paused';
  els.btnStart.setAttribute('aria-label', 'Resume stopwatch');
  els.lapResetLbl.textContent = 'Reset';
  updateDisplay(state.elapsed);
}

function resetTimer() {
  cancelAnimationFrame(state.rafId);
  state.startTime = 0;
  state.elapsed   = 0;
  state.lapStart  = 0;
  state.running   = false;

  // UI
  document.body.classList.remove('running', 'paused');
  els.iconPlay.style.display  = '';
  els.iconPause.style.display = 'none';
  els.statusText.textContent  = 'Ready';
  els.btnStart.setAttribute('aria-label', 'Start stopwatch');
  els.btnLapReset.disabled    = true;
  els.lapResetLbl.textContent = 'Lap';
  els.ring.style.strokeDashoffset = RING_CIRC;

  updateDisplay(0);
  clearLaps();
}

function addLap() {
  if (!state.running) return;

  const now         = performance.now();
  const totalElapsed= state.elapsed + (now - state.startTime);
  const lapMs       = totalElapsed - state.lapStart;

  state.laps.push({ lapMs, totalMs: totalElapsed });
  state.lapStart = totalElapsed - state.elapsed + (now - state.startTime);
  // Correct lapStart accounting for elapsed offset:
  state.lapStart = totalElapsed; // total ms at lap boundary

  renderLaps();
  updateStats();
}

function clearLaps() {
  state.laps = [];
  renderLaps();
  updateStats();
}

// ── Stats ──────────────────────────────────────
function updateStats() {
  const count = state.laps.length;
  els.lapCount.textContent = count;

  if (count === 0) {
    els.bestLap.textContent = '—';
    els.avgLap.textContent  = '—';
    return;
  }

  const times = state.laps.map(l => l.lapMs);
  const best  = Math.min(...times);
  const avg   = times.reduce((a, b) => a + b, 0) / count;

  els.bestLap.textContent = toLapString(best);
  els.avgLap.textContent  = toLapString(avg);
}

// ── Lap Rendering ──────────────────────────────
function renderLaps() {
  const laps  = state.laps;
  const count = laps.length;

  if (count === 0) {
    els.lapsEmpty.style.display  = '';
    els.lapsList.style.display   = 'none';
    els.btnClearLaps.style.display = 'none';
    return;
  }

  els.lapsEmpty.style.display  = 'none';
  els.lapsList.style.display   = '';
  els.btnClearLaps.style.display = '';

  const times  = laps.map(l => l.lapMs);
  const minMs  = Math.min(...times);
  const maxMs  = Math.max(...times);

  const fragment = document.createDocumentFragment();

  laps.forEach((lap, idx) => {
    const li    = document.createElement('li');
    const isBest  = count > 1 && lap.lapMs === minMs;
    const isWorst = count > 1 && lap.lapMs === maxMs;

    li.className = 'lap-item' + (isBest ? ' lap-best' : isWorst ? ' lap-worst' : '');

    const lapNum = idx + 1;
    let badgeHtml = '';
    if (isBest)  badgeHtml = `<span class="lap-badge best">Best</span>`;
    if (isWorst) badgeHtml = `<span class="lap-badge worst">Slow</span>`;

    li.innerHTML = `
      <div class="lap-left">
        <span class="lap-number">#${pad(lapNum)}</span>
        ${badgeHtml}
      </div>
      <div class="lap-right">
        <span class="lap-time">${toLapString(lap.lapMs)}</span>
        <span class="lap-total">Total ${toLapString(lap.totalMs)}</span>
      </div>
    `;
    fragment.appendChild(li);
  });

  els.lapsList.innerHTML = '';
  els.lapsList.appendChild(fragment);

  // Scroll to show newest lap (the last item)
  requestAnimationFrame(() => {
    els.lapsList.scrollTop = els.lapsList.scrollHeight;
  });
}

// ── Share ──────────────────────────────────────
function shareResults() {
  const { h, m, s, cs } = formatMs(state.elapsed);
  const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs, 3).slice(0,2)}`;
  const lapLines = state.laps.map((l, i) =>
    `  Lap ${i + 1}: ${toLapString(l.lapMs)} (total ${toLapString(l.totalMs)})`
  ).join('\n');

  const text = `⏱ ChronoX Session\nTime: ${timeStr}\nLaps: ${state.laps.length}${lapLines ? '\n' + lapLines : ''}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('📋 Results copied to clipboard!'))
      .catch(() => showToast('⚠️ Could not copy to clipboard'));
  } else {
    showToast('⚠️ Clipboard not available');
  }
}

// ── Button Handlers ────────────────────────────
els.btnStart.addEventListener('click', () => {
  if (state.running) pauseTimer();
  else startTimer();
});

els.btnLapReset.addEventListener('click', () => {
  if (state.running) {
    addLap();
    // Flash animation on the button
    els.btnLapReset.style.transform = 'scale(0.92)';
    setTimeout(() => { els.btnLapReset.style.transform = ''; }, 150);
  } else {
    resetTimer();
  }
});

els.btnShare.addEventListener('click', shareResults);
els.btnClearLaps.addEventListener('click', () => {
  clearLaps();
  showToast('🗑 Laps cleared');
});

// ── Keyboard Shortcuts ─────────────────────────
document.addEventListener('keydown', e => {
  // Ignore if focus is inside an input / textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (state.running) pauseTimer();
      else startTimer();
      break;
    case 'KeyL':
      if (state.running) addLap();
      break;
    case 'KeyR':
      if (!state.running && state.elapsed > 0) resetTimer();
      break;
  }
});

// ── Init ──────────────────────────────────────
(function init() {
  updateDisplay(0);
  els.ring.style.strokeDashoffset = RING_CIRC;
  els.btnLapReset.disabled = true;
  renderLaps();
  updateStats();
})();
