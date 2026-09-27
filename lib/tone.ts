/** What a cover's colours mean for the UI drawn over it. */

export type Tone = { lum: number | null; hue: number | null };

/**
 * Average luminance (0–1) and the hue of the most vivid colour of RGBA pixels,
 * such as an 8×8 downscale of the cover. Hue is null for greyscale art.
 */
export function toneOf(d: ArrayLike<number>): Tone {
  let sum = 0;
  let best = { s: 0, h: 0 };
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const max = Math.max(r, g, b);
    const span = max - Math.min(r, g, b);
    // Chroma, so a dark muddy pixel does not outrank a clear colour.
    if (span > best.s) {
      const h =
        max === r
          ? ((g - b) / span) % 6
          : max === g
            ? (b - r) / span + 2
            : (r - g) / span + 4;
      best = { s: span, h: (h * 60 + 360) % 360 };
    }
  }
  const px = d.length / 4;
  return {
    lum: px ? sum / px / 255 : null,
    hue: best.s > 0.15 ? Math.round(best.h) : null,
  };
}

/** Brightness scale that keeps the cover-filled mark visible on the light play button. */
export const markTone = (lum: number | null) =>
  lum === null ? 0.6 : Math.min(1, 0.3 / lum);

/** Black over the flowing cover, darker for brighter art, so white text stays legible. */
export const backdropDim = (lum: number | null) =>
  lum === null ? 0.45 : 0.25 + lum * 0.5;
