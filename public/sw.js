// Serves /songs/* cache-first and answers Range requests itself. The host
// (Cloudflare static assets) ignores Range and always returns the whole file,
// which breaks seeking in media elements. Here the first play streams straight
// through to the player while a copy lands in the Cache API; every later play,
// and every seek, is answered locally with a proper 206 — so replays are
// instant, work offline, and seeking works everywhere.
const CACHE = 'songs-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin && url.pathname.startsWith('/songs/')) {
    e.respondWith(serve(e));
  }
});

/** "bytes=a-b" | "bytes=a-" → [a, b] clamped to size, or null if unusable. */
function parseRange(header, size) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ? [start, end] : null;
}

function partial(body, start, end, size, type) {
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': type || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

/** Cuts a stream off after n bytes — for probes like "bytes=0-1". */
function truncate(stream, n) {
  let left = n;
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, ctrl) {
        const take = chunk.subarray(0, left);
        left -= take.byteLength;
        ctrl.enqueue(take);
        if (left <= 0) ctrl.terminate();
      },
    })
  );
}

async function serve(event) {
  const req = event.request;
  const range = req.headers.get('range');
  const cache = await caches.open(CACHE);

  const hit = await cache.match(req.url);
  if (hit) {
    if (!range) return hit;
    // ponytail: whole file into memory to slice (~8 MB per track); stream-skip it
    // from the cache instead if memory ever matters.
    const buf = await hit.arrayBuffer();
    const r = parseRange(range, buf.byteLength);
    if (!r) return new Response(null, { status: 416 });
    return partial(buf.slice(r[0], r[1] + 1), r[0], r[1], buf.byteLength, hit.headers.get('content-type'));
  }

  const net = await fetch(req.url);
  if (!net.ok) return net;
  // Quota failures (private windows cap storage) must not kill playback.
  const stored = cache.put(req.url, net.clone()).catch(() => {});

  const size = Number(net.headers.get('content-length'));
  // No length means no way to shape a 206; hand the 200 through and let the
  // browser cope. Cloudflare always sends content-length for these files.
  if (!range || !size) return net;

  const r = parseRange(range, size);
  if (!r) return net;
  const [start, end] = r;

  // Safari refuses a 200 answer to a ranged media request, so re-shape the
  // streaming body into the 206 it expects. From byte 0 that is just headers.
  if (start === 0) {
    event.waitUntil(stored);
    const body = end === size - 1 ? net.body : truncate(net.body, end + 1);
    return partial(body, start, end, size, net.headers.get('content-type'));
  }

  // Mid-file seek before the first download finished: wait for the cache copy,
  // then slice from it. Rare, and never slower than the old full-download path.
  net.body?.cancel().catch(() => {});
  await stored;
  const cached = await cache.match(req.url);
  if (!cached) return net;
  const buf = await cached.arrayBuffer();
  return partial(buf.slice(start, end + 1), start, end, buf.byteLength, cached.headers.get('content-type'));
}
