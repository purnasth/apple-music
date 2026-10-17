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

let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg) => {
  queue = queue.then(() => report(msg)).catch((e) => console.warn("YouTube history:", e.message));
});
