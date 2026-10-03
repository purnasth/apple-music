import type { Track } from "./music";

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.NEXT_PUBLIC_YT_KEY;

export const hasKey = !!KEY;
export const isYouTube = (t: Track) => t.id.startsWith("yt:");
export const videoId = (t: Track) => t.id.slice(3);

/** Which player a list belongs to; a playlist takes the kind of its first song. */
export type Source = "youtube" | "library";
export const sourceOf = (t: Track): Source => (isYouTube(t) ? "youtube" : "library");
export const sourcesOf = (tracks: Track[]) => [...new Set(tracks.map(sourceOf))];

/** "PT1H2M3S" → 3723. */
export const isoSecs = (iso: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  return m ? +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0) : 0;
};

/** Auto-generated "Artist - Topic" channels and VEVO suffixes are the artist's name. */
export const artistOf = (channel: string) =>
  channel.replace(/ - Topic$/, "").replace(/VEVO$/, "").trim() || channel;

// Snippet text arrives HTML-escaped ("Don&#39;t").
const unescape = (s: string) =>
  typeof DOMParser === "undefined"
    ? s
    : (new DOMParser().parseFromString(s, "text/html").documentElement
        .textContent ?? s);

type Snippet = {
  title: string;
  channelTitle: string;
  thumbnails: Record<string, { url: string } | undefined>;
};

const toTrack = (id: string, s: Snippet, secs?: number): Track => ({
  id: `yt:${id}`,
  title: unescape(s.title),
  artist: artistOf(unescape(s.channelTitle)),
  album: "",
  artwork: (s.thumbnails.medium ?? s.thumbnails.default)?.url,
  artworkLarge: (s.thumbnails.maxres ?? s.thumbnails.high)?.url,
  appleUrl: `https://www.youtube.com/watch?v=${id}`,
  duration: secs,
});

async function api<T>(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: KEY ?? "" });
  const data = await (await fetch(`${API}/${path}?${qs}`)).json();
  if (data.error) throw new Error(data.error.message);
  return data as T;
}

/** Full details for up to 50 videos in one call: costs 1 unit of quota. */
export async function videos(ids: string[]): Promise<Track[]> {
  if (!ids.length) return [];
  const data = await api<{
    items: { id: string; snippet: Snippet; contentDetails: { duration: string } }[];
  }>("videos", { part: "snippet,contentDetails", id: ids.slice(0, 50).join(",") });
  const byId = new Map(
    data.items.map((v) => [v.id, toTrack(v.id, v.snippet, isoSecs(v.contentDetails.duration))]),
  );
  return ids.map((id) => byId.get(id)).filter((t): t is Track => !!t);
}

/** Music videos for a query: 100 units, a hundredth of the free daily quota. */
export async function searchYouTube(q: string): Promise<Track[]> {
  const data = await api<{ items: { id: { videoId: string } }[] }>("search", {
    part: "id",
    type: "video",
    videoCategoryId: "10",
    maxResults: "25",
    q,
  });
  return videos(data.items.map((i) => i.id.videoId));
}

/* The queue survives a reload, and the main page hands songs over through it. */
const KEY_SESSION = "yt-session";

export type YtSession = { queue: Track[]; index: number; play?: boolean };

export function getYtSession(): YtSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY_SESSION) ?? "null") as YtSession | null;
    return s?.queue?.length ? s : null;
  } catch {
    return null;
  }
}

export const saveYtSession = (s: YtSession) =>
  localStorage.setItem(KEY_SESSION, JSON.stringify(s));
