"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { TRACKS } from "@/lib/brand";

/**
 * The brand page's mini-player: which track you are reading, how far through
 * it you are, and a way to skip. Same glass, same accent, same bar the app
 * keeps at the bottom of the screen.
 */
export function BrandNav() {
  const [active, setActive] = useState<string>(TRACKS[0][0]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    for (const [id] of TRACKS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      setProgress(max > 0 ? Math.min(1, scrollY / max) : 0);
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      removeEventListener("scroll", onScroll);
    };
  }, []);

  const index = TRACKS.findIndex(([id]) => id === active);

  return (
    <nav
      aria-label="Sections"
      className="glass fixed inset-x-0 bottom-0 z-30 border-t border-separator"
    >
      <div
        className="h-0.5 bg-accent transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <Logo className="shrink-0 text-accent" size={20} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{TRACKS[index]?.[1]}</p>
          <p className="text-xxs uppercase tracking-widest text-label-3">
            Track {index + 1} of {TRACKS.length}
          </p>
        </div>
        <div className="flex gap-1">
          {TRACKS.map(([id], i) => (
            <a
              key={id}
              href={`#${id}`}
              aria-label={TRACKS[i][1]}
              aria-current={active === id ? "location" : undefined}
              className={`grid size-8 place-items-center rounded-full text-xs font-medium tabular-nums transition-colors ${
                active === id
                  ? "bg-accent text-white"
                  : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
              }`}
            >
              {i + 1}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
