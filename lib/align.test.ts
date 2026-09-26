import { test } from "node:test";
import assert from "node:assert/strict";
import {
  align,
  heardWords,
  languageOf,
  similarity,
  skeleton,
  timeLines,
} from "./align.ts";

test("similarity crosses scripts and spellings", () => {
  assert.equal(skeleton("dekhoon"), skeleton("देखूँ"));
  assert.ok(similarity("tujhe", "तुझे") > 0.55);
  assert.ok(similarity("don't", "dont") > 0.8);
  assert.ok(similarity("night", "story") < 0.55);
});

test("heardWords joins sub-word tokens and drops markers", () => {
  const json = {
    transcription: [
      {
        tokens: [
          { text: "[_BEG_]", t_dtw: 0 },
          { text: " Don", t_dtw: 100 },
          { text: "'t", t_dtw: 110 },
          { text: " stop", t_dtw: 150 },
          { text: ".", t_dtw: 160 },
        ],
      },
    ],
  };
  assert.deepEqual(heardWords(json), [
    { text: "Don't", t: 1 },
    { text: "stop", t: 1.5 },
  ]);
});

test("align corrects the model clock and places words inside their lines", () => {
  const lines = [
    { t: 10, text: "hello there my friend" },
    { t: 14, text: "" },
    { t: 20, text: "hello there again" },
  ];
  // The model hears everything 1s late, mishears "friend", misses "again".
  const heard = [
    { text: "hello", t: 11 },
    { text: "there", t: 11.6 },
    { text: "my", t: 12.1 },
    { text: "fiend", t: 12.5 },
    { text: "hello", t: 21 },
    { text: "there", t: 21.8 },
  ];
  const r = align(lines, heard);
  assert.equal(r.offset, -1);
  assert.deepEqual(r.lines[0].w, [10, 10.6, 11.1, 11.5]);
  assert.equal(r.lines[1].w, undefined);
  const [h, t, a] = r.lines[2].w!;
  assert.equal(h, 20);
  assert.equal(t, 20.8);
  assert.ok(
    a > t && a < r.lines[2].e!,
    "unheard word is interpolated after its neighbour",
  );
  assert.ok(r.matched > 0.8);
});

test("timeLines times plain lyrics from where each line was heard", () => {
  const texts = [
    "hold me close",
    "never let go",
    "somewhere far away",
    "hold me close",
  ];
  // "never let go" is not heard; the chorus repeats; "hold" is missed once.
  const heard = [
    { text: "hold", t: 12 },
    { text: "me", t: 12.4 },
    { text: "close", t: 12.9 },
    { text: "somewhere", t: 20 },
    { text: "far", t: 20.6 },
    { text: "away", t: 21 },
    { text: "me", t: 30.3 },
    { text: "close", t: 30.8 },
  ];
  const lines = timeLines(texts, heard);
  assert.deepEqual(
    lines.map((l) => l.text),
    texts,
  );
  assert.equal(lines[0].t, 12);
  assert.equal(lines[2].t, 20);
  assert.ok(lines[1].t > 12 && lines[1].t < 20, "unheard line sits between");
  assert.equal(lines[3].t, 30, "a missed first word backs off by its lead");
  assert.equal(align(lines, heard).matched, 8 / 12);
  // A line heard sooner than the one before it could be sung is treated as unheard.
  const rushed = timeLines(["about you", "about you", "do you forget"], [
    { text: "about", t: 50 },
    { text: "about", t: 50.2 },
    { text: "do", t: 50.4 },
  ]);
  assert.deepEqual(
    rushed.map((l) => l.t),
    [50, 52.5, 55],
  );
  assert.deepEqual(timeLines(texts, []), []);
});

test("languageOf reads the lyric, not the intro", () => {
  assert.equal(
    languageOf([
      {
        text: "It seems to me that when I die these words will be written on my stone",
      },
    ]),
    "en",
  );
  assert.equal(
    languageOf([
      { text: "Tujhe dekhoon toh lagta hai dil jaise tham sa jaata hai" },
    ]),
    "hi",
  );
  // English that is light on the commonest words still reads as English.
  assert.equal(
    languageOf([
      {
        text: "Like a firefly Up in the night Alive and bright Chasing all shadows",
      },
    ]),
    "en",
  );
  assert.equal(
    languageOf([{ text: "बिस्तारै, बिस्तारै तिमी मेरो वरिपरि" }]),
    "hi",
  );
  assert.equal(
    languageOf([{ text: "ان سوالوں میں کب سے یوں پھنسا ہوں" }]),
    "ur",
  );
});
