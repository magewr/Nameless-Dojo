// 입체 멀티레이어 동양 검극 × 32비트 아케이드 Web Audio 프로시저럴 사운드 엔진
// - 마스터 DynamicsCompressor + 도장 공간 Convolver Reverb + StereoPanner(좌/우 위치감)
// - 다층 합성(서브베이스 충격 + 필터드 노이즈 + 비정수 금속 배음 + 5원소 시그니처 음향)

export interface SoundOpts {
  pan?: number; // -1 (좌) ~ +1 (우)
  unarmed?: boolean;
  tier?: number; // 1 ~ 4
  element?: string;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private softClipCurve: Float32Array<ArrayBuffer> | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // 마스터 컴프레서 (여러 효과음이 겹쳐도 찌그러지지 않고 묵직하게 응축)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-14, ctx.currentTime);
      comp.knee.setValueAtTime(18, ctx.currentTime);
      comp.ratio.setValueAtTime(6, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.14, ctx.currentTime);

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.88, ctx.currentTime);

      comp.connect(master);
      master.connect(ctx.destination);
      this.compressor = comp;
      this.masterGain = master;

      // 목조 도장 / 야외 연무장 공간감을 만드는 프로시저럴 스테레오 리버브 (0.48초)
      const revDur = 0.48;
      const revLen = Math.floor(ctx.sampleRate * revDur);
      const revBuf = ctx.createBuffer(2, revLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = revBuf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < revLen; i++) {
          const t = i / revLen;
          // 초기 반사음(Early reflections) + 부드러운 지수 감쇠
          const env = Math.pow(1 - t, 2.6) * (i < revLen * 0.06 ? 1.15 : 0.72);
          const white = Math.random() * 2 - 1;
          lp = lp * 0.65 + white * 0.35; // 따뜻한 목조 잔향 로우패스
          d[i] = lp * env;
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = revBuf;

      const revGain = ctx.createGain();
      revGain.gain.setValueAtTime(0.32, ctx.currentTime);
      convolver.connect(revGain);
      revGain.connect(comp);
      this.reverbNode = convolver;
      this.reverbSend = revGain;

      // 공용 1.5초 화이트 노이즈 버퍼 (매 호출마다 버퍼 생성 비용 제거)
      const nLen = Math.floor(ctx.sampleRate * 1.5);
      const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuffer = nBuf;

      // 소프트 새츄레이션 커브 (타격감·금속 파열에 따뜻한 아날로그 질감)
      const curve = new Float32Array(new ArrayBuffer(256 * 4));
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = ((Math.PI + 3.2) * x) / (Math.PI + 3.2 * Math.abs(x));
      }
      this.softClipCurve = curve;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // 스테레오 패닝 + Dry/Wet 리버브 라우팅 헬퍼
  private createVoiceBus(ctx: AudioContext, pan = 0, wetAmount = 0.22): GainNode {
    const input = ctx.createGain();
    const clampedPan = Math.max(-0.85, Math.min(0.85, pan));
    let outNode: AudioNode = input;

    if (typeof ctx.createStereoPanner === 'function' && Math.abs(clampedPan) > 0.01) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clampedPan, ctx.currentTime);
      input.connect(panner);
      outNode = panner;
    }

    outNode.connect(this.compressor || ctx.destination);
    if (this.reverbNode && wetAmount > 0.01) {
      const send = ctx.createGain();
      send.gain.setValueAtTime(wetAmount, ctx.currentTime);
      outNode.connect(send);
      send.connect(this.reverbNode);
    }
    return input;
  }

  private createNoiseSource(ctx: AudioContext, offsetSec = 0): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const randStart = Math.random() * 0.8;
    src.start(ctx.currentTime + offsetSec, randStart);
    return src;
  }

  // ── UI / 도장 일상 효과음 ──
  public playStep() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, (Math.random() - 0.5) * 0.2, 0.08);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(105 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.05);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playBlip() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, 0, 0.06);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440 + Math.random() * 55, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.032, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, 0, 0.08);
    // 목탁/목판 클릭 느낌의 따뜻한 우드블록 2음
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.028);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // 동양 5음계(궁·상·각·치·우) 영웅 팡파르!
  public playLevelUp() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, 0, 0.42);
    const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      const t = now + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, t);
      const harm = ctx.createOscillator();
      harm.type = 'sine';
      harm.frequency.setValueAtTime(n * 2, t);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(i === notes.length - 1 ? 0.13 : 0.09, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + (i === notes.length - 1 ? 0.55 : 0.24));

      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.035, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(g);
      harm.connect(hg);
      hg.connect(g);
      g.connect(bus);
      osc.start(t);
      harm.start(t);
      osc.stop(t + 0.58);
      harm.stop(t + 0.24);
    });
  }

  // 동양 대북(태고) — 가죽 어택 + 나무통 공명 + 공간 잔향
  public playDrum(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.45);

    // 1) 저역 가죽 막 울림
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, now);
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.28);
    const bodyG = ctx.createGain();
    bodyG.gain.setValueAtTime(0.36, now);
    bodyG.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(bodyG);
    bodyG.connect(bus);
    osc.start(now);
    osc.stop(now + 0.44);

    // 2) 북채 타격 스냅 노이즈
    const snap = this.createNoiseSource(ctx);
    const snapFilter = ctx.createBiquadFilter();
    snapFilter.type = 'bandpass';
    snapFilter.frequency.setValueAtTime(520, now);
    snapFilter.Q.setValueAtTime(1.4, now);
    const snapG = ctx.createGain();
    snapG.gain.setValueAtTime(0.18, now);
    snapG.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    snap.connect(snapFilter);
    snapFilter.connect(snapG);
    snapG.connect(bus);
    snap.stop(now + 0.055);
  }

  // ── 전투 입체 효과음 ──

  // 발도음: 칼집 마찰 스르릉 + 끝자락 쇠 튕김 "챙!"
  public playUnsheathe(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.35);

    // 1) 칼집 스치는 쇳소리 노이즈 스윕
    const n = this.createNoiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now);
    bp.frequency.exponentialRampToValueAtTime(5600, now + 0.14);
    bp.Q.setValueAtTime(5.5, now);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, now);
    ng.gain.linearRampToValueAtTime(0.14, now + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    n.stop(now + 0.18);

    // 2) 칼끝이 빠져나오며 울리는 금속 배음
    [2950, 4480].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(f * 1.04, now + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055 / (idx + 1), now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(g);
      g.connect(bus);
      osc.start(now + 0.04);
      osc.stop(now + 0.26);
    });
  }

  // 도약·허공보법: 바람을 가르며 치고 나가는 2층 풍압
  public playDash(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.18);

    const n = this.createNoiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, now);
    bp.frequency.exponentialRampToValueAtTime(420, now + 0.13);
    bp.Q.setValueAtTime(1.2, now);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    n.stop(now + 0.15);

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(115, now);
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.06);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.09, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    thud.connect(tg);
    tg.connect(bus);
    thud.start(now);
    thud.stop(now + 0.08);
  }

  // 참격 / 권풍 스윙: 고역 칼날 파공 + 저역 풍압 + (도검일 때) 날카로운 강철 휘파람
  public playSlash(heavy = false, opts: SoundOpts = {}) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pan = opts.pan ?? 0;
    const unarmed = Boolean(opts.unarmed);
    const tier = opts.tier ?? (heavy ? 3 : 1);
    const dur = heavy ? 0.24 : 0.14;
    const bus = this.createVoiceBus(ctx, pan, heavy ? 0.34 : 0.18);

    // 1) 칼바람/풍압 메인 스윕
    const n1 = this.createNoiseSource(ctx);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.setValueAtTime(heavy ? 2.0 : 1.5, now);
    f1.frequency.setValueAtTime(unarmed ? 560 : heavy ? 2200 : 2800, now);
    f1.frequency.exponentialRampToValueAtTime(unarmed ? 140 : heavy ? 240 : 420, now + dur);

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.001, now);
    g1.gain.linearRampToValueAtTime(heavy ? 0.32 : 0.22, now + 0.018);
    g1.gain.exponentialRampToValueAtTime(0.001, now + dur);
    n1.connect(f1);
    f1.connect(g1);
    g1.connect(bus);
    n1.stop(now + dur + 0.02);

    // 2) 저역 공기 파열 펀치 (중량감)
    const airOsc = ctx.createOscillator();
    airOsc.type = 'triangle';
    airOsc.frequency.setValueAtTime(heavy ? 210 : 165, now);
    airOsc.frequency.exponentialRampToValueAtTime(52, now + dur * 0.7);
    const airG = ctx.createGain();
    airG.gain.setValueAtTime(heavy ? 0.16 : 0.08, now);
    airG.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.75);
    airOsc.connect(airG);
    airG.connect(bus);
    airOsc.start(now);
    airOsc.stop(now + dur * 0.8);

    // 3) 도검 고티어 강철 파공 휘파람
    if (!unarmed && (heavy || tier >= 2)) {
      const whistle = ctx.createOscillator();
      whistle.type = 'sine';
      whistle.frequency.setValueAtTime(2600 + tier * 240, now);
      whistle.frequency.exponentialRampToValueAtTime(880, now + dur * 0.85);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.055, now);
      wg.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.9);
      whistle.connect(wg);
      wg.connect(bus);
      whistle.start(now);
      whistle.stop(now + dur);
    }
  }

  // 타격음: 서브베이스 펀치 + 어택 크랙 + 소프트 클리핑 + 베임/강타 배음!
  public playHit(critical = false, opts: SoundOpts = {}) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pan = opts.pan ?? 0;
    const unarmed = Boolean(opts.unarmed);
    const tier = opts.tier ?? (critical ? 3 : 1);
    const bus = this.createVoiceBus(ctx, pan, critical ? 0.38 : 0.2);

    // 1) 가슴을 울리는 서브베이스 임팩트
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(critical ? 175 : 135, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + (critical ? 0.2 : 0.13));
    const shaper = ctx.createWaveShaper();
    if (this.softClipCurve) shaper.curve = this.softClipCurve;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(critical ? 0.36 : 0.24, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + (critical ? 0.22 : 0.14));
    sub.connect(shaper);
    shaper.connect(subG);
    subG.connect(bus);
    sub.start(now);
    sub.stop(now + 0.24);

    // 2) 순간 타격 크랙(퍽!/촥!)
    const crack = this.createNoiseSource(ctx);
    const cf = ctx.createBiquadFilter();
    cf.type = unarmed ? 'lowpass' : 'bandpass';
    cf.frequency.setValueAtTime(unarmed ? 680 : critical ? 2400 : 1650, now);
    cf.Q.setValueAtTime(unarmed ? 0.9 : 1.6, now);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(critical ? 0.32 : 0.22, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + (critical ? 0.12 : 0.075));
    crack.connect(cf);
    cf.connect(cg);
    cg.connect(bus);
    crack.stop(now + 0.13);

    // 3) 치명타/고티어 강철 파열음
    if (critical || tier >= 3) {
      const ringFreqs = unarmed ? [310, 465] : [1320, 2180];
      ringFreqs.forEach((rf, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(rf, now);
        osc.frequency.exponentialRampToValueAtTime(rf * 0.72, now + 0.18);
        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.08 / (i + 1), now);
        rg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(rg);
        rg.connect(bus);
        osc.start(now);
        osc.stop(now + 0.22);
      });
    }
  }

  // 세키로급 강철 패링 "카아아앙~!" — 5중 비정수 금속 공명 + 순간 쇠충돌 크랙 + 연환 음정 상승!
  public playParry(justParry = false, chain = 0, pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitchMult = 1 + Math.min(6, chain) * 0.11;
    const bus = this.createVoiceBus(ctx, pan, justParry ? 0.52 : 0.28);

    // 1) 칼날 충돌 14ms 금속 스파크 크랙
    const spark = this.createNoiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3200, now);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(justParry ? 0.28 : 0.16, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    spark.connect(hp);
    hp.connect(sg);
    sg.connect(bus);
    spark.stop(now + 0.04);

    // 2) 비정수 강철 배음(Inharmonic Metallic Partials) — 진짜 일본도/환도가 울리는 질감!
    const base = (justParry ? 1180 : 860) * pitchMult;
    const ratios = justParry ? [1.0, 1.52, 2.31, 3.17, 4.45] : [1.0, 1.58, 2.42];
    const ringDur = justParry ? 0.56 + Math.min(4, chain) * 0.05 : 0.2;

    ratios.forEach((ratio, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      const f = base * ratio;
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.985, now + ringDur);

      const g = ctx.createGain();
      const amp = (justParry ? 0.16 : 0.1) / (1 + idx * 0.55);
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + ringDur * (1 - idx * 0.12));

      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + ringDur + 0.02);
    });

    // 3) 정밀 간파(Just Parry)일 때 하단에 묵직한 기세 충격파 추가!
    if (justParry) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(160 * (1 + Math.min(4, chain) * 0.05), now);
      sub.frequency.exponentialRampToValueAtTime(46, now + 0.18);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(0.24, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      sub.connect(subG);
      subG.connect(bus);
      sub.start(now);
      sub.stop(now + 0.22);
    }
  }

  // 간파 반격 작렬 — 대북 타격 + 강철 파열 + 저음 충격파
  public playCounterImpact(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.5);

    // 1) 서브베이스 드롭
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(150, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.36);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.4, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    sub.connect(subG);
    subG.connect(bus);
    sub.start(now);
    sub.stop(now + 0.42);

    // 2) 강철 일섬 3중 공명
    [1560, 2380, 3620].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'sine';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4200, now);
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.42);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(lp);
      lp.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + 0.47);
    });

    // 3) 폭발 파열 노이즈
    const n = this.createNoiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, now);
    bp.frequency.exponentialRampToValueAtTime(280, now + 0.22);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    n.stop(now + 0.26);
  }

  // 체세 붕괴(Guard Break) — 방패/자세가 쩍 갈라지며 무너지는 파열음
  public playGuardBreak(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.45);

    // 1) 파편 산산조각 크랙 3연타
    [0, 0.035, 0.075].forEach((delay, idx) => {
      const n = this.createNoiseSource(ctx, delay);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2800 - idx * 550, now + delay);
      hp.Q.setValueAtTime(2.5, now + delay);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 - idx * 0.04, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.09);
      n.connect(hp);
      hp.connect(g);
      g.connect(bus);
      n.stop(now + delay + 0.1);
    });

    // 2) 저음 붕괴 드롭
    const drop = ctx.createOscillator();
    drop.type = 'sawtooth';
    drop.frequency.setValueAtTime(180, now);
    drop.frequency.exponentialRampToValueAtTime(38, now + 0.34);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(480, now);
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.26, now);
    dg.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    drop.connect(lp);
    lp.connect(dg);
    dg.connect(bus);
    drop.start(now);
    drop.stop(now + 0.38);
  }

  // 극의 발동 타임 슬로우 — 공기가 빨려 들어가며 시간이 느려지는 "부우웅—"
  public playTimeSlow() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, 0, 0.48);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.44);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.26, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    osc.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + 0.48);

    // 공기 흡입 필터 스윕
    const n = this.createNoiseSource(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(140, now + 0.42);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.14, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(bus);
    n.stop(now + 0.45);
  }

  // 9연참 암전 일섬 납도 "찰칵… 콰아앙!!"
  public playDarkSlashFinish(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.55);

    // 1) 납도 "찰칵!"
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(4200, now);
    clickOsc.frequency.exponentialRampToValueAtTime(1900, now + 0.045);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.18, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    clickOsc.connect(cg);
    cg.connect(bus);
    clickOsc.start(now);
    clickOsc.stop(now + 0.06);

    // 2) 0.11초 정적 뒤 초대형 폭발 결착!
    const t = now + 0.11;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(130, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.55);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.45, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    sub.connect(sg);
    sg.connect(bus);
    sub.start(t);
    sub.stop(t + 0.62);

    const boom = this.createNoiseSource(ctx, 0.11);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.48);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.34, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
    boom.connect(lp);
    lp.connect(bg);
    bg.connect(bus);
    boom.stop(t + 0.54);
  }

  // KO 최후의 일격 — 동양 범종/동라 공명 + 묵직한 결착 충격파
  public playKoFinisher(pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.62);

    // 대북 + 서브 드롭
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.65);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.44, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    sub.connect(sg);
    sg.connect(bus);
    sub.start(now);
    sub.stop(now + 0.74);

    // 동양 징(동라) 장엄한 배음 잔향
    [220, 329, 494, 698].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.98, now + 0.95);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 1.0);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + 1.05);
    });
  }

  // 5원소 시그니처 마법·기공 사운드 (FIRE / LIGHTNING / ICE / SHADOW / QI)
  public playMagic(element: string, pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bus = this.createVoiceBus(ctx, pan, 0.48);

    if (element === 'FIRE') {
      // 화염 폭발: 로우패스 화르륵 굉음 + 저음 럼블
      const n = this.createNoiseSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.Q.setValueAtTime(0.8, now);
      lp.frequency.setValueAtTime(980, now);
      lp.frequency.exponentialRampToValueAtTime(160, now + 0.44);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.36, now + 0.035);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(bus);
      n.stop(now + 0.48);

      const rumble = ctx.createOscillator();
      rumble.type = 'sawtooth';
      rumble.frequency.setValueAtTime(95, now);
      rumble.frequency.exponentialRampToValueAtTime(38, now + 0.36);
      const rlp = ctx.createBiquadFilter();
      rlp.type = 'lowpass';
      rlp.frequency.setValueAtTime(220, now);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.22, now);
      rg.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      rumble.connect(rlp);
      rlp.connect(rg);
      rg.connect(bus);
      rumble.start(now);
      rumble.stop(now + 0.4);
      return;
    }

    if (element === 'LIGHTNING') {
      // 천뢰: 날카로운 전격 파열(짜지직!) + 천둥 저음 잔향(우르릉!)
      const zap = this.createNoiseSource(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2200, now);
      const zg = ctx.createGain();
      zg.gain.setValueAtTime(0.34, now);
      zg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      zap.connect(hp);
      hp.connect(zg);
      zg.connect(bus);
      zap.stop(now + 0.16);

      const arc = ctx.createOscillator();
      arc.type = 'sawtooth';
      arc.frequency.setValueAtTime(1450, now);
      arc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.16, now);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      arc.connect(ag);
      ag.connect(bus);
      arc.start(now);
      arc.stop(now + 0.24);

      // 지연 천둥 울림
      const thunder = this.createNoiseSource(ctx, 0.06);
      const tlp = ctx.createBiquadFilter();
      tlp.type = 'lowpass';
      tlp.frequency.setValueAtTime(320, now + 0.06);
      tlp.frequency.exponentialRampToValueAtTime(85, now + 0.52);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.28, now + 0.06);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
      thunder.connect(tlp);
      tlp.connect(tg);
      tg.connect(bus);
      thunder.stop(now + 0.58);
      return;
    }

    if (element === 'ICE') {
      // 빙결: 맑은 수정 결정 아르페지오 + 서리 파쇄 노이즈
      [1975, 2637, 3520, 4186].forEach((f, idx) => {
        const t = now + idx * 0.028;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.1 / (1 + idx * 0.2), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        osc.connect(g);
        g.connect(bus);
        osc.start(t);
        osc.stop(t + 0.36);
      });
      const frost = this.createNoiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(4200, now);
      bp.Q.setValueAtTime(2.5, now);
      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0.14, now);
      fg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      frost.connect(bp);
      bp.connect(fg);
      fg.connect(bus);
      frost.stop(now + 0.26);
      return;
    }

    if (element === 'SHADOW') {
      // 암영·금기: 공간 왜곡 불협화음 드론 + 저역 소용돌이
      [146, 155, 293].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 2 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.62, now + 0.45);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(920, now);
        lp.frequency.exponentialRampToValueAtTime(180, now + 0.45);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(lp);
        lp.connect(g);
        g.connect(bus);
        osc.start(now);
        osc.stop(now + 0.5);
      });
      return;
    }

    // QI (내공·강기): 맑은 동양 징 + 기운 파동 스윕
    [392, 587.33, 783.99].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, now + 0.32);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }
}

export const sound = new SoundEngine();
