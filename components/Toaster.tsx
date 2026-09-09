"use client";

import { GooeyToaster } from "goey-toast";
// Required — without it the toasts render unstyled.
import "goey-toast/styles.css";

/**
 * goey-toast ships without a "use client" directive but its component uses
 * hooks, so it cannot be imported straight into the server layout. This is that
 * boundary, and the one place the app's toast defaults live.
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
      // A timestamp on "Added to queue" is noise, not information.
      showTimestamp={false}
      showProgress
    />
  );
}
