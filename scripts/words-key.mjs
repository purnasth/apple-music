import { createHash } from 'node:crypto';

/** Where a track's word timings live. Keyed on the preview URL, which carries the
    path and the file size (?v=), so replacing a song's audio re-times it. */
export const wordsFile = (preview) =>
  `${createHash('sha1').update(preview).digest('hex').slice(0, 16)}.json`;
