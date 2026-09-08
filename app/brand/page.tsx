import type { Metadata } from "next";
import { BrandNav } from "@/components/BrandNav";
import { TRACKS } from "@/lib/brand";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Brand — Music",
  description:
    "The identity behind Music by Purna: one word, one moon, one colour.",
  // Deliberately unlisted: reachable by URL, never by search or the app's own chrome.
  robots: { index: false, follow: false },
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** A moon at a given phase, 0 = new, 1 = full. Only the full one carries the counter. */
function Moon({ phase, size = 64 }: { phase: number; size?: number }) {
  const full = phase >= 1;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <circle cx="50" cy="50" r="30" fill="currentColor" />
      {full ? (
        <ellipse
          cx="50"
          cy="50"
          rx="9"
          ry="15.5"
          fill="var(--color-canvas)"
          transform="rotate(-50 50 50)"
        />
      ) : (
        <circle
          cx={50 - 62 * phase}
          cy="50"
          r="30"
          fill="var(--color-canvas)"
        />
      )}
    </svg>
  );
}

/** The hero mark: the moon waxes to full once, then the counter is cut in. */
function RisingMoon() {
  return (
    <svg viewBox="0 0 100 100" className="size-44 sm:size-56" aria-hidden>
      <circle cx="50" cy="50" r="30" fill="#f5f5f7" />
      <circle cx="50" cy="50" r="30" fill="var(--color-canvas)">
        <animate
          attributeName="cx"
          from="50"
          to="-14"
          dur="1.8s"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
          fill="freeze"
        />
      </circle>
      <ellipse
        cx="50"
        cy="50"
        rx="9"
        ry="15.5"
        fill="var(--color-canvas)"
        transform="rotate(-50 50 50)"
        opacity="0"
      >
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          begin="1.7s"
          dur="0.4s"
          fill="freeze"
        />
      </ellipse>
    </svg>
  );
}

/** How the mark is drawn: the grid, the disc, the counter and its angle. */
function Construction() {
  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-xs" aria-hidden>
      <g stroke="var(--color-separator)" strokeWidth="0.4" fill="none">
        {Array.from({ length: 9 }, (_, i) => (i + 1) * 10).map((v) => (
          <g key={v}>
            <path d={`M${v} 0V100`} />
            <path d={`M0 ${v}H100`} />
          </g>
        ))}
      </g>
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="#f5f5f7"
        strokeWidth="0.8"
      />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="var(--color-label-3)"
        strokeWidth="0.4"
        strokeDasharray="1.5 1.5"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="9"
        ry="15.5"
        fill="none"
        stroke="#fa243c"
        strokeWidth="0.8"
        transform="rotate(-50 50 50)"
      />
      <path d="M50 20V80" stroke="var(--color-label-3)" strokeWidth="0.4" />
      <path
        d="M50 28V72"
        stroke="#fa243c"
        strokeWidth="0.4"
        strokeDasharray="1 1"
        transform="rotate(-50 50 50)"
      />
      <path
        d="M50 34a16 16 0 0 1 12.3 5.7"
        fill="none"
        stroke="#fa243c"
        strokeWidth="0.5"
      />
      <g fill="var(--color-label-2)" fontSize="3.4" fontFamily="inherit">
        <text x="56" y="31">
          50°
        </text>
        <text x="81" y="52">
          r 30
        </text>
        <text x="91" y="12">
          r 40
        </text>
      </g>
    </svg>
  );
}

