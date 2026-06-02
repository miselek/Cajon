import './style.css';
import { PATTERNS, getPattern, stepMap, suggestPatternForBpm } from './patterns.js';
import { Metronome } from './metronome.js';
import { MicTempo } from './mic.js';
import {
  renderGrid,
  highlightStep,
  renderCajon,
  flashCajon,
  hitLabel,
} from './notation.js';

const metro = new Metronome();
const mic = new MicTempo();

let pattern = PATTERNS[0];
let lookup = stepMap(pattern);
let lastStep = -1;

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const els = {
  cajon: $('cajon'),
  grid: $('grid'),
  desc: $('pattern-desc'),
  list: $('pattern-list'),
  bpm: $('bpm'),
  bpmNum: $('bpm-num'),
  tap: $('tap'),
  play: $('play'),
  click: $('click-toggle'),
  hits: $('hits-toggle'),
  volume: $('volume'),
  micBtn: $('mic-btn'),
  micLevel: $('mic-level-bar'),
  micStatus: $('mic-status'),
};

// ---- inicializace ----
renderCajon(els.cajon);
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

// ---- přehrávání ----
els.play.addEventListener('click', async () => {
  if (metro.isPlaying) {
    metro.stop();
    els.play.textContent = '▶︎ Spustit';
    els.play.classList.remove('playing');
    highlightStep(els.grid, -1);
    lastStep = -1;
  } else {
    await metro.start();
    els.play.textContent = '⏸ Stop';
    els.play.classList.add('playing');
  }
});

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
    els.micBtn.textContent = '🎤 Změřit tempo z mikrofonu';
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
    if (hit) flashCajon(els.cajon, hit.hit);
    lastStep = step;
  }
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
