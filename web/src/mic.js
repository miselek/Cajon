// Detekce tempa (BPM) z mikrofonu – čistě v prohlížeči, bez serveru.
//
// Princip:
//  1. getUserMedia → AnalyserNode čte signál z mikrofonu.
//  2. Z energie signálu počítáme "onset envelope" – zvýrazňujeme nárůsty
//     hlasitosti (údery), které tvoří rytmus.
//  3. Envelope autokorelujeme a najdeme nejsilnější periodicitu v rozsahu
//     rozumných temp → odhad BPM (+ míra jistoty z výšky korelačního píku).
//
// Dva režimy:
//  - measure()         : jednorázové změření (~8 s)
//  - startContinuous() : soustavné naslouchání – kruhový buffer posledních
//                        ~10 s, tempo se přepočítává každých ~1,5 s a hlásí
//                        se callbackem. Detekuje i ticho mezi písněmi.

const ENVELOPE_HZ = 100; // vzorkování obálky (100 Hz = každých 10 ms)
const MIN_BPM = 60;
const MAX_BPM = 180;
const FOLD_LOW = 70; // preferovaný cvičební rozsah – mimo něj tempo zdvojíme/způlíme
const FOLD_HIGH = 150;

const CONT_WINDOW_SEC = 10; // délka okna pro živou analýzu
const CONT_ANALYZE_MS = 1500; // jak často živě přepočítat tempo
const SILENCE_RMS = 0.006; // pod tím považujeme vstup za ticho
const SILENCE_GAP_MS = 1200; // ticho delší než tohle = pauza / konec písně

export class MicTempo {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.source = null;
    this.level = 0; // okamžitá hlasitost 0..1 (pro ukazatel)
    this._listening = false;

