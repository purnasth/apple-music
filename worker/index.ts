/**
 * The library is not part of the deployed asset manifest, and that is the point.
 *
 * `wrangler deploy` replaces every static asset. The audio is 1.1 GB, deliberately
 * not in git, so a deploy from a clone — Cloudflare Builds on every push — used to
 * publish an empty library over a working one. It did, twice. Serving the media out
 * of R2 puts it beyond the manifest's reach: a deploy can change the app and can no
 * longer touch the library.
 *
 * Only the media prefixes reach this Worker (`run_worker_first` in wrangler.jsonc);
 * every other request is served straight off the asset edge with no invocation.
 */
export interface Env {
  ASSETS: Fetcher;
  LIBRARY: R2Bucket;
}

const MEDIA = /^\/(?:songs|songs-art)\/|^\/songs\.json$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!MEDIA.test(url.pathname)) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    // The manifest stores each path segment percent-encoded; R2 keys are the raw names.
    const key = decodeURIComponent(url.pathname.slice(1));

    // Passing the request's own headers lets R2 resolve Range and If-None-Match:
    // static assets ignore Range and answer with the whole file, which is why a seek
    // past the buffer used to restart the track. R2 honours it.
    const object = await env.LIBRARY.get(key, {
      range: request.headers,
      onlyIf: request.headers,
    });
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("accept-ranges", "bytes");
    // Audio and covers are content-addressed or stable; the manifest is not.
    headers.set(
      "cache-control",
      key === "songs.json" ? "public, max-age=60" : "public, max-age=31536000, immutable",
    );

    // A conditional miss comes back without a body — nothing to send but the headers.
    if (!("body" in object)) return new Response(null, { status: 304, headers });

    const { range, size } = object;
    if (range) {
      const offset = "suffix" in range ? size - range.suffix : (range.offset ?? 0);
      const length = "suffix" in range ? range.suffix : (range.length ?? size - offset);
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${size}`);
      headers.set("content-length", String(length));
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("content-length", String(size));
    return new Response(object.body, { headers });
  },
} satisfies ExportedHandler<Env>;
