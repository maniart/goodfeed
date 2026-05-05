// SofterFeed — background service worker
// Handles storage defaults and messaging between popup and content script.

const DEFAULTS = {
  grayscale: true,
  blurImages: true,
  disableAutoplay: true,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    const init = {};
    for (const [key, val] of Object.entries(DEFAULTS)) {
      if (stored[key] === undefined) init[key] = val;
    }
    if (Object.keys(init).length) chrome.storage.sync.set(init);
  });
});

