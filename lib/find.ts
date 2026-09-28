// Lyric search that survives script and spelling. A Nepali or Hindi line is
// usually typed in Latin letters, each person spelling it their own way
// ("haanser", "hasera", "hanser"), so both sides are cut down to a sound
// skeleton: consonants only, with the pairs romanisation blurs merged.

const DEVA: Record<string, string> = {
  क: "k", ख: "k", ग: "g", घ: "g", ङ: "n",
  च: "c", छ: "c", ज: "j", झ: "j", ञ: "n",
  ट: "t", ठ: "t", ड: "d", ढ: "d", ण: "n",
  त: "t", थ: "t", द: "d", ध: "d", न: "n",
  प: "p", फ: "f", ब: "b", भ: "b", म: "m",
  य: "", र: "r", ल: "l", व: "b",
  श: "s", ष: "s", स: "s", ह: "",
  // Anusvara is typed (sansar); chandrabindu only nasalises a vowel, and isn't.
  "ं": "n", "ँ": "", "ृ": "r", ऋ: "r",
};
// An n before a consonant is typed or not at whim (sansar, sasar), so it goes.
const NASAL = /n(?=[bcdfgjklmprst])/g;

// NFKD splits the precomposed nukta letters into letter + nukta, so only these.
// ड़ and ढ़ are typed as d (chhod, padhna), so they stay with ड.
const NUKTA: Record<string, string> = { ड: "d", ढ: "d", फ: "f", ज: "j" };

/** Lowercase, Latin accents off, punctuation to spaces: for plain substring matching. */
export const plain = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, (m) => (/[ऀ-ॿ]/.test(m) ? m : ""))
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();

/** Consonant skeleton of Latin or Devanagari text, words kept apart by spaces. */
export function skeleton(s: string): string {
  let out = "";
  const t = plain(s);
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c >= "ऀ" && c <= "ॿ") {
      if (t[i + 1] === "़" && NUKTA[c]) {
        out += NUKTA[c];
        i++;
      } else out += DEVA[c] ?? "";
    } else out += c;
  }
  return out
    .replace(/ph/g, "f")
    .replace(/h/g, "")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "j")
    .replace(/[wv]/g, "b")
    .replace(/[aeiouy]/g, "")
    .replace(NASAL, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export type LyricDoc = { id: string; lines: string[]; p: string[]; s: string[] };
export type LyricHit = { id: string; line: string };

/** Readies a song's lyrics for findLyrics, once rather than on every keystroke. */
export function lyricDoc(id: string, text: string): LyricDoc {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { id, lines, p: lines.map(plain), s: lines.map(skeleton) };
}

const pair = (xs: string[], i: number) =>
  [xs[i], xs[i + 1]].filter(Boolean).join(" ");

/**
 * Songs whose lyrics contain the query, with the line that matched. A line and
 * the one after it are tried together, since a remembered phrase can run across
 * a break. Exact matches rank above skeleton ones.
 */
export function findLyrics(query: string, docs: LyricDoc[], limit = 20) {
  const q = plain(query);
  if (q.length < 4) return [];
  const qs = skeleton(query);
  const squash = (s: string) =>
    s.replace(/ /g, "").replace(NASAL, "").replace(/(.)\1+/g, "$1");
  const qn = squash(qs);
  // By sound, a short query must line up with whole words, or it matches half
  // the library; a long one may ignore word breaks, which spellings disagree on.
  const aligned = q.includes(" ") && qn.length >= 3 ? ` ${qs} ` : null;
  const loose = qn.length >= 6 ? qn : null;
  const bySound = (s: string) =>
    (!!aligned && ` ${s} `.includes(aligned)) ||
    (!!loose && squash(s).includes(loose));
  const exact: LyricHit[] = [];
  const sound: LyricHit[] = [];
  for (const d of docs) {
    let hit: LyricHit | null = null;
    let isExact = false;
    for (let i = 0; i < d.lines.length; i++) {
      if (pair(d.p, i).includes(q)) {
        const line = d.p[i].includes(q) ? d.lines[i] : pair(d.lines, i);
        hit = { id: d.id, line };
        isExact = true;
        break;
      }
      if (!hit && bySound(pair(d.s, i))) {
        const line = bySound(d.s[i]) ? d.lines[i] : pair(d.lines, i);
        hit = { id: d.id, line };
      }
    }
    if (hit) (isExact ? exact : sound).push(hit);
  }
  return [...exact, ...sound].slice(0, limit);
}
