/** Word timing by forced alignment of heard words to LRCLIB lines. Build time only. */

export type Heard = { text: string; t: number };
export type TimedLine = {
  t: number;
  text: string;
  w?: number[];
  e?: number;
};

const letters = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");

const DEV: Record<string, string> = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "ee",
  उ: "u",
  ऊ: "oo",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  ऋ: "ri",
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "n",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "n",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
  "ा": "aa",
  "ि": "i",
  "ी": "ee",
  "ु": "u",
  "ू": "oo",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ं": "n",
  "ँ": "n",
  "ः": "h",
  "्": "",
  "़": "",
};

const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

const translit = (s: string) =>
  hasDevanagari(s)
    ? [...s.normalize("NFD")].map((c) => DEV[c] ?? c).join("")
    : s;

/** Consonant skeleton, script-independent: "dekhoon" and "देखूँ" both give "dkhn". */
export const skeleton = (s: string) =>
  letters(translit(s))
    .replace(/ph/g, "f")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/[aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1");

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length];
}

const ratio = (a: string, b: string) =>
  a.length || b.length ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0;

export function similarity(lyric: string, heard: string): number {
  const a = letters(lyric);
  const b = letters(heard);
  if (!a || !b) return 0;
  const full = hasDevanagari(a) === hasDevanagari(b) ? ratio(a, b) : 0;
  const sa = skeleton(a);
  const sb = skeleton(b);
  const skel = sa.length >= 2 && sb.length >= 2 ? ratio(sa, sb) * 0.9 : 0;
  return Math.max(full, skel);
}

type Slot = { line: number; word: number; text: string };

const MATCH = 0.55;
const GAP = -0.4;

