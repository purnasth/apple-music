import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLrc, lineAt, progress } from "./lyrics.ts";

test("parseLrc reads stamps, expands repeated ones, sorts, skips junk", () => {
  const lines = parseLrc(
    "[ti:x]\n[00:15.55] second\n[00:11.20] first\n[01:00.00][00:30.5] chorus\n\nplain",
  );
  assert.deepEqual(lines, [
    { t: 11.2, text: "first" },
    { t: 15.55, text: "second" },
    { t: 30.5, text: "chorus" },
    { t: 60, text: "chorus" },
  ]);
  assert.equal(lineAt(lines, 0), -1);
  assert.equal(lineAt(lines, 11.2), 0);
  assert.equal(lineAt(lines, 29), 1);
  assert.equal(lineAt(lines, 999), 3);
});

test("parseLrc strips enhanced word stamps", () => {
  assert.deepEqual(parseLrc("[00:01.00] <00:01.00>Hello <00:01.50>world"), [
    { t: 1, text: "Hello world" },
  ]);
});

test("progress paces sung lines and spans instrumental gaps", () => {
  const lines = [
    { t: 10, text: "abcdefghijklmnopqrst" }, // 20 chars -> 1.5s sweep
    { t: 20, text: "" }, // gap of 10s
    { t: 30, text: "x" }, // last line, 1s floor
  ];
  assert.equal(progress(lines, 0, 9), 0);
  assert.equal(progress(lines, 0, 10.75), 0.5);
  assert.equal(progress(lines, 0, 15), 1); // holds full through the silence
  assert.equal(progress(lines, 1, 25), 0.5);
  assert.equal(progress(lines, 2, 30.5), 0.5);
  assert.equal(progress(lines, 9, 30), 0);
  // binary search agrees with a linear scan everywhere
  for (let t = 0; t < 40; t += 0.5) {
    let lin = -1;
    while (lin + 1 < lines.length && lines[lin + 1].t <= t) lin++;
    assert.equal(lineAt(lines, t), lin);
  }
});
