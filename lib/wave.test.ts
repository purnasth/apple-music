import { test } from "node:test";
import assert from "node:assert/strict";
import { loopPath, waveHeights, waveStops } from "./wave.ts";

test("the same song always draws the same wave", () => {
  assert.deepEqual(waveHeights("song-a", 32), waveHeights("song-a", 32));
  assert.notDeepEqual(waveHeights("song-a", 32), waveHeights("song-b", 32));
});

test("wave heights stay in the drawable 0.3–1 band", () => {
  for (const h of waveHeights("any", 200)) assert.ok(h >= 0.3 && h <= 1);
});

test("the loop path has one arc per height and starts at the shift", () => {
  const d = loopPath([1, 0.5, 0.8], 4, 20, 2);
  assert.ok(d.startsWith("M-2 10"));
  assert.equal(d.match(/A/g)?.length, 3);
});

test("greyscale art gets the neutral gradient", () => {
  assert.equal(waveStops(null)[2], "#ffffff");
  assert.match(waveStops(200)[1], /^hsl\(200 /);
});
