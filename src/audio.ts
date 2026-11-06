type Ctx = AudioContext;

const SAMPLE_FILES: Record<string, string> = {
  foot_grass: '/audio/foot_grass.mp3',
  foot_dirt: '/audio/foot_dirt.mp3',
  water_splash: '/audio/water_splash.mp3',
  wood_chop: '/audio/wood_chop.mp3',
  wood_break: '/audio/wood_break.mp3',
  stone_hit: '/audio/stone_hit.mp3',
  stone_break: '/audio/stone_break.mp3',
  whoosh: '/audio/whoosh.mp3',
  flesh_hit: '/audio/flesh_hit.mp3',
  pain_grunt: '/audio/pain_grunt.mp3',
  zombie_growl1: '/audio/zombie_growl1.mp3',
  zombie_growl2: '/audio/zombie_growl2.mp3',
  zombie_scream: '/audio/zombie_scream.mp3',
  zombie_death: '/audio/zombie_death.mp3',
  zombie_crowd: '/audio/zombie_crowd.mp3',
  gunshot: '/audio/gunshot.mp3',
  rifle_shot: '/audio/rifle_shot.mp3',
  bow_release: '/audio/bow_release.mp3',
  arrow_hit: '/audio/arrow_hit.mp3',
  wind_day: '/audio/wind_day.mp3',
  wind_night: '/audio/wind_night.mp3',
  crickets: '/audio/crickets.mp3',
  heartbeat: '/audio/heartbeat.mp3',
  ui_click: '/audio/ui_click.mp3',
  cloth: '/audio/cloth.mp3',
};

