/**
 * The mark: one full moon (Purnima, Purna = whole) cut like an engraved
 * whole note. Fills currentColor; the counter shows whatever sits behind it.
 */
export function Logo({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="17 17 66 66"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M50 20a30 30 0 1 0 0 60a30 30 0 1 0 0-60zm11.87 39.96a9 15.5 -50 1 0-23.74-19.92a9 15.5 -50 1 0 23.74 19.92z"
      />
    </svg>
  );
}
