"use client";

import { GooeyToaster } from "goey-toast";
// Required — without it the toasts render unstyled.
import "goey-toast/styles.css";

/**
 * goey-toast ships without a "use client" directive but its component uses
 * hooks, so it cannot be imported straight into the server layout. This is that
 * boundary. Per-toast defaults live in lib/toast.ts — the toaster's own
 * showTimestamp global is not honoured by the library.
 *
 * Top centre because both other edges are taken: the header is sticky at the
 * top of the content, and the player capsule (plus the tab bar on a phone) owns
 * the bottom. The offset clears the header.
 */
export function Toaster() {
  return (
    <GooeyToaster
      position="top-center"
      offset="72px"
      theme="dark"
      preset="smooth"
      closeButton
      showProgress
    />
  );
}
