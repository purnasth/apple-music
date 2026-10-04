import { test } from "node:test";
import assert from "node:assert/strict";
import { artistOf, cover, isoSecs } from "./youtube.ts";

test("isoSecs reads YouTube durations", () => {
  assert.equal(isoSecs("PT3M45S"), 225);
  assert.equal(isoSecs("PT1H2M3S"), 3723);
  assert.equal(isoSecs("PT59S"), 59);
  assert.equal(isoSecs("P0D"), 0);
});

test("artistOf strips channel decorations", () => {
  assert.equal(artistOf("Sajjan Raj Vaidya - Topic"), "Sajjan Raj Vaidya");
  assert.equal(artistOf("TaylorSwiftVEVO"), "TaylorSwift");
  assert.equal(artistOf("VEVO"), "VEVO");
});

test("cover zooms a non-16:9 video just enough to fill the frame", () => {
  assert.equal(cover(16 / 9), 1);
  assert.equal(cover(undefined), 1);
  assert.equal(cover(640 / 255).toFixed(2), "1.41"); // a 2.5:1 film, letterboxed
  assert.equal(cover(4 / 3).toFixed(2), "1.33"); // pillarboxed
});
