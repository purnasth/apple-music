import { test } from "node:test";
import assert from "node:assert/strict";
import { artistOf, isoSecs } from "./youtube.ts";

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