    // soustavný režim
    this._sampleTimer = null;
    this._analyzeTimer = null;
    this._ring = null;
    this._ringPos = 0;
    this._ringCount = 0;
    this._prevEnergy = 0;
    this._silentMs = 0;
  }

  get isActive() {
    return !!this.stream;
  }

  async enable() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source.connect(this.analyser);
    this._buf = new Float32Array(this.analyser.fftSize);
    this._trackLevel();
  }

  disable() {
    this._listening = false;
    this.stopContinuous();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.level = 0;
  }

  _rms() {
    this.analyser.getFloatTimeDomainData(this._buf);
    let sum = 0;
    for (let i = 0; i < this._buf.length; i++) sum += this._buf[i] * this._buf[i];
    return Math.sqrt(sum / this._buf.length);
  }

  // Plynule aktualizuje this.level pro vizuální ukazatel vstupu.
  _trackLevel() {
    const tick = () => {
      if (!this.analyser) return;
      const r = this._rms();
      this.level = this.level * 0.8 + Math.min(1, r * 4) * 0.2;
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ---- jednorázové změření ----
  // Poslouchá `seconds` sekund a vrátí odhad BPM (nebo null).
  async measure(seconds = 8, onProgress = () => {}) {
    if (!this.analyser) await this.enable();
    this._listening = true;

    const dt = 1 / ENVELOPE_HZ;
    const envelope = [];
    let prevEnergy = 0;
    const start = performance.now();
    const durationMs = seconds * 1000;

    return new Promise((resolve) => {
      const sample = () => {
        if (!this._listening) return resolve(null);
        const elapsed = performance.now() - start;
        onProgress(Math.min(1, elapsed / durationMs));

        const energy = this._rms();
        const flux = Math.max(0, energy - prevEnergy);
        prevEnergy = energy;
        envelope.push(flux);

        if (elapsed < durationMs) {
          setTimeout(sample, dt * 1000);
        } else {
          this._listening = false;
          const r = this._analyze(envelope, dt);
          resolve(r ? r.bpm : null);
        }
      };
      sample();
    });
  }

  cancel() {
    this._listening = false;
  }

  // ---- soustavný (živý) režim ----
  // onTempo({ bpm, confidence, silent }) se volá ~každých 1,5 s.
  //   bpm        – odhad tempa (number) nebo null
  //   confidence – 0..1 jak silná je periodicita (k filtrování zákmitů)
  //   silent     – true při delší pauze (ticho mezi písněmi)
  async startContinuous(onTempo) {
    if (!this.analyser) await this.enable();
    this._ring = new Float32Array(CONT_WINDOW_SEC * ENVELOPE_HZ);
    this._ringPos = 0;
    this._ringCount = 0;
    this._prevEnergy = 0;
    this._silentMs = 0;
    const dt = 1 / ENVELOPE_HZ;

    this._sampleTimer = setInterval(() => {
      if (!this.analyser) return;
      const energy = this._rms();
      const flux = Math.max(0, energy - this._prevEnergy);
      this._prevEnergy = energy;
      this._ring[this._ringPos] = flux;
      this._ringPos = (this._ringPos + 1) % this._ring.length;
      if (this._ringCount < this._ring.length) this._ringCount++;

      if (energy < SILENCE_RMS) {
        this._silentMs += dt * 1000;
        // při delší pauze vyčistíme buffer, ať se na novou píseň zamkneme rychle
        if (this._silentMs > SILENCE_GAP_MS) {
          this._ringCount = 0;
          this._ringPos = 0;
        }
      } else {
        this._silentMs = 0;
      }
    }, dt * 1000);

    this._analyzeTimer = setInterval(() => {
      const silent = this._silentMs > SILENCE_GAP_MS;
      // potřebujeme aspoň ~6 s materiálu pro spolehlivý odhad
      if (silent || this._ringCount < ENVELOPE_HZ * 6) {
        onTempo({ bpm: null, confidence: 0, silent });
        return;
      }
      const env = this._ringInOrder();
      const r = this._analyze(env, dt);
      onTempo({
        bpm: r ? r.bpm : null,
        confidence: r ? r.confidence : 0,
        silent: false,
      });
    }, CONT_ANALYZE_MS);
  }

  stopContinuous() {
    if (this._sampleTimer) clearInterval(this._sampleTimer);
    if (this._analyzeTimer) clearInterval(this._analyzeTimer);
    this._sampleTimer = null;
    this._analyzeTimer = null;
  }

  get isContinuous() {
    return !!this._analyzeTimer;
  }

  // Vrátí obsah kruhového bufferu seřazený od nejstaršího po nejnovější.
  _ringInOrder() {
    const n = this._ringCount;
    const len = this._ring.length;
    const out = new Array(n);
    const start = (this._ringPos - n + len) % len;
    for (let i = 0; i < n; i++) out[i] = this._ring[(start + i) % len];
    return out;
  }

  // Autokorelace obálky → { bpm, confidence } nebo null.
  _analyze(envelope, dt) {
    const n = envelope.length;
    if (n < ENVELOPE_HZ) return null;

    const mean = envelope.reduce((a, b) => a + b, 0) / n;
    const env = envelope.map((v) => v - mean);

    // energie signálu (r(0)) pro normalizaci jistoty
    let r0 = 0;
    for (let i = 0; i < n; i++) r0 += env[i] * env[i];
    if (r0 <= 0) return null;

    const minLag = Math.round(60 / MAX_BPM / dt);
    const maxLag = Math.round(60 / MIN_BPM / dt);

    let bestLag = -1;
    let bestWeighted = -Infinity;
    let bestRaw = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let raw = 0;
      for (let i = 0; i + lag < n; i++) raw += env[i] * env[i + lag];
      // zvýhodníme kratší laggy (vyšší tempa bývají správnější než jejich násobky)
      const weighted = raw / Math.sqrt(lag);
      if (weighted > bestWeighted) {
        bestWeighted = weighted;
        bestRaw = raw;
        bestLag = lag;
      }
    }
    if (bestLag <= 0 || bestRaw <= 0) return null;

    // jistota = normalizovaná výška korelačního píku (0..1)
    const confidence = Math.max(0, Math.min(1, bestRaw / r0));

    let bpm = 60 / (bestLag * dt);
    while (bpm < FOLD_LOW) bpm *= 2;
    while (bpm > FOLD_HIGH) bpm /= 2;
    return { bpm: Math.round(bpm), confidence };
  }
}
