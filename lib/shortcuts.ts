/**
 * The keyboard map, kept here so the handler in components/Player.tsx and the
 * help sheet that documents it cannot drift apart.
 *
 * Where the three reference players agree, we follow them: Space plays and
 * pauses everywhere, arrows seek, Escape leaves the full view. Where they
 * disagree we follow YouTube, because its bindings are the ones people arrive
 * already knowing — J/L for the ten-second jumps, Shift+N and Shift+P to walk
 * the queue, digits for the tenths, M to mute, F and I for the big view.
 * Spotify's own transport bindings are all Ctrl/Cmd-chorded, which on the web
 * collides with browser navigation, so they are deliberately not copied.
 */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Space", "K"], label: "Play or pause" },
  { keys: ["Shift", "N"], label: "Next track" },
  { keys: ["Shift", "P"], label: "Previous track" },
  { keys: ["J"], label: "Back 10 seconds" },
  { keys: ["L"], label: "Forward 10 seconds" },
  { keys: ["←"], label: "Back 5 seconds" },
  { keys: ["→"], label: "Forward 5 seconds" },
  { keys: ["0", "–", "9"], label: "Jump to 0–90% of the track" },
  { keys: ["Home"], label: "Back to the start" },
  { keys: ["End"], label: "Skip to the end" },
  { keys: ["↑"], label: "Volume up" },
  { keys: ["↓"], label: "Volume down" },
  { keys: ["M"], label: "Mute or unmute" },
  { keys: ["S"], label: "Shuffle" },
  { keys: ["R"], label: "Repeat" },
  { keys: ["F", "I"], label: "Enter or leave the full view" },
  { keys: ["Esc"], label: "Leave the full view" },
  { keys: ["/"], label: "Jump to search" },
  { keys: ["?"], label: "Show this list" },
];
