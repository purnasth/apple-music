// Tells the page the extension is here, so it can hide its setup tip.
const ready = () => window.postMessage({ ytHistoryReady: true }, location.origin);
ready();

addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.data?.ytHistoryPing) ready();
  if (!e.data?.ytWatched) return;
  try {
    chrome.runtime.sendMessage(e.data.ytWatched);
  } catch {
    // The extension was reloaded; this page needs a refresh to reconnect.
  }
});
