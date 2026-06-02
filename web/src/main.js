import './style.css';
import { PATTERNS, getPattern, stepMap, suggestPatternForBpm } from './patterns.js';
import { Metronome } from './metronome.js';
import { MicTempo } from './mic.js';
import {
  renderGrid,
  highlightStep,
  renderCajon,
  cajonStrike,
  hitLabel,
} from './notation.js';
import { fitHighway, drawHighway } from './highway.js';

const HIGHWAY_WINDOW = 2.2; // kolik sekund dopředu dálnice ukazuje

const metro = new Metronome();
const mic = new MicTempo();

let pattern = PATTERNS[0];
let lookup = stepMap(pattern);
let lastStep = -1;

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const els = {
  cajon: $('cajon'),
  highway: $('highway'),
  grid: $('grid'),
  desc: $('pattern-desc'),
  list: $('pattern-list'),
  bpm: $('bpm'),
  bpmNum: $('bpm-num'),
  tap: $('tap'),
  align: $('align'),
  play: $('play'),
  click: $('click-toggle'),
  hits: $('hits-toggle'),
  volume: $('volume'),
  micBtn: $('mic-btn'),
  micLevel: $('mic-level-bar'),
  micStatus: $('mic-status'),
  live: $('live-toggle'),
};

// ---- inicializace ----
renderCajon(els.cajon);
fitHighway(els.highway);
window.addEventListener('resize', () => fitHighway(els.highway));
buildPatternList();
selectPattern(pattern.id);
setBpm(pattern.recommendedBpm);

function buildPatternList() {
  els.list.innerHTML = '';
  for (const p of PATTERNS) {
    const card = document.createElement('button');
    card.className = 'pattern-card';
    card.dataset.id = p.id;
    card.innerHTML = `
      <span class="pc-name">${p.name}</span>
      <span class="pc-level ${p.level}">${
        p.level === 'zacatecnik' ? 'začátečník' : 'mírně pokročilý'
      }</span>
    `;
    card.addEventListener('click', () => {
      selectPattern(p.id);
      setBpm(p.recommendedBpm);
    });
    els.list.appendChild(card);
  }
}

function selectPattern(id) {
  pattern = getPattern(id);
  lookup = stepMap(pattern);
  metro.setPattern(pattern);
  renderGrid(els.grid, pattern);
  els.desc.textContent = pattern.description;
  for (const card of els.list.children) {
    card.classList.toggle('selected', card.dataset.id === id);
  }
}

function setBpm(bpm) {
  bpm = Math.max(40, Math.min(200, Math.round(bpm)));
  metro.setBpm(bpm);
  els.bpm.value = String(bpm);
  els.bpmNum.value = String(bpm);
}

// ---- ovládání tempa ----
els.bpm.addEventListener('input', () => setBpm(+els.bpm.value));
els.bpmNum.addEventListener('input', () => setBpm(+els.bpmNum.value));

// Tap tempo
let taps = [];
els.tap.addEventListener('click', () => {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = []; // reset po pauze
  taps.push(now);
  if (taps.length > 6) taps.shift();
  if (taps.length >= 2) {
    let sum = 0;
    for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
    const avg = sum / (taps.length - 1);
    setBpm(60000 / avg);
  }
  els.tap.classList.remove('pulse');
  void els.tap.offsetWidth;
  els.tap.classList.add('pulse');
});

// Ruční zarovnání: klepni na "1" písně a doby se srovnají.
els.align.addEventListener('click', async () => {
  if (!metro.isPlaying) await startMetro();
  metro.alignDownbeat();
  els.align.classList.remove('pulse');
  void els.align.offsetWidth;
  els.align.classList.add('pulse');
});

// ---- přehrávání ----
async function startMetro() {
  await metro.start();
  els.play.textContent = '⏸ Stop';
  els.play.classList.add('playing');
}
function stopMetro() {
  metro.stop();
  els.play.textContent = '▶︎ Spustit';
  els.play.classList.remove('playing');
  highlightStep(els.grid, -1);
  lastStep = -1;
}
els.play.addEventListener('click', () => (metro.isPlaying ? stopMetro() : startMetro()));

els.click.addEventListener('change', () => (metro.clickOn = els.click.checked));
els.hits.addEventListener('change', () => (metro.hitsOn = els.hits.checked));
els.volume.addEventListener('input', () => metro.setVolume(+els.volume.value));
metro.clickOn = els.click.checked;
metro.hitsOn = els.hits.checked;
metro.setVolume(+els.volume.value);

// ---- mikrofon: změření tempa ----
let measuring = false;
els.micBtn.addEventListener('click', async () => {
  if (measuring) {
    mic.cancel();
    return;
  }
  try {
    measuring = true;
    els.micBtn.classList.add('listening');
    els.micBtn.textContent = '● Poslouchám… (klepni pro zrušení)';
    els.micStatus.textContent =
      'Pusť písničku nahlas vedle telefonu a chvíli vydrž…';

    const bpm = await mic.measure(8, (p) => {
      els.micStatus.textContent = `Měřím tempo… ${Math.round(p * 100)} %`;
    });

    if (bpm) {
      setBpm(bpm);
      const sug = suggestPatternForBpm(bpm);
      selectPattern(sug);
      els.micStatus.textContent = `Naměřeno ${bpm} BPM. Doporučený rytmus nastaven. Můžeš doladit posuvníkem nebo Tap tempem.`;
    } else {
      els.micStatus.textContent =
        'Tempo se nepodařilo spolehlivě určit. Zkus to v tišším prostředí, nebo použij Tap tempo.';
    }
  } catch (err) {
    els.micStatus.textContent =
      'Mikrofon není dostupný (povol přístup v prohlížeči, vyžaduje HTTPS nebo localhost).';
    console.error(err);
  } finally {
    measuring = false;
    els.micBtn.classList.remove('listening');
    els.micBtn.textContent = '🎤 Změřit tempo (~8 s)';
  }
});

