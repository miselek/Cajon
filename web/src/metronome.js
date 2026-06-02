// Přesný metronom + přehrávač cajon patternu nad Web Audio API.
//
// Používá "lookahead scheduling" pattern (Chris Wilson): časovač v JS jen
// dopředu plánuje zvukové události na přesný hodinový čas AudioContextu, takže
// timing nedrhtí ani když je hlavní vlákno zaneprázdněné vykreslováním.

import { stepMap } from './patterns.js';

const LOOKAHEAD_MS = 25; // jak často scheduler kontroluje
const SCHEDULE_AHEAD = 0.12; // o kolik sekund dopředu plánujeme

// Čistá projekce nadcházejících úderů – snadno testovatelná bez Web Audio.
// Promítá kroky vpřed od stavu scheduleru a vybírá ty, na kterých je úder.
export function projectHits(now, nextNoteTime, currentStep, sps, sub, lookup, windowSec) {
  const out = [];
  const back = 2; // pár kroků do minulosti, ať noty hezky „propadnou" pod čáru
  let t = nextNoteTime - back * sps;
  let step = (((currentStep - back) % sub) + sub) % sub;
  let guard = 0;
  while (t - now <= windowSec && guard < 4000) {
    const timeUntil = t - now;
    if (timeUntil >= -0.35) {
      const hit = lookup.get(step);
      if (hit) out.push({ hit: hit.hit, hand: hit.hand, timeUntil });
    }
    t += sps;
    step = (step + 1) % sub;
    guard++;
  }
  return out;
}

export class Metronome {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;

    this.bpm = 70;
    this.pattern = null;
    this.stepLookup = new Map();

    this.isPlaying = false;
    this.currentStep = 0; // další naplánovaný krok
    this.nextNoteTime = 0;
    this.timerId = null;

    this.clickOn = true; // přehrávat metronomový klik na dobách
    this.hitsOn = true; // přehrávat ukázkové zvuky úderů cajonu
    this.volume = 0.9;

    this.notesInQueue = []; // {step, time} pro vizuální synchronizaci
    this.lastDrawnStep = -1;
  }

  ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this._makeNoise();
  }

  // Prohlížeč povolí zvuk až po gestu uživatele – voláme z kliknutí.
  async resume() {
    this.ensureContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(240, Math.round(bpm)));
  }

  setPattern(pattern) {
    this.pattern = pattern;
    this.stepLookup = stepMap(pattern);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _secondsPerStep() {
    // délka jedné buňky = (délka doby) * (počet dob / počet buněk)
    const secondsPerBeat = 60 / this.bpm;
    return secondsPerBeat * (this.pattern.beatsPerBar / this.pattern.subdivisions);
  }

  async start() {
    if (this.isPlaying || !this.pattern) return;
    await this.resume();
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.notesInQueue = [];
    this.lastDrawnStep = -1;
    this._scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) clearTimeout(this.timerId);
    this.timerId = null;
    this.notesInQueue = [];
  }

  _scheduler() {
    if (!this.isPlaying) return;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this._scheduleStep(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += this._secondsPerStep();
      this.currentStep = (this.currentStep + 1) % this.pattern.subdivisions;
    }
    this.timerId = setTimeout(() => this._scheduler(), LOOKAHEAD_MS);
  }

  _scheduleStep(step, time) {
    this.notesInQueue.push({ step, time });

    const cellsPerBeat = this.pattern.subdivisions / this.pattern.beatsPerBar;
    const isBeat = step % cellsPerBeat === 0;

    if (this.clickOn && isBeat) {
      this._playClick(time, step === 0);
    }

    if (this.hitsOn) {
      const hit = this.stepLookup.get(step);
      if (hit) this._playHit(hit.hit, time);
    }
  }

  // Vrátí aktuálně znějící krok podle hodin AudioContextu (pro vizuál).
  // Vrací -1 dokud nezačne hrát.
  currentVisualStep() {
    if (!this.isPlaying || !this.ctx) return -1;
    const now = this.ctx.currentTime;
    while (this.notesInQueue.length && this.notesInQueue[0].time < now) {
      this.lastDrawnStep = this.notesInQueue[0].step;
      this.notesInQueue.shift();
    }
    return this.lastDrawnStep;
  }

  // Zarovná mřížku tak, aby další DOBA padla za `secUntilNextBeat` sekund
  // (automatika z mikrofonu). Kompenzuje výstupní latenci zvuku.
  realignBeat(secUntilNextBeat) {
    if (!this.isPlaying || !this.pattern || !this.ctx) return;
    const cellsPerBeat = this.pattern.subdivisions / this.pattern.beatsPerBar;
    const sps = this._secondsPerStep();
    const beatPeriod = sps * cellsPerBeat;
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    let beatTime = this.ctx.currentTime + secUntilNextBeat - latency;
    while (beatTime < this.ctx.currentTime + 0.03) beatTime += beatPeriod;
    // další naplánovaný krok bude hranice doby
    this.currentStep =
      (Math.ceil((this.currentStep + 1e-6) / cellsPerBeat) * cellsPerBeat) %
      this.pattern.subdivisions;
    this.nextNoteTime = beatTime;
    this.notesInQueue = [];
    this.lastDrawnStep = -1;
  }

  // Zarovná „1" (začátek taktu) na teď – pro ruční tlačítko „Srovnat".
  alignDownbeat() {
    if (!this.pattern || !this.ctx) return;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime;
    this.notesInQueue = [];
    this.lastDrawnStep = -1;
  }

  // Nadcházející údery v okně `windowSec` (pro „dálnici" padajících not).
  // Každý: { hit, hand, timeUntil } (timeUntil < 0 = právě prošel čárou).
  upcomingHits(windowSec) {
    if (!this.isPlaying || !this.pattern || !this.ctx) return [];
    return projectHits(
      this.ctx.currentTime,
      this.nextNoteTime,
      this.currentStep,
      this._secondsPerStep(),
      this.pattern.subdivisions,
      this.stepLookup,
      windowSec
    );
  }

  // ---- syntéza zvuků ----

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _playClick(time, accent) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1900 : 1300;
    const peak = accent ? 0.55 : 0.32;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.045);
    osc.connect(gain).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  _playHit(type, time) {
    if (type === 'bass') return this._playBass(time);
    if (type === 'tone') return this._playTone(time);
    return this._playGhost(time);
  }

  _playBass(time) {
    // hluboký "thump" – sinus s rychlým poklesem výšky
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.12);
    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  _playTone(time) {
    // "slap" na hranu – krátký šumový impuls přes pásmovou propust
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(time);
    src.stop(time + 0.12);
  }

  _playGhost(time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.13, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(lp).connect(gain).connect(this.master);
    src.start(time);
    src.stop(time + 0.07);
  }
}