/** A wrong rendering, drawn so the reader sees exactly what not to do. */
function Wrong({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="relative grid size-24 place-items-center rounded-card bg-elevated">
        {children}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-px w-[72%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-accent"
        />
      </div>
      <figcaption className="text-xs text-label-2">{label}</figcaption>
    </figure>
  );
}

function Track({
  id,
  n,
  title,
  lede,
  children,
}: {
  id: string;
  n: number;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-16 border-t border-separator py-16 sm:py-24"
    >
      <div className="grid gap-8 sm:grid-cols-[120px_1fr] sm:gap-12">
        <p className="text-xxs font-medium uppercase tracking-widest text-label-3">
          <span className="tabular-nums">{String(n).padStart(2, "0")}</span>
          <span className="mx-2 text-separator">/</span>
          {String(TRACKS.length).padStart(2, "0")}
        </p>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-label-2">
            {lede}
          </p>
          <div className="mt-10 space-y-12">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-xxs font-medium uppercase tracking-widest text-label-3">
      {children}
    </p>
  );
}

const COLOURS = [
  ["accent", "#fa243c", "The one colour. Play, the mark, focus.", "—"],
  ["canvas", "#000000", "The stage. Everything sits on it.", "—"],
  ["label", "#f5f5f7", "Primary text.", "19.8:1"],
  ["label-2", "#98989f", "Secondary text.", "7.3:1"],
  ["label-3", "#7c7c84", "Tertiary text, captions.", "5.6:1"],
  ["elevated", "#1c1c1e", "Sheets, popovers, the mini-player.", "—"],
  ["elevated-2", "#2c2c2e", "Controls resting on a sheet.", "—"],
] as const;

const SCALE = [
  ["text-2xl font-semibold tracking-tight", "24", "Now-playing title"],
  ["text-base font-semibold tracking-tight", "16", "Wordmark"],
  ["text-sm font-medium", "14", "Track titles, rows"],
  ["text-xs", "12", "Artist, album, times"],
  ["text-[11px] font-medium", "11", "Chips"],
  ["text-xxs font-medium uppercase tracking-widest", "10", "Section labels"],
] as const;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function BrandPage() {
  return (
    <div className="min-h-dvh bg-canvas pb-24 text-label">
      {/* Hero: one word, one moon. */}
      <header className="mx-auto flex min-h-[88vh] max-w-5xl flex-col items-center justify-center px-4 text-center">
        <RisingMoon />
        <p className="mt-10 text-xxs font-medium uppercase tracking-widest text-label-3">
          Music by Purna
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          One word. One moon. One colour.
        </h1>
        <p className="mt-5 max-w-lg text-sm leading-relaxed text-label-2 sm:text-base">
          Purna means whole. This is the identity that follows from it, in five
          tracks. Nothing here is decoration; every piece is a consequence of
          the name.
        </p>
      </header>

      <div className="mx-auto max-w-5xl px-4">
        {/* 01 ---------------------------------------------------------- */}
        <Track
          id="name"
          n={1}
          title="The name"
          lede="The app is called Music, plainly, because that is what it holds. The brand is the person behind it."
        >
          <div className="grid gap-px overflow-hidden rounded-card bg-separator sm:grid-cols-3">
            {[
              [
                "पूर्ण",
                "Purna",
                "Whole. Complete. Full. The word the identity is built from.",
              ],
              [
                "पूर्णिमा",
                "Purnima",
                "The full moon. The night the circle closes.",
              ],
              [
                null,
                "Whole note",
                "Music's own word for whole: the note with no stem and no flag, the longest sound in the bar.",
              ],
            ].map(([glyph, word, gloss]) => (
              <div key={word} className="bg-canvas p-6">
                {glyph ? (
                  <p className="text-3xl leading-none text-label">{glyph}</p>
                ) : (
                  <svg
                    viewBox="0 0 40 24"
                    width="48"
                    height="29"
                    aria-hidden
                    className="block"
                  >
                    <path
                      fill="currentColor"
                      fillRule="evenodd"
                      d="M20 3c8.3 0 15 4 15 9s-6.7 9-15 9-15-4-15-9 6.7-9 15-9zm4.8 4.2c-1.9-1.9-4.9-2.3-6.7-.8-1.8 1.5-1.7 4.4.2 6.4s4.9 2.3 6.7.8c1.8-1.5 1.7-4.4-.2-6.4z"
                    />
                  </svg>
                )}
                <p className="mt-5 text-sm font-medium">{word}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-label-2">
                  {gloss}
                </p>
              </div>
            ))}
          </div>

          <div>
            <Label>What the word promises</Label>
            <dl className="grid gap-6 sm:grid-cols-3">
              {[
                [
                  "Whole",
                  "The app is complete on its own. Your library, the catalogue for previews, no account, no server, works offline.",
                ],
                [
                  "Full",
                  "Nothing is held back behind a paywall or a login. What you see is all of it.",
                ],
                [
                  "Finished",
                  "Every screen ships done. No placeholders, no coming soon, no beta badge.",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm font-medium">{k}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-label-2">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Track>

        {/* 02 ---------------------------------------------------------- */}
        <Track
          id="mark"
          n={2}
          title="The mark"
          lede="A full moon cut like a whole note. One disc, one engraved counter turned fifty degrees, the way a printer cuts a whole note into a staff. It is the moon of Purnima, a record on a turntable, and the note that stands alone. Drawn by Purna Shrestha, September 2026."
        >
          <div>
            <Label>Phases</Label>
            <div className="flex flex-wrap items-end gap-6 text-label">
              {[0.15, 0.4, 0.65, 0.85].map((p) => (
                <div
                  key={p}
                  className="flex flex-col items-center gap-2 opacity-40"
                >
                  <Moon phase={p} />
                  <span className="text-xxs text-label-3">not the mark</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <Moon phase={1} size={96} />
                <span className="text-xxs font-medium uppercase tracking-widest text-accent">
                  Purnima
                </span>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-label-2">
              Only the full moon is the mark. Purna is the finished phase; a
              crescent is a promise, not a whole. The counter appears only when
              the disc is complete.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <Label>Construction</Label>
              <Construction />
            </div>
            <div className="text-xs leading-relaxed text-label-2">
              <Label>Measures</Label>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                <dt className="text-label">Grid</dt>
                <dd>100 units square</dd>
                <dt className="text-label">Disc</dt>
                <dd>Radius 30, centred</dd>
                <dt className="text-label">Counter</dt>
                <dd>9 by 15.5, rotated −50°</dd>
                <dt className="text-label">Clear space</dt>
                <dd>Radius 40. Nothing crosses the dotted circle.</dd>
                <dt className="text-label">Minimum</dt>
                <dd>
                  16 px on screen. Smaller than that, use a plain accent dot.
                </dd>
              </dl>
            </div>
          </div>

          <div>
            <Label>Where it lives</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              <figure className="grid aspect-square place-items-center rounded-card bg-accent text-white">
                <Logo size={72} />
                <figcaption className="sr-only">
                  White on the accent: the app icon
                </figcaption>
              </figure>
              <figure className="grid aspect-square place-items-center rounded-card bg-[#f5f5f7] text-black">
                <div className="flex items-center gap-2.5">
                  <Logo size={28} />
                  <span className="text-base font-semibold tracking-tight">
                    Music
                  </span>
                </div>
                <figcaption className="sr-only">Black on light</figcaption>
              </figure>
              <figure className="grid aspect-square place-items-center rounded-card border border-separator bg-canvas">
                <div className="flex items-center gap-2.5">
                  <Logo className="text-accent" size={28} />
                  <span className="text-base font-semibold tracking-tight">
                    Music
                  </span>
                </div>
                <figcaption className="sr-only">
                  Accent on the canvas: the header
                </figcaption>
              </figure>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-label-2">
              The icon ships full-bleed with square corners. iOS, Android and
              the desktop apply their own mask, so the tile always sits flush
              and never shows a white edge. The rounded version exists only in
              the vector file.
            </p>
          </div>

          <div>
            <Label>Never</Label>
            <div className="flex flex-wrap gap-6">
              <Wrong label="Outlined">
                <svg viewBox="0 0 100 100" width="44" height="44" aria-hidden>
                  <circle
                    cx="50"
                    cy="50"
                    r="28"
                    fill="none"
                    stroke="#f5f5f7"
                    strokeWidth="4"
                  />
                  <ellipse
                    cx="50"
                    cy="50"
                    rx="9"
                    ry="15.5"
                    fill="none"
                    stroke="#f5f5f7"
                    strokeWidth="4"
                    transform="rotate(-50 50 50)"
                  />
                </svg>
              </Wrong>
              <Wrong label="Rotated">
                <Logo size={44} className="rotate-45" />
              </Wrong>
              <Wrong label="Gradient">
                <svg viewBox="0 0 100 100" width="44" height="44" aria-hidden>
                  <defs>
                    <linearGradient id="bad" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0" stopColor="#fa243c" />
                      <stop offset="1" stopColor="#ffb0b8" />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="50" r="30" fill="url(#bad)" />
                  <ellipse
                    cx="50"
                    cy="50"
                    rx="9"
                    ry="15.5"
                    fill="#1c1c1e"
                    transform="rotate(-50 50 50)"
                  />
                </svg>
              </Wrong>
              <Wrong label="Another colour">
                <Logo size={44} className="text-[#5eead4]" />
              </Wrong>
              <Wrong label="Crescent">
                <Moon phase={0.5} size={44} />
              </Wrong>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/logo.svg"
              download="music-mark.svg"
              className="rounded-full bg-fill px-3.5 py-1.5 text-xs font-medium hover:bg-fill-2"
            >
              Download SVG
            </a>
            <a
              href="/icon-512.png"
              download="music-icon-512.png"
              className="rounded-full bg-fill px-3.5 py-1.5 text-xs font-medium hover:bg-fill-2"
            >
              Download icon, 512
            </a>
          </div>
        </Track>

        {/* 03 ---------------------------------------------------------- */}
        <Track
          id="type"
          n={3}
          title="The type"
          lede="Geist, by Vercel. A variable grotesque drawn for screens, and the only face in the product. Four weights are used and nothing outside them."
        >
          <div>
            <Label>In the player</Label>
            <div className="max-w-md rounded-sheet bg-elevated p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-14 shrink-0 place-items-center rounded-control bg-elevated-2 text-label-3">
                  <Logo size={26} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">Purnima</p>
                  <p className="truncate text-xs text-label-2">
                    Purna Shrestha · Whole
                  </p>
                </div>
                <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-medium text-label-2">
                  Preview
                </span>
              </div>
              <div className="mt-4">
                <div className="h-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full w-[38%] rounded-full bg-accent" />
                </div>
                <div className="mt-1.5 flex justify-between text-xs tabular-nums text-label-3">
                  <span>1:08</span>
                  <span>−1:52</span>
                </div>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-label-2">
              Titles at 14 medium, metadata at 12 regular, times in tabular
              figures so they never jitter as they count. This card is the whole
              type system in one place.
            </p>
          </div>

          <div>
            <Label>The scale</Label>
            <ul className="divide-y divide-separator border-y border-separator">
              {SCALE.map(([cls, px, use]) => (
                <li
                  key={px}
                  className="grid items-baseline gap-3 py-4 sm:grid-cols-[1fr_auto]"
                >
                  <p className={cls}>Music by Purna</p>
                  <p className="text-xxs text-label-3">
                    <span className="tabular-nums text-label-2">{px} px</span>
                    <span className="mx-2 text-separator">/</span>
                    {use}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label>Weights</Label>
            <div className="grid gap-6 sm:grid-cols-4">
              {(
                [
                  ["font-normal", "400", "Regular", "Body, metadata"],
                  ["font-medium", "500", "Medium", "Titles, chips"],
                  ["font-semibold", "600", "Semibold", "Headings, wordmark"],
                  ["font-bold", "700", "Bold", "Reserved. Almost never."],
                ] as const
              ).map(([cls, w, name, use]) => (
                <div key={w} className={cls}>
                  <p className="text-4xl leading-none">Aa</p>
                  <p className="mt-3 text-sm">{name}</p>
                  <p className="text-xxs font-normal text-label-3">
                    <span className="tabular-nums">{w}</span> · {use}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Track>

        {/* 04 ---------------------------------------------------------- */}
        <Track
          id="colour"
          n={4}
          title="The colour"
          lede="One colour, on black, with white text. Album artwork supplies every other colour the app will ever show, so the chrome stays out of its way."
        >
          <div>
            <Label>The stage</Label>
            <div className="rounded-sheet border border-separator bg-canvas p-5 sm:p-6">
              <p className="text-xxs text-label-3">canvas · #000000</p>
              <div className="mt-3 rounded-card bg-elevated p-5">
                <p className="text-xxs text-label-3">elevated · #1c1c1e</p>
                <div className="mt-3 flex items-center gap-3 rounded-control bg-elevated-2 p-3">
                  <span className="size-2.5 rounded-full bg-accent" />
                  <p className="text-sm font-medium">label · #f5f5f7</p>
                  <p className="ml-auto text-xs text-label-2">label-2</p>
                </div>
                <p className="mt-2 text-xxs text-label-3">
                  elevated-2 · #2c2c2e
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-label-2">
              Two levels of surface: the canvas recedes, elevated surfaces
              advance. Three levels of text, each checked against black. The
              accent appears once per screen, where the eye should land, and
              nowhere else.
            </p>
          </div>

          <div>
            <Label>Every moon</Label>
            <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-4">
              {COLOURS.map(([name, hex, use, ratio]) => (
                <li key={name} className="flex gap-4 sm:block">
                  <div
                    className="size-16 shrink-0 rounded-full border border-separator"
                    style={{ background: hex }}
                  />
                  <div className="sm:mt-3">
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs tabular-nums text-label-2">
                      {hex}
                      {ratio !== "—" && (
                        <span className="text-label-3"> · {ratio}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xxs leading-relaxed text-label-3">
                      {use}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Track>

        {/* 05 ---------------------------------------------------------- */}
        <Track
          id="voice"
          n={5}
          title="The voice"
          lede="The app speaks the way the mark looks: one plain shape, nothing extra. These are the rules its copy follows."
        >
          <dl className="grid gap-8 sm:grid-cols-3">
            {[
              [
                "Say less",
                "Search, preview and play your music library.",
                "Discover, stream and enjoy millions of songs anytime, anywhere!",
              ],
              [
                "Name the thing",
                "No account, no server.",
                "Privacy-first, serverless architecture.",
              ],
              [
                "Never shout",
                "Nothing here yet. Drop a file anywhere.",
                "Oops! Your library is empty 🎵",
              ],
            ].map(([rule, yes, no]) => (
              <div key={rule}>
                <dt className="text-sm font-medium">{rule}</dt>
                <dd className="mt-3 space-y-2 text-xs leading-relaxed">
                  <p className="rounded-control bg-elevated px-3 py-2 text-label">
                    {yes}
                  </p>
                  <p className="rounded-control px-3 py-2 text-label-3 line-through decoration-accent/70">
                    {no}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </Track>
      </div>

      <footer className="mx-auto flex max-w-5xl flex-col gap-2 border-t border-separator px-4 py-10 text-xs text-label-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <Logo className="text-accent" size={14} />© Purna Shrestha 2026
        </p>
        <p>
          The mark and the name identify one person&rsquo;s work. Ask before
          reusing them.
        </p>
      </footer>

      <BrandNav />
    </div>
  );
}
