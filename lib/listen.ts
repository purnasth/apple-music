export type Hearing = {
  /** 1 on an onset (a hit, a strum, a sung attack), easing back to 0. */
  pulse: number;
  /** Where the sound's energy sits, dark/warm 0 to bright/airy 1. */
  bright: number;
};

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Exponential smoothing that behaves the same at any frame rate. */
const ease = (from: number, to: number, dt: number, tau: number) =>
  from + (to - from) * (1 - Math.exp(-dt / tau));

/** Beats and brightness from analyser frames: `freq` is getByteFrequencyData, `dt` seconds since the last frame. */
export function createListener() {
  let lowAvg = 0;
  let fullAvg = 0;
  let sinceHit = 1;
  let pulse = 0;
  let bright = 0.1;
  let warm = 0;

  return (freq: Uint8Array, dt: number): Hearing => {
    dt = Math.min(Math.max(dt, 1e-3), 0.1);
    const n = Math.min(freq.length, 200);

    // Bytes are decibels over a 70 dB range; the sums need real energy.
    let low = 0;
    let full = 0;
    let centre = 0;
    for (let i = 1; i < n; i++) {
      const e = 10 ** ((freq[i] / 255) * 3.5);
      if (i <= 6) low += e;
      full += e;
      centre += e * i;
    }

    // Summed bands, not single bins: per-bin flux flickers and fires at a
    // steady rate on any music.
    const onset =
      warm > 0.5 &&
      sinceHit > 0.22 &&
      (low > lowAvg * 1.6 || full > fullAvg * 1.4);
    lowAvg = warm ? ease(lowAvg, low, dt, 1) : low;
    fullAvg = warm ? ease(fullAvg, full, dt, 1) : full;
    warm += dt;
    sinceHit = onset ? 0 : sinceHit + dt;
    pulse = onset ? 1 : pulse * Math.exp(-dt / 0.22);

    if (full > n) bright = ease(bright, centre / full / n, dt, 1.5);

    return { pulse, bright: clamp01((bright - 0.12) / 0.14) };
  };
}

type Pcm = {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
};

/** Loudness (RMS, channels mixed) per 1/`rate` of a second of decoded audio. */
export function envelope(buf: Pcm, rate: number): Float32Array {
  const size = Math.max(1, Math.floor(buf.sampleRate / rate));
  const out = new Float32Array(Math.ceil(buf.length / size));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) =>
    buf.getChannelData(c),
  );
  for (let o = 0; o < out.length; o++) {
    let sq = 0;
    const end = Math.min((o + 1) * size, buf.length);
    for (let i = o * size; i < end; i++) {
      let v = 0;
      for (const ch of chans) v += ch[i];
      v /= chans.length;
      sq += v * v;
    }
    out[o] = Math.sqrt(sq / (end - o * size));
  }
  return out;
}

/** An envelope as heights (0.08–1) against its own 95th percentile, with contrast. */
export function heightsOf(env: Float32Array): Float32Array {
  const sorted = [...env].sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.95)] || 1;
  return env.map((v) => 0.08 + 0.92 * Math.min(v / top, 1) ** 1.4);
}
