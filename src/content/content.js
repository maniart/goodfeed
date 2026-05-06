// BetterFeed — content script
// Applies all feature transforms to instagram.com.

// Hide the page immediately (document_start) to prevent flash of unstyled content.
// Revealed once settings are loaded from storage.
document.documentElement.dataset.sfLoading = "true";
const loadingGuard = setTimeout(() => {
  delete document.documentElement.dataset.sfLoading;
}, 1000);

let settings = {};

function applySettings() {
  const html = document.documentElement;

  html.dataset.sfGrayscale = settings.grayscale !== false ? "on" : "off";
  html.dataset.sfBlurImages = settings.blurImages !== false ? "on" : "off";

  // Clear revealed media when blur is disabled
  if (settings.blurImages === false) {
    document.querySelectorAll("img[data-sf-revealed], video[data-sf-revealed]").forEach((el) => {
      delete el.dataset.sfRevealed;
    });
  }
}

// Reveal blurred images/videos on first click, then re-blur after 5 seconds.
// Uses elementsFromPoint to find media hidden beneath Instagram's overlay divs.
const revealTimers = new WeakMap();

document.addEventListener(
  "click",
  (e) => {
    if (settings.blurImages === false) return;
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const media = stack.find(
      (el) => (el.tagName === "IMG" || el.tagName === "VIDEO") && !el.dataset.sfRevealed
    );
    if (media) {
      media.dataset.sfRevealed = "true";
      e.stopPropagation();
      e.preventDefault();

      // Reset timer if already running (e.g. user clicks again before re-blur)
      clearTimeout(revealTimers.get(media));
      revealTimers.set(
        media,
        setTimeout(() => {
          if (media.tagName === "VIDEO" && !media.paused) return;
          delete media.dataset.sfRevealed;
        }, 5000)
      );
    }
  },
  true
);

// Prevent autoplay — pause any video that starts playing unless the user revealed it
document.addEventListener(
  "play",
  (e) => {
    if (settings.disableAutoplay === false) return;
    const video = e.target;
    if (video.tagName === "VIDEO" && !video.dataset.sfRevealed) {
      video.pause();
    }
  },
  true
);

// Load settings and reveal the page
chrome.storage.sync.get(null, (stored) => {
  clearTimeout(loadingGuard);
  settings = stored;
  applySettings();
  delete document.documentElement.dataset.sfLoading;
});

// React to settings changes directly — more reliable than background relay
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    settings[key] = newValue;
  }
  applySettings();
});
