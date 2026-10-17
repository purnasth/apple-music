import { test } from "node:test";
import assert from "node:assert/strict";
import { moodsOf, wordsOf, type Heard } from "./mood.ts";

test("reads sad and love words in Latin and Devanagari", () => {
  assert.ok(wordsOf("timro yaad le runu").sad > 0);
  assert.ok(wordsOf("तिम्रो याद आँसु").sad > 0);
  assert.ok(wordsOf("मेरो माया").love > 0);
  assert.equal(wordsOf("the sky is blue").sad, 0);
});

test("sorts songs by what Essentia heard and their words", () => {
  const calm: Heard = { happy: 0.5, sad: 0.5, relaxed: 0.8, aggressive: 0.05, party: 0.1, danceable: 0.3 };
  const songs = [
    ...Array.from({ length: 6 }, (_, i) => ({ heard: { ...calm, party: 0.1 + i / 50 } })),
    { heard: { happy: 0.9, sad: 0.1, relaxed: 0.1, aggressive: 0.5, party: 0.95, danceable: 0.95 } },
    { heard: { ...calm, happy: 0.1, sad: 0.95 } },
    { heard: calm, lyrics: "maya maya timi bina, mero maya" },
  ];
  const moods = moodsOf(songs);
  assert.equal(moods[6], "Energetic");
  assert.equal(moods[7], "Sad");
  assert.equal(moods[8], "Romantic");
  assert.equal(moods[0], "Chill");
});
