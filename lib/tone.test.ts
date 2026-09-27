import { test } from "node:test";
import assert from "node:assert/strict";
import { backdropDim, markTone, toneOf } from "./tone.ts";

const pixels = (...rgb: [number, number, number][]) =>
  rgb.flatMap(([r, g, b]) => [r, g, b, 255]);

test("toneOf reads luminance and the most vivid hue", () => {
  assert.deepEqual(toneOf(pixels([255, 0, 0])), {
    lum: 0.2126,
    hue: 0,
  });
  const t = toneOf(pixels([20, 20, 20], [0, 0, 255]));
  assert.equal(t.hue, 240);
});

test("toneOf leaves greyscale art without a hue", () => {
  assert.equal(toneOf(pixels([128, 128, 128], [200, 200, 200])).hue, null);
  assert.equal(toneOf([]).lum, null);
});

test("brighter covers get a darker backdrop and a dimmer mark", () => {
  assert.ok(backdropDim(0.9) > backdropDim(0.1));
  assert.equal(backdropDim(null), 0.45);
  assert.ok(markTone(0.9) < markTone(0.2));
  assert.equal(markTone(0.1), 1);
});
