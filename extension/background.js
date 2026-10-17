// The same reports youtube.com's player sends, as yt-dlp's --mark-watched does:
// one "playback" ping puts the video in watch history, "watchtime" adds the time heard.

const cpnChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const cpn = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => cpnChars[b & 63]).join("");

// Per video: its tracking URLs and one client playback nonce, so later reports join the first.
const sessions = new Map();

async function session(id) {
  if (sessions.has(id)) return sessions.get(id);
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { credentials: "include" })).text();
  const url = (name) => {
    const m = new RegExp(`"${name}":\\{"baseUrl":"([^"]+)"`).exec(html);
    return m && JSON.parse(`"${m[1]}"`);
  };
  const s = { playback: url("videostatsPlaybackUrl"), watchtime: url("videostatsWatchtimeUrl"), cpn: cpn(), sent: false };
  if (!s.playback) throw new Error("no tracking URL: signed out of YouTube, or YouTube changed its page");
  sessions.set(id, s);
  return s;
}

const ping = (base, extra) => {
  const u = new URL(base);
  for (const [k, v] of Object.entries({ ver: 2, ...extra })) u.searchParams.set(k, v);
  return fetch(u, { credentials: "include" });
};

async function report({ id, t, len }) {
  const s = await session(id);
  if (!s.sent) {
    await ping(s.playback, { cpn: s.cpn });
    s.sent = true;
  }
  if (s.watchtime) {
    const at = t.toFixed(3);
    await ping(s.watchtime, { cpn: s.cpn, st: 0, et: at, cmt: at, len: len.toFixed(3), state: "playing" });
  }
}

// YouTube Music's Quick picks for the signed-in account: the home page carries its
// first shelves as hex-escaped JSON. Kept 30 minutes so every visit isn't a 800 KB fetch.
const PICKS_TTL = 30 * 60 * 1000;

async function picks() {
  const { cached } = await chrome.storage.session.get("cached");
  if (cached && Date.now() - cached.at < PICKS_TTL) return cached.ids;
  const html = await (await fetch("https://music.youtube.com/", { credentials: "include" })).text();
  const m = /initialData\.push\(\{path: '\\\/browse', params: JSON\.parse\('[^']*'\), data: '([^']+)'\}\);/.exec(html);
  if (!m) throw new Error("no home feed: signed out of YouTube Music, or its page changed");
  const data = JSON.parse(
    m[1].replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, "\\"),
  );
  const shelves =
    data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  // Quick picks is the shelf of song rows; matched by shape, since its title follows the account's language.
  const shelf = shelves
    .map((s) => s.musicCarouselShelfRenderer)
    .find((c) => c?.contents?.[0]?.musicResponsiveListItemRenderer);
  const ids = (shelf?.contents ?? [])
    .map((c) => c.musicResponsiveListItemRenderer?.playlistItemData?.videoId)
    .filter(Boolean);
  await chrome.storage.session.set({ cached: { ids, at: Date.now() } });
  return ids;
}

let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.picks) {
    picks()
      .then(reply)
      .catch((e) => {
        console.warn("YouTube picks:", e.message);
        reply([]);
      });
    return true;
  }
  queue = queue.then(() => report(msg)).catch((e) => console.warn("YouTube history:", e.message));
});
