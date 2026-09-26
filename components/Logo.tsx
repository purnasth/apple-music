import { useId } from "react";

/**
 * The mark: one full moon (Purnima, Purna = whole) cut like an engraved
 * whole note. Fills currentColor; the counter shows whatever sits behind it.
 * `live` draws the note as a mask so .live-note can move it inside the moon;
 * `art` then fills the moon with that cover, blurred into a wash, its brightness
 * scaled by `tone`.
 */
export function Logo({
  size = 20,
  className,
  live,
  art,
  tone = 1,
}: {
  size?: number;
  className?: string;
  live?: boolean;
  art?: string;
  tone?: number;
}) {
  const id = useId().replace(/[^\w-]/g, "");
  return (
    <svg
      viewBox="17 17 66 66"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {live ? (
        <>
          <mask id={`${id}m`}>
            <circle cx="50" cy="50" r="30" fill="#fff" />
            <g transform="rotate(-50 50 50)">
              <ellipse className="live-note" cx="50" cy="50" rx="9" ry="15.5" />
            </g>
          </mask>
          <filter id={`${id}f`} colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="7" />
            <feColorMatrix type="saturate" values="1.8" />
            <feComponentTransfer>
              <feFuncR type="linear" slope={tone} />
              <feFuncG type="linear" slope={tone} />
              <feFuncB type="linear" slope={tone} />
            </feComponentTransfer>
          </filter>
          <g className="mark-fill">
            <circle cx="50" cy="50" r="30" fill="currentColor" />
            {art && (
              <image
                className="live-art"
                href={art}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
                filter={`url(#${id}f)`}
              />
            )}
          </g>
          <g mask={`url(#${id}m)`}>
            <circle cx="50" cy="50" r="30" fill="currentColor" />
            {art && (
              <image
                className="live-art"
                href={art}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
                filter={`url(#${id}f)`}
              />
            )}
          </g>
        </>
      ) : (
        <>
          <circle className="mark-fill" cx="50" cy="50" r="30" fill="currentColor" />
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M50 20a30 30 0 1 0 0 60a30 30 0 1 0 0-60zm11.87 39.96a9 15.5 -50 1 0-23.74-19.92a9 15.5 -50 1 0 23.74 19.92z"
          />
        </>
      )}
    </svg>
  );
}
