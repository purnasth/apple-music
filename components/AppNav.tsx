"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TbBrandYoutube,
  TbLibrary,
  TbPlaylist,
  TbSearch,
} from "react-icons/tb";
import { Logo } from "@/components/Logo";

export type Tab = "search" | "library" | "playlists";
type Place = Tab | "youtube";

export const isTab = (v: unknown): v is Tab =>
  v === "search" || v === "library" || v === "playlists";

const PLACES = [
  { id: "search", label: "Search", Icon: TbSearch },
  { id: "library", label: "Library", Icon: TbLibrary },
  { id: "playlists", label: "Playlists", Icon: TbPlaylist },
  { id: "youtube", label: "YouTube", Icon: TbBrandYoutube },
] as const;

/** A tab switches in place on the main page (`onTab`), and links to it from anywhere else. */
function Place({
  id,
  current,
  onTab,
  className,
  children,
}: {
  id: Place;
  current: Place;
  onTab?: (t: Tab) => void;
  className: string;
  children: React.ReactNode;
}) {
  const props = {
    "aria-current": id === current ? ("page" as const) : undefined,
    className,
  };
  if (id === "youtube")
    return (
      <Link href="/youtube" {...props}>
        {children}
      </Link>
    );
  if (onTab)
    return (
      <button onClick={() => onTab(id)} {...props}>
        {children}
      </button>
    );
  return (
    <Link href={`/?tab=${id}`} {...props}>
      {children}
    </Link>
  );
}

/** The bar every page shares: home, the page's search field (`children`), and the tabs. */
export function Masthead({
  current,
  onTab,
  libraryCount,
  children,
}: {
  current: Place;
  onTab?: (t: Tab) => void;
  libraryCount?: number;
  children: React.ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  // The scroll edge effect: no separator at rest, a hairline once content slides
  // under the bar (HIG — Layout > Visual hierarchy).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`glass sticky top-0 z-30 border-b transition-colors ${
        scrolled ? "border-separator" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        {/* Home, the way a logo goes home. The brand page is the colophon's job. */}
        <h1 className="flex shrink-0 items-center text-base font-semibold tracking-tight">
          <Link
            href="/"
            aria-label="Music — home"
            className="flex items-center gap-1.5 transition-colors hover:text-accent"
          >
            <Logo className="text-accent" size={20} />
            <span className="hidden sm:inline">Music</span>
          </Link>
        </h1>

        <div className="relative min-w-0 flex-1">{children}</div>

        {/* A segmented control on desktop; below sm the tab bar at the foot of the
            screen carries primary navigation instead (HIG — Layout). */}
        <nav className="hidden shrink-0 items-center gap-1 rounded-control bg-fill p-1 sm:flex">
          {PLACES.map(({ id, label }) => (
            <Place
              key={id}
              id={id}
              current={current}
              onTab={onTab}
              className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition ${
                current === id
                  ? "bg-elevated-2 text-label shadow-sm"
                  : "text-label-2 hover:text-label"
              }`}
            >
              {label}
              {id === "library" && libraryCount ? ` (${libraryCount})` : ""}
            </Place>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** Primary navigation at the foot of the screen on a phone, where a thumb reaches it. */
export function TabBar({
  current,
  onTab,
}: {
  current: Place;
  onTab?: (t: Tab) => void;
}) {
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-separator sm:hidden">
      <div className="flex">
        {PLACES.map(({ id, label, Icon }) => (
          <Place
            key={id}
            id={id}
            current={current}
            onTab={onTab}
            className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 transition ${
              current === id ? "text-accent" : "text-label-2"
            }`}
          >
            <Icon size={19} />
            <span className="text-xxs font-medium tracking-tight">{label}</span>
          </Place>
        ))}
      </div>
    </nav>
  );
}