export class SoundSystem {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;
  private lastFootstep = 0;
  private samples = new Map<string, AudioBuffer>();
  private samplesLoading: Promise<void> | null = null;
  private ambientWindDay: GainNode | null = null;
  private ambientWindNight: GainNode | null = null;
  private ambientCrickets: GainNode | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * this.volume * 0.85;
    this.master.connect(this.ctx.destination);
    this.createNoise();
    void this.loadSamples();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume * this.volume * 0.85;
  }

  private async loadSamples() {
    if (!this.ctx || this.samplesLoading) return;
    this.samplesLoading = (async () => {
      await Promise.all(Object.entries(SAMPLE_FILES).map(async ([id, file]) => {
        try {
          const res = await fetch(file);
          if (!res.ok) return;
          const data = await res.arrayBuffer();
          const buffer = await this.ctx!.decodeAudioData(data);
          this.samples.set(id, buffer);
        } catch (err) {
          console.warn('audio sample failed', file, err);
        }
      }));
      this.startAmbient();
    })();
    await this.samplesLoading;
  }

  private startAmbient() {
    if (!this.ctx || !this.master) return;
    const loop = (id: string, volume: number): GainNode | null => {
      const buffer = this.samples.get(id);
      if (!buffer) return null;
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = this.ctx!.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.master!);
      src.start();
      return gain;
    };
    this.ambientWindDay = loop('wind_day', 0.016);
    this.ambientWindNight = loop('wind_night', 0);
    this.ambientCrickets = loop('crickets', 0);
  }

  setAmbience(darkness: number) {
    if (!this.ctx) return;
    const night = Math.max(0, Math.min(1, (darkness - 0.2) / 0.55));
    const t = this.ctx.currentTime;
    this.ambientWindDay?.gain.setTargetAtTime(0.016 * (1 - night), t, 0.8);
    this.ambientWindNight?.gain.setTargetAtTime(0.02 * night, t, 0.8);
    this.ambientCrickets?.gain.setTargetAtTime(0.09 * Math.max(0, Math.min(1, (darkness - 0.35) / 0.4)), t, 1.2);
  }

  private playSample(
    id: string,
    volume = 0.35,
    rate = 1,
    duration?: number,
    offset = 0,
  ): boolean {
    if (!this.ctx || !this.master) return false;
    const buffer = this.samples.get(id);
    if (!buffer) return false;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(0.55, rate * (0.95 + Math.random() * 0.1));
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.012);
    const playDuration = duration ?? Math.min(buffer.duration, 2.4);
    gain.gain.setValueAtTime(Math.max(0.0002, volume), t + Math.max(0.02, playDuration - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + playDuration);
    src.connect(gain).connect(this.master);
    const startOffset = Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 0.05));
    src.start(t, startOffset, playDuration);
    return true;
  }


  private createNoise() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2 + white * 0.2;
    }
    this.noiseBuffer = buffer;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noise(duration: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass', rate = 1) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', endFreq?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  dig(material: string) {
    if (material === 'wood' || material === 'leaves') {
      if (this.playSample('wood_chop', 0.3, 1, 0.42)) return;
    } else if (material === 'stone' || material === 'ore' || material === 'metal' || material === 'glass') {
      if (this.playSample('stone_hit', 0.3, 1.05, 0.4)) return;
    } else {
      if (this.playSample('foot_dirt', 0.24, 1.15, 0.3)) return;
    }
    const rate = material === 'stone' ? 1.6 : material === 'wood' ? 1.1 : 0.9;
    this.noise(0.09, material === 'stone' ? 1400 : 700, 1.2, 0.08, 'bandpass', rate);
    this.tone(material === 'stone' ? 160 : 110, 0.07, 0.035, 'sine', 60);
  }

  breakBlock(material: string) {
    if (material === 'wood' || material === 'leaves') {
      if (this.playSample('wood_break', 0.38, 1, 0.8)) return;
    } else if (this.playSample('stone_break', 0.36, 0.95, 0.8)) return;
    const rate = material === 'stone' ? 1.5 : material === 'wood' ? 1.1 : 0.8;
    this.noise(0.28, material === 'stone' ? 1200 : 620, 0.8, 0.17, 'lowpass', rate);
    this.tone(material === 'stone' ? 120 : 82, 0.16, 0.08, 'sine', 45);
  }

  place() {
    if (this.playSample('stone_hit', 0.2, 1.4, 0.22)) return;
    this.noise(0.09, 900, 1.5, 0.06, 'bandpass');
    this.tone(160, 0.06, 0.05, 'triangle', 90);
  }

  swing() {
    if (this.playSample('whoosh', 0.22, 1.2, 0.3)) return;
    this.noise(0.13, 1800, 0.7, 0.05, 'bandpass', 1.4);
  }

  hitFlesh() {
    if (this.playSample('flesh_hit', 0.44, 1, 0.4)) return;
    this.noise(0.13, 420, 0.9, 0.16, 'lowpass', 0.8);
    this.tone(72, 0.12, 0.11, 'sine', 42);
  }

  hurt() {
    if (this.playSample('pain_grunt', 0.5, 1, 0.32)) return;
    this.noise(0.24, 900, 0.7, 0.15, 'lowpass', 0.7);
    this.tone(90, 0.22, 0.09, 'sawtooth', 48);
  }

  groan() {
    if (this.playSample(Math.random() < 0.5 ? 'zombie_growl1' : 'zombie_growl2', 0.32, 1, 1.6)) return;
    if (!this.ctx || !this.master) return;
    const t = this.now();
    const pitch = 55 + Math.random() * 35;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.12);
    g.gain.setValueAtTime(0.055, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 3;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.linearRampToValueAtTime(pitch * 0.65, t + 1.05);
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(pitch * 1.5, t);
    osc2.frequency.linearRampToValueAtTime(pitch * 1.1, t + 1.0);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g).connect(this.master);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.15);
    osc2.stop(t + 1.15);
    this.noise(0.5, 520, 0.7, 0.025, 'bandpass', 0.6);
  }

  zombieDie() {
    if (this.playSample('zombie_death', 0.48, 1, 0.7)) return;
    this.tone(110, 0.5, 0.08, 'sawtooth', 38);
    this.noise(0.45, 500, 0.8, 0.09, 'lowpass', 0.7);
  }

  scream() {
    if (this.playSample('zombie_scream', 0.5, 1, 1.8)) return;
    if (!this.ctx || !this.master) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.65);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(filter).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.85);
    this.noise(0.7, 2400, 1.4, 0.025, 'bandpass', 0.7);
  }

  footstep(inWater: boolean) {
    const t = this.now();
    if (t - this.lastFootstep < 0.12) return;
    this.lastFootstep = t;
    if (inWater) {
      if (this.playSample('water_splash', 0.22, 1.35, 0.35)) return;
      this.noise(0.2, 1100, 0.7, 0.045, 'bandpass', 1.2);
    } else {
      if (this.playSample(Math.random() < 0.55 ? 'foot_grass' : 'foot_dirt', 0.3, 0.95, 0.3)) return;
      this.noise(0.07, 520, 1, 0.025, 'lowpass', 0.9);
    }
  }

  arrowHit() {
    this.playSample('arrow_hit', 0.35, 1, 0.45);
  }

  water() {
    this.playSample('water_splash', 0.18, 1.2, 0.5);
  }

  eat() {
    if (this.playSample('cloth', 0.16, 1, 0.3)) {
      this.tone(160, 0.08, 0.02, 'triangle', 110);
      return;
    }
    this.noise(0.18, 900, 1.5, 0.05, 'bandpass', 0.7);
    this.tone(160, 0.08, 0.025, 'triangle', 110);
  }

  drink() {
    if (this.playSample('water_splash', 0.24, 1.35, 0.5)) return;
    this.tone(420, 0.09, 0.03, 'sine', 300);
    setTimeout(() => this.tone(360, 0.12, 0.025, 'sine', 250), 120);
    this.noise(0.2, 600, 2, 0.025, 'bandpass', 0.8);
  }

  heal() {
    if (this.playSample('cloth', 0.2, 1.1, 0.4)) return;
    this.tone(520, 0.16, 0.03, 'sine');
    setTimeout(() => this.tone(660, 0.2, 0.025, 'sine'), 100);
  }

  gunshot() {
    if (this.playSample('gunshot', 0.65, 1, 1.2)) return;
    this.noise(0.2, 1800, 0.6, 0.3, 'lowpass', 1.6);
    this.tone(95, 0.18, 0.18, 'square', 38);
    setTimeout(() => this.noise(0.25, 900, 0.8, 0.08, 'lowpass', 1), 30);
  }

  rifle() {
    if (this.playSample('rifle_shot', 0.62, 1, 1.1)) return;
    if (this.playSample('gunshot', 0.7, 0.82, 1.2)) return;
    this.noise(0.26, 1500, 0.6, 0.34, 'lowpass', 1.3);
    this.tone(78, 0.24, 0.2, 'square', 30);
    setTimeout(() => this.noise(0.3, 800, 0.8, 0.09, 'lowpass', 0.9), 35);
  }

  bossRoar() {
    if (this.playSample('zombie_scream', 0.8, 0.55, 2.6)) return;
    this.tone(62, 0.9, 0.12, 'sawtooth', 32);
    this.noise(0.8, 300, 0.8, 0.08, 'lowpass', 0.6);
  }

  bossNova() {
    if (this.playSample('zombie_crowd', 0.65, 0.72, 2.2)) return;
    this.tone(58, 0.7, 0.14, 'sawtooth', 30);
    this.noise(0.5, 700, 0.9, 0.1, 'lowpass', 0.8);
  }

  bow() {
    if (this.playSample('bow_release', 0.48, 1, 0.55)) return;
    this.noise(0.1, 2400, 1.2, 0.06, 'bandpass', 1.5);
    this.tone(180, 0.12, 0.04, 'triangle', 110);
    setTimeout(() => this.noise(0.18, 1100, 1.4, 0.04, 'bandpass', 1.2), 40);
  }

  craft() {
    if (this.playSample('cloth', 0.18, 1, 0.4) && this.playSample('ui_click', 0.18, 1, 0.2)) return;
    this.tone(520, 0.09, 0.04, 'triangle');
    setTimeout(() => this.tone(780, 0.12, 0.035, 'triangle'), 70);
  }

  ui() {
    if (this.playSample('ui_click', 0.26, 1, 0.18)) return;
    this.tone(430, 0.05, 0.025, 'triangle');
  }

  cricket() {
    if (this.samples.has('crickets')) return;
    if (!this.ctx) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 3800 + Math.random() * 700;
      const start = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.007, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
      osc.connect(g).connect(this.master!);
      osc.start(start);
      osc.stop(start + 0.07);
    }
  }

  heartbeat() {
    if (this.playSample('heartbeat', 0.33, 1.05, 1.3, Math.random() * 4)) return;
    this.tone(50, 0.18, 0.12, 'sine', 35);
    setTimeout(() => this.tone(45, 0.14, 0.08, 'sine', 30), 190);
  }
}
