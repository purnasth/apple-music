/**
 * The mini player for browsers without Document Picture-in-Picture (Safari):
 * the widget painted on a canvas, streamed into a muted video, and floated with
 * the video Picture-in-Picture every browser has. It is a picture, so its only
 * controls are the ones the browser draws on the window.
 *
 * It paints components/MiniPlayer.tsx's layout at its default 320×134 size, from
 * the same pieces: lib/wave for the line and its colours, lib/tone for the dim.
 * A layout change there needs the matching numbers here.
 */

import { fmtTime } from "@/lib/music";
import { Tone, backdropDim, toneOf } from "@/lib/tone";
import { FLOW_SPEED, loopPath, waveHeights, waveStops } from "@/lib/wave";

export type MiniFrame = {
  id: string;
  title: string;
  artist: string;
  art?: string;
  time: number;
  dur: number;
  playing: boolean;
};

export type VideoMini = ReturnType<typeof createVideoMini>;

export const videoMiniSupported = () =>
  typeof document !== "undefined" &&
  !!document.pictureInPictureEnabled &&
  typeof HTMLCanvasElement.prototype.captureStream === "function";

// MiniPlayer.tsx at its default size: p-3, h-12 cover, gap-2 rows, gap-3 row.
const W = 320;
const H = 134;
const SCALE = 2;
const PAD = 12;
const COVER = 48;
const LINE_TOP = PAD + COVER + 8;
const LINE_H = H - PAD - LINE_TOP;
// The compact horizon: 4px loops, 5px of glow room above and below.
const STEP = 4;
const GLOW = 5;

function toneOfImage(img: HTMLImageElement): Tone {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, 8, 8);
    return toneOf(g.getImageData(0, 0, 8, 8).data);
  } catch {
    return { lum: null, hue: null };
  }
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

