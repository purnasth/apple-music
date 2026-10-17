import type { Mood } from "./music";

/** Essentia's 0–1 scores for a song (scripts/hear.mjs). */
export type Heard = {
  happy: number;
  sad: number;
  relaxed: number;
  aggressive: number;
  party: number;
  danceable: number;
};

// Latin stems take a word boundary; Devanagari ones can't (\b is ASCII-only) and match anywhere.
const words = (latin: string, deva: string) =>
  new RegExp(`\\b(${latin})\\w*|${deva}`, "gi");
const SAD = words(
  "aansu|ansu|runu|rona|roye|dard|dukh|bichhod|judai|yaad|tanha|akel|tadap|toot|alvida|cry|tears|alone|lonely|goodbye|hurt|pain|broken|sorry",
  "आँसु|आंसू|आँसू|रुन|रोए|रोया|दर्द|दुख|दुःख|पीडा|पीड़ा|बिछोड|बिछड़|जुदा|याद|तन्हा|अकेल|एक्लै|तड़प|टूट|बिर्स|भूल|अलविदा|विदा|छोड",
);
const LOVE = words(
  "maya|prem|pyaar|pyar|ishq|mohabbat|sanam|piya|love|darling|kiss|forever|together",
  "माया|प्रेम|प्रीति|प्यार|इश्क|मोहब्बत|सनम|पिया|मुटु|दिल|हजुर|सजना|साजन",
);
const JOY = words(
  "nach|naach|khushi|ramail|party|dance|happy|smile|sunshine|celebrat|fun|jump|yeah",
  "नाच|खुशी|खुसी|रमाइलो|हाँस|हँस|मस्ती|उत्सव|झूम",
);

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/** Sad, love and joy words per hundred words of a lyric sheet. */
export function wordsOf(lyrics: string) {
  const n = lyrics.split(/\s+/).filter(Boolean).length || 1;
  return {
    sad: (count(lyrics, SAD) * 100) / n,
    love: (count(lyrics, LOVE) * 100) / n,
    joy: (count(lyrics, JOY) * 100) / n,
  };
}

const rank = (vals: number[]) => {
  const sorted = [...vals].sort((a, b) => a - b);
  return vals.map((v) => sorted.indexOf(v) / Math.max(1, sorted.length - 1));
};

/**
 * Each song's mood. Energy and gloom are ranked against the rest of the library:
 * Essentia hears most ballads as sad, so only the saddest of them count.
 */
export function moodsOf(songs: { heard: Heard; lyrics?: string }[]): Mood[] {
  const energy = rank(
    songs.map(({ heard: h }) => h.party + h.aggressive + 0.5 * h.danceable - h.relaxed),
  );
  const gloom = rank(songs.map(({ heard: h }) => h.sad - h.happy));
  return songs.map(({ lyrics }, i) => {
    const e = energy[i];
    const w = lyrics ? wordsOf(lyrics) : { sad: 0, love: 0, joy: 0 };
    const g = gloom[i] + Math.max(-0.2, Math.min(0.2, (w.sad - w.joy) / 10));
    if (e > 0.82 && g < 0.85) return "Energetic";
    if (w.love > 1.5 && w.love > w.sad) return "Romantic";
    if (g > 0.75) return "Sad";
    return e > 0.5 ? "Happy" : "Chill";
  });
}
