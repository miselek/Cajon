// Detekce tempa (BPM) z mikrofonu – čistě v prohlížeči, bez serveru.
//
// Princip:
//  1. getUserMedia → AnalyserNode čte signál z mikrofonu.
//  2. Z energie signálu počítáme "onset envelope" – zvýrazňujeme nárůsty
//     hlasitosti (údery), které tvoří rytmus.
//  3. Po několika sekundách envelope autokorelujeme a najdeme nejsilnější
//     periodicitu v rozsahu rozumných temp → odhad BPM.
//
// Autokorelace je odolnější než prosté hledání špiček (zvládne hluk i to,
// že některé údery „chybí").

const ENVELOPE_HZ = 100; // vzorkování obálky (100 Hz = každých 10 ms)
const MIN_BPM = 60;
const MAX_BPM = 180;
const FOLD_LOW = 70; // preferovaný cvičební rozsah – mimo něj tempo zdvojíme/způlíme
const FOLD_HIGH = 150;

export class MicTempo {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.source = null;
    this.level = 0; // okamžitá hlasitost 0..1 (pro ukazatel)
    this._listening = false;
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

  // Poslouchá `seconds` sekund a vrátí odhad BPM (nebo null).
  // onProgress(0..1) průběžně informuje o postupu.
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
        // spectral/energy flux – jen kladný nárůst (nástup úderu)
        const flux = Math.max(0, energy - prevEnergy);
        prevEnergy = energy;
        envelope.push(flux);

        if (elapsed < durationMs) {
          setTimeout(sample, dt * 1000);
        } else {
          this._listening = false;
          resolve(this._estimateBpm(envelope, dt));
        }
      };
      sample();
    });
  }

  cancel() {
    this._listening = false;
  }

  _estimateBpm(envelope, dt) {
    const n = envelope.length;
    if (n < ENVELOPE_HZ) return null; // málo dat

    // normalizace obálky (odečtení střední hodnoty zostří autokorelaci)
    const mean = envelope.reduce((a, b) => a + b, 0) / n;
    const env = envelope.map((v) => v - mean);

    const minLag = Math.round(60 / MAX_BPM / dt);
    const maxLag = Math.round(60 / MIN_BPM / dt);

    let bestLag = -1;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0;
      for (let i = 0; i + lag < n; i++) score += env[i] * env[i + lag];
      // mírně zvýhodníme kratší laggy (vyšší tempa bývají správnější odhad
      // než jejich celočíselné násobky)
      score /= Math.sqrt(lag);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestLag <= 0 || bestScore <= 0) return null;

    let bpm = 60 / (bestLag * dt);
    // přeložení do příjemného cvičebního rozsahu
    while (bpm < FOLD_LOW) bpm *= 2;
    while (bpm > FOLD_HIGH) bpm /= 2;
    return Math.round(bpm);
  }
}