export function createVideoMini(
  frame: () => MiniFrame | null,
  onPlaying: (p: boolean) => void,
  onClose: () => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  // The waveform is drawn apart so its ends can fade out like .horizon-band's.
  const band = document.createElement("canvas");
  const bctx = band.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;

  const video = document.createElement("video") as HTMLVideoElement & {
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
    webkitPresentationMode?: string;
  };
  video.muted = true;
  video.playsInline = true;
  video.srcObject = canvas.captureStream(30);
  // Invisible but rendered: some browsers refuse PiP for a hidden video, and
  // Safari shapes the window after this box, so it keeps the widget's ratio.
  Object.assign(video.style, {
    position: "fixed",
    left: "0",
    bottom: "0",
    width: `${W / 5}px`,
    height: `${H / 5}px`,
    opacity: "0.01",
    pointerEvents: "none",
  });
  document.body.append(video);
  // Safari's own mode switch is synchronous, so it stays inside the click that
  // Safari requires; the standard API is the path everywhere else.
  const webkit = !!video.webkitSupportsPresentationMode?.("picture-in-picture");

  const art = new Image();
  art.crossOrigin = "anonymous";
  let artSrc = "";
  let tone: Tone = { lum: null, hue: null };
  art.onload = () => (tone = toneOfImage(art));
  let flow = 0;
  let last = performance.now();
  let timer = 0;
  // Our own pause/play calls fire the same events as the window's button.
  let quiet = false;

  const drawWave = (f: MiniFrame, x: number, w: number, dt: number) => {
    const n = Math.floor(w / STEP / 2) * 2;
    if (!n) return;
    const period = n * STEP;
    const lineH = LINE_H - 2 * GLOW;
    if (f.playing) flow = (flow + dt * FLOW_SPEED) % period;
    const hs = waveHeights(f.id, n);
    const path = new Path2D(loopPath([...hs, ...hs], STEP, lineH, flow));
    const stops = waveStops(tone.hue);

    band.width = w * SCALE;
    band.height = LINE_H * SCALE;
    bctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const grad = bctx.createLinearGradient(0, GLOW + lineH, 0, GLOW);
    stops.forEach((c, i) => grad.addColorStop(i / 2, c));
    bctx.lineWidth = 1.5;
    bctx.lineCap = bctx.lineJoin = "round";
    bctx.shadowColor = stops[1];
    bctx.shadowBlur = 3 * SCALE;
    // Played part at full strength, the rest at half, as the view's mask does.
    const played = f.dur > 0 ? (f.time / f.dur) * w : 0;
    for (const [from, to, alpha] of [
      [0, played, 0.8],
      [played, w, 0.4],
    ]) {
      bctx.save();
      bctx.beginPath();
      bctx.rect(from, 0, to - from, LINE_H);
      bctx.clip();
      bctx.globalAlpha = alpha;
      bctx.translate(0, GLOW);
      bctx.strokeStyle = grad;
      bctx.stroke(path);
      bctx.restore();
    }
    bctx.globalCompositeOperation = "destination-in";
    const fade = bctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, "transparent");
    fade.addColorStop(0.15, "#000");
    fade.addColorStop(0.85, "#000");
    fade.addColorStop(1, "transparent");
    bctx.fillStyle = fade;
    bctx.fillRect(0, 0, w, LINE_H);
    bctx.globalCompositeOperation = "source-over";
    ctx.drawImage(band, x, LINE_TOP, w, LINE_H);
  };

  const draw = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    const f = frame();
    if (!f) return;
    if (f.art !== artSrc) {
      artSrc = f.art ?? "";
      tone = { lum: null, hue: null };
      if (artSrc) art.src = artSrc;
    }
    const hasArt = !!artSrc && art.complete && art.naturalWidth > 0;

    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (hasArt) {
      // A still of the .flow backdrop: the cover blown up and blurred.
      ctx.save();
      ctx.filter = "blur(24px) saturate(1.8)";
      ctx.drawImage(art, -W * 0.15, -W * 0.45, W * 1.3, W * 1.3);
      ctx.restore();
    }
    ctx.fillStyle = `rgb(0 0 0 / ${backdropDim(tone.lum)})`;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, COVER, COVER, 10);
    ctx.clip();
    if (hasArt) ctx.drawImage(art, PAD, PAD, COVER, COVER);
    else {
      ctx.fillStyle = "rgb(255 255 255 / 0.1)";
      ctx.fillRect(PAD, PAD, COVER, COVER);
    }
    ctx.restore();

    const textX = PAD + COVER + 12;
    const textW = W - PAD - textX;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff";
    ctx.font = `500 14px ${font}`;
    ctx.fillText(fit(ctx, f.title, textW), textX, PAD + 21);
    ctx.fillStyle = "rgb(255 255 255 / 0.7)";
    ctx.font = `12px ${font}`;
    ctx.fillText(fit(ctx, f.artist, textW), textX, PAD + 38);

    ctx.font = `10px ${font}`;
    const mid = LINE_TOP + LINE_H / 2 + 3.5;
    const left = fmtTime(f.time);
    const right = fmtTime(f.dur);
    ctx.fillText(left, PAD, mid);
    ctx.textAlign = "right";
    ctx.fillText(right, W - PAD, mid);
    const x0 = PAD + ctx.measureText(left).width + 8;
    const x1 = W - PAD - ctx.measureText(right).width - 8;
    drawWave(f, x0, x1 - x0, dt);
  };

  const set = (playing: boolean) => {
    if (playing === !video.paused) return;
    quiet = true;
    (playing ? video.play() : Promise.resolve(video.pause()))
      .catch(() => {})
      .finally(() => (quiet = false));
  };

  const floating = () =>
    webkit
      ? video.webkitPresentationMode === "picture-in-picture"
      : document.pictureInPictureElement === video;
  // Only the floating window's own button may drive playback.
  const fromWindow = () => !quiet && floating();
  video.addEventListener("play", () => fromWindow() && onPlaying(true));
  video.addEventListener("pause", () => fromWindow() && onPlaying(false));
  const closed = () => {
    if (floating()) return;
    clearInterval(timer);
    onClose();
  };
  video.addEventListener("leavepictureinpicture", closed);
  video.addEventListener("webkitpresentationmodechanged", closed);

  // Ready before any click: a window request that waits on loading loses the
  // user gesture, and Safari then refuses it.
  quiet = true;
  video
    .play()
    .catch(() => {})
    .finally(() => (quiet = false));
  // A stream only carries frames painted after the video starts reading it.
  const prime = () => {
    draw();
    if (video.readyState < 1) setTimeout(prime, 100);
  };
  prime();

  return {
    /** Must be called straight from the click or key press. */
    open() {
      draw();
      let req: Promise<unknown>;
      if (webkit) {
        video.webkitSetPresentationMode!("picture-in-picture");
        req = Promise.resolve();
      } else req = video.requestPictureInPicture();
      return req.then(() => {
        // ponytail: 15 fps timer, not rAF, because rAF stops in a hidden tab; a
        // browser that throttles hidden timers will update the picture less often.
        clearInterval(timer);
        timer = window.setInterval(draw, 1000 / 15);
        const f = frame();
        if (f) set(f.playing);
      });
    },
    close() {
      if (webkit) video.webkitSetPresentationMode!("inline");
      else if (document.pictureInPictureElement === video)
        document.exitPictureInPicture().catch(() => {});
    },
    sync: set,
    destroy() {
      clearInterval(timer);
      video.remove();
    },
  };
}
