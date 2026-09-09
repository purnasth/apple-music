import { gooeyToast, type GooeyToastOptions } from "goey-toast";

/**
 * App-wide toast defaults.
 *
 * Applied per call rather than on <GooeyToaster>, because goey-toast's
 * GooeyToastWrapper initialises its state as `initialShowTimestamp ?? true` and
 * never falls back to the toaster's global the way `showProgress` does. So
 * `showTimestamp={false}` on the toaster is silently ignored for every ordinary
 * toast, and the only setting it honours is a per-toast one. A clock on "Added
 * to the queue" is noise: the toast is on screen because it just happened.
 */
const withDefaults = (o?: GooeyToastOptions): GooeyToastOptions => ({
  showTimestamp: false,
  ...o,
});

export const toast = Object.assign(
  (title: string, o?: GooeyToastOptions) => gooeyToast(title, withDefaults(o)),
  {
    success: (title: string, o?: GooeyToastOptions) =>
      gooeyToast.success(title, withDefaults(o)),
    error: (title: string, o?: GooeyToastOptions) =>
      gooeyToast.error(title, withDefaults(o)),
    warning: (title: string, o?: GooeyToastOptions) =>
      gooeyToast.warning(title, withDefaults(o)),
    info: (title: string, o?: GooeyToastOptions) =>
      gooeyToast.info(title, withDefaults(o)),
  },
);
