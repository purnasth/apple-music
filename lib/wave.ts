/**
 * The waveform's geometry and colour, shared by the SVG horizon and the painted
 * Safari mini player, so both draw the same line for the same song.
 */

/** Loop heights from the track id: the same song always draws the same line. */
export function waveHeights(seed: string, n: number) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const raw = Array.from({ length: n }, rand);
  // Neighbours wrap around, so the pattern tiles without a seam.
  return raw.map((v, i) => {
    const smooth = (raw.at(i - 1)! + v * 6 + raw[(i + 1) % n]) / 8;
    return 0.3 + 0.7 * smooth ** 1.2;
  });
}

/**
 * Tall, narrow loops, alternately up and down, rounded at the turns; `heights`
 * are 0–1 per loop. `shift` slides the line left by part of a loop, and `flip`
 * starts it on a downstroke.
 */
export function loopPath(
  heights: number[],
  step: number,
  H: number,
  shift = 0,
  flip = false,
) {
  const mid = H / 2;
  const r = step / 2;
  let path = `M${-shift} ${mid}`;
  heights.forEach((a, i) => {
    const x = i * step - shift;
    const reach = Math.max(a * (mid - 2), r + 0.5);
    path +=
      (i % 2 === 0) !== flip
        ? ` L${x} ${mid - reach + r} A${r} ${r} 0 0 1 ${x + step} ${mid - reach + r}`
        : ` L${x} ${mid + reach - r} A${r} ${r} 0 0 0 ${x + step} ${mid + reach - r}`;
  });
  return path;
}

/** Bottom-to-top gradient around the cover's hue; greys when it has none. */
export const waveStops = (hue: number | null) =>
  hue === null
    ? ["#8e97aa", "#d3d8e3", "#ffffff"]
    : [
        `hsl(${hue - 35} 85% 56%)`,
        `hsl(${hue} 85% 68%)`,
        `hsl(${hue + 35} 95% 88%)`,
      ];

/** How fast the seeded pattern flows, in px per second. */
export const FLOW_SPEED = 40;
