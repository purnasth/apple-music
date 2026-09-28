import { test } from "node:test";
import assert from "node:assert/strict";
import { findLyrics, lyricDoc, skeleton } from "./find.ts";

test("skeleton meets Devanagari and each romanisation of it in the middle", () => {
  const deva = skeleton("हाँसेर नभुलाऊ न मलाई");
  for (const typed of ["haanser nabhulau na malai", "hasera nabhulaau na malaai", "Hanser Nabhulau Na Malai!"])
    assert.equal(skeleton(typed), deva, typed);
  // bh/b, th/t, ph/f, w/v/b, doubled letters and nasals all fold together.
  assert.equal(skeleton("भावना"), skeleton("bhawana"));
  assert.equal(skeleton("संसार"), skeleton("sansaar"));
  assert.equal(skeleton("फूल"), skeleton("phool"));
  assert.equal(skeleton("पढ़ना"), skeleton("padhna"));
});

test("findLyrics ranks exact hits first and matches across a line break", () => {
  const docs = [
    lyricDoc("nepali", "हाँसेर नभुलाऊ न मलाई\nगर्नलाई धेरै छ, अन्तमा जानै छ"),
    lyricDoc("english", "Some nights I stay up\ncashing in my bad luck"),
    lyricDoc("mention", "we sang haanser nabhulau na malai all night"),
  ];
  assert.deepEqual(findLyrics("haanser nabhulau", docs), [
    { id: "mention", line: "we sang haanser nabhulau na malai all night" },
    { id: "nepali", line: "हाँसेर नभुलाऊ न मलाई" },
  ]);
  assert.deepEqual(findLyrics("stay up cashing in", docs), [
    { id: "english", line: "Some nights I stay up cashing in my bad luck" },
  ]);
  // A phrase inside the second line of a pair shows that line, not both.
  assert.deepEqual(findLyrics("dherai chha antama", docs), [
    { id: "nepali", line: "गर्नलाई धेरै छ, अन्तमा जानै छ" },
  ]);
  // A single word is only matched exactly; by sound it would hit everything.
  assert.deepEqual(findLyrics("nights", docs), [{ id: "english", line: "Some nights I stay up" }]);
  assert.deepEqual(findLyrics("nites", docs), []);
});
