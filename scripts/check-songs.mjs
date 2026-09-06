// A deploy replaces every static asset, so building without the audio present publishes an
// empty library over a working one. That is not hypothetical: Cloudflare Builds runs on every
// push to main and builds from the git clone, where public/songs does not exist (840 MB,
// deliberately not committed), and it has wiped the live library twice.
//
// Failing the build is the safe outcome — a red build is recoverable, a silent wipe is not.
import { readdir } from 'node:fs/promises';

const SONGS = 'public/songs';
const AUDIO = /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i;

const count = async (dir) => {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) n += await count(`${dir}/${e.name}`);
    else if (AUDIO.test(e.name)) n++;
  }
  return n;
};

let found = 0;
try {
  found = await count(SONGS);
} catch {
  // Missing directory is the CI case, reported below like an empty one.
}

if (!found) {
  console.error(
    `\n✗ No audio in ${SONGS}/ — refusing to build.\n\n` +
      `  Deploying now would replace the live library with nothing.\n\n` +
      `  On CI this build cannot succeed: the audio is not in git. Deploy from a\n` +
      `  machine that has the songs, with \`npm run deploy\`. See DEPLOY.md.\n`
  );
  process.exit(1);
}

console.log(`${found} tracks present`);
