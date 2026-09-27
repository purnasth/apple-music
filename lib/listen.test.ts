import { test } from "node:test";
import assert from "node:assert/strict";
import { createListener, envelope, heightsOf } from "./listen.ts";

/** Runs `seconds` of 60fps frames; `hitEvery` seconds a broadband attack lands. */
function run(seconds: number, hitEvery: number) {
  const hear = createListener();
  const freq = new Uint8Array(512);
  const hits: number[] = [];
  const pulses: number[] = [];
  let out = hear(freq, 1 / 60);
  for (let f = 0; f < seconds * 60; f++) {
    const t = f / 60;
    const onBeat = t % hitEvery < 1 / 60;
    freq.fill(onBeat ? 200 : 40);
    const before = out.pulse;
    out = hear(freq, 1 / 60);
    if (out.pulse === 1 && before < 1) hits.push(t);
    pulses.push(out.pulse);
  }
  return { hits, pulses, out };
}

test("listener fires on each attack and eases off between them", () => {
  const { hits, pulses } = run(6, 0.5);
  // Warm-up skips the first half second; after that every beat lands.
  assert.ok(hits.length >= 10, `expected ~11 onsets, got ${hits.length}`);
  for (let i = 1; i < hits.length; i++) {
    assert.ok(
      Math.abs(hits[i] - hits[i - 1] - 0.5) < 0.05,
      `uneven gap at ${hits[i]}`,
    );
  }
  // Between beats the flare fades well down.
  assert.ok(Math.min(...pulses.slice(-20)) < 0.4);
});

test("envelope follows loudness and heightsOf spreads quiet from loud", () => {
  const rate = 8000;
  // One second quiet, one second loud, as a stereo buffer.
  const ch = Float32Array.from(
    { length: rate * 2 },
    (_, i) => Math.sin(i / 5) * (i < rate ? 0.05 : 0.5),
  );
  const env = envelope(
    {
      numberOfChannels: 2,
      sampleRate: rate,
      length: ch.length,
      getChannelData: () => ch,
    },
    40,
  );
  assert.equal(env.length, 80);
  assert.ok(env[70] > env[10] * 5, `loud ${env[70]} vs quiet ${env[10]}`);
  const h = heightsOf(env);
  assert.ok(h[10] < 0.2 && h[70] > 0.9, `heights ${h[10]} / ${h[70]}`);
});
