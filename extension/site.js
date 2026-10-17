// Tells the page the extension is here, so it shows history as on and asks for picks.
const ready = () => window.postMessage({ ytHistoryReady: true }, location.origin);
ready();

const send = (msg, reply) => {
  try {
    chrome.runtime.sendMessage(msg, reply);
  } catch {
    // The extension was reloaded; this page needs a refresh to reconnect.
  }
};

addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.data?.ytHistoryPing) ready();
  if (e.data?.ytWatched) send(e.data.ytWatched);
  if (e.data?.ytPicksAsk)
    send({ picks: true }, (ids) => window.postMessage({ ytPicks: ids ?? [] }, location.origin));
});
