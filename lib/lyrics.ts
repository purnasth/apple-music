import type { Track } from "./music";

export type Line = {
  t: number;
  text: string;
  /** Word start times, when timed to the word. */
  w?: number[];
  e?: number;
};

/** Parses LRC; a line may carry several stamps. Enhanced-LRC word stamps are stripped. */
export function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw
      .slice(stamps.at(-1)!.index! + stamps.at(-1)![0].length)
      .replace(/<\d+:\d+(?:\.\d+)?>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    for (const [, m, s] of stamps)
      out.push({ t: Number(m) * 60 + Number(s), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at `time`, or -1 before the first. */
export function lineAt(lines: Line[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return at;
}

/** Progress 0–1 through line `i`, for lines without word timings. */
// ponytail: ~13 chars/s pace heuristic; exact only with word timings.
export function progress(lines: Line[], i: number, time: number): number {
  const line = lines[i];
  if (!line) return 0;
  const gap = (lines[i + 1]?.t ?? line.t + 5) - line.t;
  const span = line.text
    ? Math.min(gap, Math.max(1, line.text.length * 0.075))
    : gap;
  return Math.min(Math.max((time - line.t) / Math.max(span, 0.001), 0), 1);
}

/** The word being sung (-1 before the first) and progress 0–1 through it. */
const wordLengths = new WeakMap<Line, number[]>();

export function wordAt(line: Line, time: number): { k: number; p: number } {
  const w = line.w;
  if (!w?.length || time < w[0]) return { k: -1, p: 0 };
  let k = 0;
  while (k + 1 < w.length && w[k + 1] <= time) k++;
  const next = w[k + 1] ?? line.e ?? w[k] + 1;
  let lens = wordLengths.get(line);
  if (!lens)
    wordLengths.set(line, (lens = line.text.split(" ").map((x) => x.length)));
  const len = lens[k] ?? 1;
  const span = Math.min(next - w[k], Math.max(0.3, len * 0.16));
  return {
    k,
    p: Math.min(Math.max((time - w[k]) / Math.max(span, 0.001), 0), 1),
  };
}

export type Lyrics = { lines: Line[] } | { plain: string };

type LrcRecord = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  duration?: number;
};

const cache = new Map<string, Promise<Lyrics | null>>();

/** One cached lookup per track. No abort signal: callers share the promise. */
export function getLyrics(track: Track): Promise<Lyrics | null> {
  let p = cache.get(track.id);
  if (!p) {
    p = fetchLyrics(track);
    cache.set(track.id, p);
    p.catch(() => cache.delete(track.id)); // a network blip should not stick
  }
  return p;
}

async function lrclib(path: string, params: Record<string, string>) {
  const res = await fetch(
    `https://lrclib.net/api/${path}?${new URLSearchParams(params)}`,
  );
  return res.ok ? ((await res.json()) as LrcRecord | LrcRecord[]) : null;
}

const URDU = /[\u0600-\u06FF]/;

const CONSONANT: Record<string, string> = {
  ب: "ब", پ: "प", ت: "त", ٹ: "ट", ث: "स", ج: "ज", چ: "च", ح: "ह", خ: "ख़",
  د: "द", ڈ: "ड", ذ: "ज़", ر: "र", ڑ: "ड़", ز: "ज़", ژ: "झ़", س: "स", ش: "श",
  ص: "स", ض: "ज़", ط: "त", ظ: "ज़", غ: "ग़", ف: "फ़", ق: "क़", ک: "क", ك: "क",
  گ: "ग", ل: "ल", م: "म", ن: "न", ہ: "ह", ه: "ह", ۃ: "ह",
};
const ASPIRATED: Record<string, string> = {
  ب: "भ", پ: "फ", ت: "थ", ٹ: "ठ", ج: "झ", چ: "छ", د: "ध", ڈ: "ढ", ک: "ख",
  گ: "घ", ڑ: "ढ़", ر: "र्ह", ل: "ल्ह", م: "म्ह", ن: "न्ह",
};
const MARK: Record<string, string> = { "ِ": "ि", "ُ": "ु", "ْ": "्", "ٰ": "ा", "ً": "न" };
const PUNCT: Record<string, string> = { "،": ",", "؟": "?", "۔": ".", "؛": ";" };
/** Common words whose short vowels letters alone cannot recover. */
const WORD: Record<string, string> = {
  میں: "में", ہیں: "हैं", ہے: "है", ہوں: "हूँ", نہیں: "नहीं", نہ: "ना", کیوں: "क्यों",
  تم: "तुम", تو: "तो", وہ: "वो", یہ: "ये", کہ: "कि", اس: "इस", ان: "उन", اسے: "उसे",
  انہیں: "उन्हें", تمہیں: "तुम्हें", مجھے: "मुझे", تجھے: "तुझे", مجھ: "मुझ", تجھ: "तुझ",
  دل: "दिल", کچھ: "कुछ", پھر: "फिर", عشق: "इश्क़", کسی: "किसी", کس: "किस", جیسے: "जैसे",
  کیسا: "कैसा", کیسے: "कैसे", ایسے: "ऐसे", ایسا: "ऐसा", کبھی: "कभी", ابھی: "अभी",
  سبھی: "सभी", دن: "दिन", بن: "बिन", بنا: "बिना", درد: "दर्द", ستم: "सितम",
  زندگی: "ज़िंदगी", محبت: "मोहब्बत", خدا: "ख़ुदा", دیدار: "दीदार", ساتھ: "साथ",
  پیار: "प्यार", یار: "यार", آنسو: "आँसू", چین: "चैन", بےچین: "बेचैन", نین: "नैन",
  رہ: "रह", کہیں: "कहीं", یہاں: "यहाँ", وہاں: "वहाँ", کہاں: "कहाँ", جہاں: "जहाँ",
  اپنا: "अपना", اپنی: "अपनी", اپنے: "अपने", اور: "और", ہر: "हर", بار: "बार", لیے: "लिए", دیے: "दिए",
};

/**
 * Urdu script to Devanagari: common words from a table, the rest letter by letter.
 * Urdu seldom writes short vowels, so some words come out slightly off; it is the
 * fallback when no readable version exists. Anything else (LRC stamps, Latin) passes through.
 */
export function devanagari(text: string): string {
  return text
    .replace(/[،؛؟۔]/g, (c) => PUNCT[c])
    .replace(/[\u0600-\u06FF]+/g, (w) => WORD[w] ?? letters(w));
}

function letters(w: string): string {
  let out = "";
  let cons = false;
  let last = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const next = w[i + 1];
    const end = i === w.length - 1 || (next === "ں" && i === w.length - 2);
    if (next === "ھ" && ASPIRATED[c]) {
      out += last = ASPIRATED[c];
      i++;
      cons = true;
    } else if ((c === "ہ" || c === "ه") && w[i - 1] === c) {
      continue;
    } else if (CONSONANT[c]) {
      out += last = CONSONANT[c];
      cons = true;
    } else if (c === "ّ" && cons) {
      out += "्" + last;
    } else if (MARK[c]) {
      // A closing zer is the ezafe: dil-e, jaan-e.
      out += !cons ? "" : c === "ِ" && end ? "े" : MARK[c];
      cons = c === "ً";
    } else if (c === "ا" || c === "آ") {
      if (i === 0 && c === "ا") {
        const v = ({ ی: "ए", ے: "ए", و: "ओ", "ِ": "इ", "ُ": "उ" } as Record<string, string>)[next];
        out += v ?? "अ";
        if (v) i++;
      } else out += cons ? "ा" : "आ";
      cons = false;
    } else if (c === "و") {
      if (i === 0 || !cons || next === "ا") {
        out += last = "व";
        cons = true;
      } else {
        out += "ो";
        cons = false;
      }
    } else if (c === "ی" || c === "ي") {
      if (i === 0 || !cons) {
        out += last = "य";
        cons = true;
      } else if (next === "ا" || next === "و") {
        out += "्य";
        last = "य";
      } else {
        out += end && next !== "ں" ? "ी" : "े";
        cons = false;
      }
    } else if (c === "ے") {
      out += cons ? "े" : "ए";
      cons = false;
    } else if (c === "ئ") {
      out += next === "ی" ? "ई" : next === "ے" ? "ए" : "इ";
      if (next === "ی" || next === "ے") i++;
      cons = false;
    } else if (c === "ں") {
      out += "ं";
    } else if (c === "ع") {
      if (i === 0) out += "अ";
    } else if (/[۰-۹]/.test(c)) {
      out += String(c.charCodeAt(0) - 0x6f0);
      cons = false;
    } else if (c !== "ء" && c !== "ھ" && c !== "َ") {
      out += c;
    }
  }
  return out;
}

const firstReadable = (texts: (string | null | undefined)[]) =>
  texts.find((t) => t && !URDU.test(t)) ?? texts.find(Boolean) ?? null;
const inDevanagari = (t: string | null) => (t && URDU.test(t) ? devanagari(t) : t);

/** The first text not in Urdu script, which few listeners here read; else the Urdu, in Devanagari. */
export const readable = (...texts: (string | null | undefined)[]) =>
  inDevanagari(firstReadable(texts));

/** LRCLIB's best synced and plain lyrics for a track, preferring a readable script. */
export async function findLrc(
  track: Pick<Track, "title" | "artist" | "album" | "duration">,
): Promise<{ synced: string | null; plain: string | null }> {
  const dur = track.duration ?? 0;
  const exact = (await lrclib("get", {
    artist_name: track.artist,
    track_name: track.title,
    album_name: track.album,
    duration: String(Math.round(dur)),
  })) as LrcRecord | null;

  // The exact match fails on collaboration credits and remaster lengths.
  let found: LrcRecord[] = [];
  if (!exact?.syncedLyrics || URDU.test(exact.syncedLyrics)) {
    found =
      ((await lrclib("search", {
        track_name: track.title,
        artist_name: track.artist.split(/\s*[,&]\s*/)[0],
      })) as LrcRecord[] | null) ?? [];
  }
  const pool = [
    ...(exact ? [exact] : []),
    ...found.filter((r) => !dur || Math.abs((r.duration ?? 0) - dur) < 5),
  ];
  const synced = firstReadable(pool.map((r) => r.syncedLyrics));
  const plain = firstReadable(pool.map((r) => r.plainLyrics));
  // Readable words beat Urdu timing: the word timer can time plain text from the audio.
  const urduOnly = synced && URDU.test(synced) && plain && !URDU.test(plain);
  return { synced: urduOnly ? null : inDevanagari(synced), plain: inDevanagari(plain) };
}

async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  if (track.words) {
    const res = await fetch(track.words).catch(() => null);
    const data = res?.ok
      ? ((await res.json()) as { lines?: Line[] | null })
      : null;
    // Timed before Urdu was converted; word for word, so the timings still fit.
    if (data?.lines?.length)
      return { lines: data.lines.map((l) => ({ ...l, text: inDevanagari(l.text)! })) };
  }

  // Offline, LRCLIB throws; the bundled sheet is still worth showing.
  const found = await findLrc(track).catch((e) => {
    if (!track.lyrics) throw e;
    return null;
  });
  if (found?.synced) return { lines: parseLrc(found.synced) };

  const sheet = track.lyrics
    ? await fetch(track.lyrics)
        .then((r) => (r.ok ? r.text() : null))
        .catch(() => null)
    : null;
  const plain = readable(sheet, found?.plain);
  return plain ? { plain } : null;
}
