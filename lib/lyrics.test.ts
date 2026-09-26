import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLrc, lineAt, progress, wordAt, readable, devanagari } from "./lyrics.ts";

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

test("wordAt finds the sung word and its fill", () => {
  const line = { t: 10, text: "so long goodbye", w: [10, 10.5, 12], e: 13 };
  assert.deepEqual(wordAt(line, 9.9), { k: -1, p: 0 });
  const a = wordAt(line, 10.16); // 2 chars -> 0.32s
  assert.equal(a.k, 0);
  assert.ok(Math.abs(a.p - 0.5) < 1e-9);
  assert.equal(wordAt(line, 11.9).k, 1);
  assert.equal(wordAt(line, 11.9).p, 1); // "long" filled at singing pace, then held
  const b = wordAt(line, 12.5); // capped by the line end at 13
  assert.equal(b.k, 2);
  assert.ok(Math.abs(b.p - 0.5) < 1e-9);
  assert.deepEqual(wordAt({ t: 0, text: "x" }, 5), { k: -1, p: 0 });
});

test("readable prefers any script over Urdu, and falls back to Urdu in Devanagari", () => {
  const urdu = "چل دیے تم کہاں";
  assert.equal(readable(urdu, "Chal diye tum kahan"), "Chal diye tum kahan");
  assert.equal(readable(null, urdu, "तुम कहाँ"), "तुम कहाँ");
  assert.equal(readable(null, urdu), "चल दिए तुम कहाँ");
  assert.equal(readable(null, undefined), null);
});

test("devanagari converts Urdu and leaves LRC stamps alone", () => {
  assert.equal(
    devanagari("[00:12.34] پتا نہیں چلا، ہم بدل گئے"),
    "[00:12.34] पता नहीं चला, हम बदल गए",
  );
  assert.equal(devanagari("یہ باتیں اور راتیں؟"), "ये बातें और रातें?");
  assert.equal(devanagari("کیا پیار"), "क्या प्यार", "a medial ye before a vowel joins");
  assert.equal(devanagari("دکھ بہہ"), "दख बह", "aspirates join; a doubled he is one");
  assert.equal(devanagari("Latin stays"), "Latin stays");
  // Timings are per word, so conversion must never split or join words.
  const line = "دلِ بے‌چین، تیرے لیے؟ ہم";
  assert.equal(devanagari(line).split(" ").length, line.split(" ").length);
});
