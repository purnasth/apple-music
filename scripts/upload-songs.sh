#!/usr/bin/env bash
# Uploads the song library to R2. Wrangler has no bulk put, so this walks the folder one
# object at a time; it is safe to re-run, since put overwrites and skips nothing.
#
#   ./scripts/upload-songs.sh apple-music-songs
set -euo pipefail

BUCKET="${1:?usage: upload-songs.sh <bucket> [source-dir]}"
SRC="${2:-$HOME/Downloads/songs highquality}"
n=0
total=$(find "$SRC" -type f -name '*.m4a' | wc -l | tr -d ' ')

# -print0/read -d '' so the spaces and parentheses in these filenames survive.
find "$SRC" -type f -name '*.m4a' -print0 | while IFS= read -r -d '' file; do
  key="${file#"$SRC"/}"
  n=$((n + 1))
  printf '[%d/%s] %s\n' "$n" "$total" "$key"
  # Long cache: object keys change whenever a song is renamed or replaced.
  npx wrangler r2 object put "$BUCKET/$key" \
    --file "$file" --remote \
    --content-type audio/mp4 \
    --cache-control 'public, max-age=31536000, immutable' >/dev/null
done

# Covers ride along under art/ so the repo carries only the 36KB manifest.
if [ -d public/songs-art ]; then
  for art in public/songs-art/*.jpg; do
    [ -e "$art" ] || break
    npx wrangler r2 object put "$BUCKET/art/$(basename "$art")" \
      --file "$art" --remote \
      --content-type image/jpeg \
      --cache-control 'public, max-age=31536000, immutable' >/dev/null
  done
  echo "uploaded $(ls public/songs-art | wc -l | tr -d ' ') covers to $BUCKET/art/"
fi

echo "done — $total songs in $BUCKET"