// ---- živý režim: soustavné naslouchání + auto-přelaďování ----
let wakeLock = null;
let lockedBpm = null; // aktuálně zamčené živé tempo
let cand = { bpm: null, count: 0 }; // kandidát na nové tempo
const SAME_TOL = 4; // ±BPM = bereme jako stejnou píseň
const SWITCH_COUNT = 3; // tolik stabilních oken po sobě → přepnutí
const MIN_CONF = 0.12; // minimální jistota, ať appka nereaguje na šum

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {
    /* nevadí – jen obrazovka může zhasnout */
  }
}
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
// po probuzení obrazovky Wake Lock obnovíme
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && els.live.checked && !wakeLock) {
    requestWakeLock();
  }
});

async function onLiveTempo({ bpm, confidence, silent, nextBeatIn }) {
  if (silent) {
    cand = { bpm: null, count: 0 };
    els.micStatus.textContent = '⏸ Ticho / pauza mezi písněmi…';
    return;
  }
  if (!bpm || confidence < MIN_CONF) {
    els.micStatus.textContent = lockedBpm
      ? `🎵 Drží ${lockedBpm} BPM · poslouchám…`
      : 'Poslouchám… (zatím slabý/nejasný rytmus)';
    return;
  }
  if (lockedBpm === null) {
    lockedBpm = bpm; // první zámek
    setBpm(bpm);
    if (!metro.isPlaying) await startMetro();
    metro.realignBeat(nextBeatIn); // zarovnat doby na píseň
    els.micStatus.textContent = `🔒 Zamčeno na ${bpm} BPM`;
    return;
  }
  if (Math.abs(bpm - lockedBpm) <= SAME_TOL) {
    cand = { bpm: null, count: 0 }; // stabilní, stejná píseň
    els.micStatus.textContent = `🔒 ${lockedBpm} BPM · jistota ${Math.round(confidence * 100)} %`;
    return;
  }
  // jiné tempo – počkáme, až bude stabilní několik oken po sobě
  if (cand.bpm !== null && Math.abs(bpm - cand.bpm) <= SAME_TOL) cand.count++;
  else cand = { bpm, count: 1 };
  els.micStatus.textContent = `🔄 Nové tempo ${bpm} BPM? (${cand.count}/${SWITCH_COUNT})`;
  if (cand.count >= SWITCH_COUNT) {
    lockedBpm = cand.bpm;
    setBpm(lockedBpm);
    metro.realignBeat(nextBeatIn); // nová píseň → znovu zarovnat doby
    cand = { bpm: null, count: 0 };
    els.micStatus.textContent = `🔁 Přeladěno na ${lockedBpm} BPM`;
  }
}

let prevClickOn = true; // zapamatovaný stav kliku před živým režimem
els.live.addEventListener('change', async () => {
  if (els.live.checked) {
    try {
      await metro.resume();
      lockedBpm = null;
      cand = { bpm: null, count: 0 };
      // klik metronomu by mikrofon „slyšel" a kazil detekci → v živém režimu
      // ho ztlumíme; uživatel hraje podle písničky + vizuálu.
      prevClickOn = els.click.checked;
      els.click.checked = false;
      metro.clickOn = false;
      await mic.startContinuous(onLiveTempo);
      await requestWakeLock();
      els.micStatus.textContent =
        'Živý režim zapnut – poslouchám… (klik metronomu ztlumen, ať neruší)';
    } catch (err) {
      els.live.checked = false;
      els.micStatus.textContent =
        'Mikrofon není dostupný (povol přístup v prohlížeči, vyžaduje HTTPS nebo localhost).';
      console.error(err);
    }
  } else {
    mic.stopContinuous();
    releaseWakeLock();
    els.click.checked = prevClickOn; // obnovit klik
    metro.clickOn = prevClickOn;
    els.micStatus.textContent = 'Živý režim vypnut.';
  }
});

// ukazatel hlasitosti vstupu
function levelLoop() {
  if (mic.isActive) {
    els.micLevel.style.width = Math.round(mic.level * 100) + '%';
  } else {
    els.micLevel.style.width = '0%';
  }
  requestAnimationFrame(levelLoop);
}
levelLoop();

// ---- vizuální smyčka: playhead + blikání cajonu ----
function visualLoop() {
  const step = metro.currentVisualStep();
  if (step !== lastStep) {
    highlightStep(els.grid, step);
    const hit = lookup.get(step);
    if (hit) cajonStrike(els.cajon, hit.hand, hit.hit);
    lastStep = step;
  }
  const hits = metro.isPlaying ? metro.upcomingHits(HIGHWAY_WINDOW) : [];
  drawHighway(els.highway, hits, HIGHWAY_WINDOW);
  requestAnimationFrame(visualLoop);
}
visualLoop();

// drobnost: legenda úderů z dat
const legend = $('legend');
if (legend) {
  legend.innerHTML = ['bass', 'tone', 'ghost']
    .map(
      (h) =>
        `<span class="leg leg-${h}"><span class="symbol" data-hit="${h}"></span>${hitLabel(
          h
        )}</span>`
    )
    .join('');
}