/** Needleman–Wunsch; returns the paired heard index per lyric slot, or -1. */
function pair(
  slots: Slot[],
  heard: Heard[],
  allowed: (slot: Slot, h: Heard) => boolean,
): number[] {
  const n = slots.length;
  const m = heard.length;
  const score = new Float32Array((n + 1) * (m + 1));
  const from = new Uint8Array((n + 1) * (m + 1)); // 1 diag, 2 up, 3 left
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = 1; i <= n; i++) {
    score[at(i, 0)] = i * GAP;
    from[at(i, 0)] = 2;
  }
  for (let j = 1; j <= m; j++) {
    score[at(0, j)] = j * GAP;
    from[at(0, j)] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = allowed(slots[i - 1], heard[j - 1])
        ? similarity(slots[i - 1].text, heard[j - 1].text)
        : 0;
      const diag = score[at(i - 1, j - 1)] + (sim >= MATCH ? sim * 2 : -1);
      const up = score[at(i - 1, j)] + GAP;
      const left = score[at(i, j - 1)] + GAP;
      const best = Math.max(diag, up, left);
      score[at(i, j)] = best;
      from[at(i, j)] = best === diag ? 1 : best === up ? 2 : 3;
    }
  }
  const out = new Array<number>(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const f = from[at(i, j)];
    if (f === 1) {
      if (
        similarity(slots[i - 1].text, heard[j - 1].text) >= MATCH &&
        allowed(slots[i - 1], heard[j - 1])
      )
        out[i - 1] = j - 1;
      i--;
      j--;
    } else if (f === 2) i--;
    else j--;
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

const PACE = 0.075;

export type Alignment = {
  lines: TimedLine[];
  matched: number;
  offset: number;
};

export function align(
  lines: { t: number; text: string }[],
  heard: Heard[],
): Alignment {
  const slots: Slot[] = [];
  const words = lines.map((l) => (l.text ? l.text.split(" ") : []));
  words.forEach((ws, line) =>
    ws.forEach((text, word) => slots.push({ line, word, text })),
  );
  const end = (line: number) => lines[line + 1]?.t ?? lines[line].t + 8;

  const loose = pair(slots, heard, () => true);
  const deltas = slots
    .map((s, k) =>
      s.word === 0 && loose[k] >= 0 ? lines[s.line].t - heard[loose[k]].t : NaN,
    )
    .filter((d) => !Number.isNaN(d));
  const offset = median(deltas);

  const tight = pair(slots, heard, (s, h) => {
    const t = h.t + offset;
    return t >= lines[s.line].t - 0.75 && t <= end(s.line) + 0.75;
  });

  const out: TimedLine[] = lines.map((l, i) => {
    if (!words[i].length) return { t: l.t, text: l.text };
    const starts: number[] = [];
    let pos = 0;
    for (const w of words[i]) {
      starts.push(pos);
      pos += w.length + 1;
    }
    const len = l.text.length;
    const stop = end(i) - 0.05;

    const mine = slots
      .map((s, k) => (s.line === i ? k : -1))
      .filter((k) => k >= 0);
    const first = tight[mine[0]];
    const local = first >= 0 ? l.t - heard[first].t : NaN;
    const lag = Math.abs(local - offset) < 1 ? local : offset;

    const anchors: [number, number][] = [[0, l.t]];
    mine.forEach((k) => {
      const s = slots[k];
      if (s.word === 0 || tight[k] < 0) return;
      const t = Math.min(Math.max(heard[tight[k]].t + lag, l.t), stop);
      if (t > anchors[anchors.length - 1][1]) anchors.push([starts[s.word], t]);
    });
    const [lastPos, lastT] = anchors[anchors.length - 1];
    const e = Math.min(
      stop,
      Math.max(lastT + (len - lastPos) * PACE + 0.2, l.t + 1),
    );
    anchors.push([len, e]);

    const w = starts.map((p) => {
      let a = 0;
      while (anchors[a + 1][0] < p) a++;
      const [p0, t0] = anchors[a];
      const [p1, t1] = anchors[a + 1];
      return p1 === p0 ? t0 : t0 + ((p - p0) / (p1 - p0)) * (t1 - t0);
    });
    for (let k = 1; k < w.length; k++) w[k] = Math.max(w[k], w[k - 1] + 0.04);
    const r = (x: number) => Math.round(x * 100) / 100;
    return {
      t: l.t,
      text: l.text,
      w: w.map(r),
      e: r(Math.max(e, w[w.length - 1] + 0.1)),
    };
  });

  return {
    lines: out,
    matched: slots.length
      ? tight.filter((j) => j >= 0).length / slots.length
      : 0,
    offset,
  };
}

type WhisperToken = { text: string; t_dtw?: number };
type WhisperJson = { transcription: { tokens: WhisperToken[] }[] };

/** Words from whisper.cpp -ojf --dtw output; t_dtw is in centiseconds. */
export function heardWords(json: WhisperJson): Heard[] {
  const out: Heard[] = [];
  for (const seg of json.transcription)
    for (const tok of seg.tokens) {
      if (/^\s*\[_/.test(tok.text) || tok.t_dtw == null || tok.t_dtw < 0)
        continue;
      const bare = tok.text.trim();
      if (!letters(bare)) continue;
      if (tok.text.startsWith(" ") || !out.length)
        out.push({ text: bare, t: tok.t_dtw / 100 });
      else out[out.length - 1].text += bare;
    }
  return out;
}

const ENGLISH = new Set(
  "the a an and or but i me my you your we our he she it they is are was be to of in on at for with not no so all this that what love like up as".split(
    " ",
  ),
);
const ROMANISED = new Set(
  "hai hain main mein tu tum tera teri tere mera meri mere ke ki ka na se ho ye yeh jo dil hoon hun kya nahi hum mujhe tujhe bhi toh ko timi mero ma cha chha ra".split(
    " ",
  ),
);

/** The model language, from the lyric: auto-detection misjudges instrumental intros. */
export function languageOf(lines: { text: string }[]): "en" | "hi" | "ur" {
  const text = lines.map((l) => l.text).join(" ");
  if (/[\u0600-\u06FF]/.test(text)) return "ur";
  if (hasDevanagari(text)) return "hi";
  const words = text.toLowerCase().split(/\s+/).map(letters).filter(Boolean);
  const en = words.filter((w) => ENGLISH.has(w)).length;
  const hi = words.filter((w) => ROMANISED.has(w)).length;
  return en >= hi ? "en" : "hi";
}
