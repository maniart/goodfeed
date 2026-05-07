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

  // Start or stop anonymization
  if (settings.anonymize !== false) {
    startAnonymizing();
  } else {
    stopAnonymizing();
  }
}

// ── Anonymize ─────────────────────────────────────────────────────────────

const userMap = new Map();
let userIdx = 0;
function fakeUser(name) {
  if (!userMap.has(name)) userMap.set(name, `user${++userIdx}`);
  return userMap.get(name);
}

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
  "Sunt in culpa qui officia deserunt mollit anim id est laborum.",
];
function lorem(str) { return LOREM[str.length % LOREM.length]; }

// Instagram's own paths that are never usernames
const RESERVED = new Set([
  "explore", "reels", "direct", "accounts", "p", "tv",
  "stories", "ar", "help", "about", "press", "api",
  "privacy", "safety", "legal", "directory", "lite",
  "challenge", "oauth", "graphql", "static",
]);

// Extract username from any Instagram href:
//   /username/          → "username"
//   /username/?hl=en    → "username"
//   /stories/username/  → "username"
//   /stories/username/12345/ → "username"
//   /explore/           → null  (reserved)
function extractUsernameFromHref(href) {
  if (!href || !href.startsWith("/")) return null;
  const parts = href.split("/").filter(Boolean);
  if (!parts.length) return null;
  const candidate = parts[0] === "stories" ? parts[1] : parts[0];
  if (!candidate) return null;
  if (RESERVED.has(candidate)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.]{0,29}$/.test(candidate)) return null;
  return candidate;
}

// Matches standalone username text, with or without @ prefix
const USERNAME_TEXT_RE = /^@?([A-Za-z0-9][A-Za-z0-9_.]{0,29})$/;

function replaceTextNodes(root, replacer) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const replaced = replacer(node.textContent);
    if (replaced !== node.textContent) {
      node._sfOrig = node._sfOrig ?? node.textContent;
      node.textContent = replaced;
    }
  }
}

function restoreTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node._sfOrig !== undefined) {
      node.textContent = node._sfOrig;
      delete node._sfOrig;
    }
  }
}

function anonymizeLink(el) {
  if (el.dataset.sfAnon) return;
  const username = extractUsernameFromHref(el.getAttribute("href"));
  if (!username) return;
  const fake = fakeUser(username);
  replaceTextNodes(el, (text) => text.replace(username, fake));
  el.dataset.sfAnon = "1";
}

function restoreLink(el) {
  restoreTextNodes(el);
  delete el.dataset.sfAnon;
}

// Catch usernames that appear outside of links (story viewer header, sidebar, @mentions)
function anonymizeLooseText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node._sfOrig !== undefined) continue; // already handled
    const trimmed = node.textContent.trim();
    const m = trimmed.match(USERNAME_TEXT_RE);
    if (!m) continue;
    // Only replace usernames already catalogued from a link
    if (!userMap.has(m[1])) continue;
    node._sfOrig = node.textContent;
    node.textContent = node.textContent.replace(m[1], fakeUser(m[1]));
  }
}

// Instagram marks all user-generated text with dir="auto"
function anonymizeText(el) {
  if (el.dataset.sfAnon) return;
  const text = el.textContent.trim();
  if (text.length < 20) return; // skip short UI strings
  el.dataset.sfAnon = "1";
  el.dataset.sfOrigHtml = el.innerHTML;
  el.textContent = lorem(text);
}

function restoreText(el) {
  if (el.dataset.sfOrigHtml !== undefined) {
    el.innerHTML = el.dataset.sfOrigHtml;
    delete el.dataset.sfOrigHtml;
  }
  delete el.dataset.sfAnon;
}

function processSubtree(root) {
  if (!root.querySelectorAll) return;
  // 1. Anonymize username links (builds the userMap)
  root.querySelectorAll("a[href]").forEach(anonymizeLink);
  if (root.matches?.("a[href]")) anonymizeLink(root);
  // 2. Replace UGC text blocks with lorem ipsum
  root.querySelectorAll("[dir=auto]").forEach(anonymizeText);
  if (root.matches?.("[dir=auto]")) anonymizeText(root);
  // 3. Catch any remaining username text outside of links (uses userMap built in step 1)
  anonymizeLooseText(root);
}

function restoreSubtree(root) {
  if (!root.querySelectorAll) return;
  root.querySelectorAll("a[data-sf-anon]").forEach(restoreLink);
  root.querySelectorAll("[dir=auto][data-sf-anon]").forEach(restoreText);
  restoreTextNodes(root);
}

let anonObserver = null;

function startAnonymizing() {
  if (anonObserver) return; // already running
  anonObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) processSubtree(node);
      }
    }
  });
  anonObserver.observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) processSubtree(document.body);
}

function stopAnonymizing() {
  if (!anonObserver) return;
  anonObserver.disconnect();
  anonObserver = null;
  if (document.body) restoreSubtree(document.body);
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

// ── Demo photo replacement ────────────────────────────────────────────────
// Replaces Instagram CDN images with local demo assets for screenshot purposes.

const DEMO_PHOTOS = [
  chrome.runtime.getURL("assets/demo-1.jpg"),
  chrome.runtime.getURL("assets/demo-2.jpg"),
  chrome.runtime.getURL("assets/demo-3.jpg"),
  chrome.runtime.getURL("assets/demo-4.jpg"),
];
let demoIndex = 0;

function isCdnImage(img) {
  return img.src && (
    img.src.includes("cdninstagram.com") ||
    img.src.includes("fbcdn.net")
  );
}

function replaceDemoPhoto(img) {
  if (img.dataset.sfDemo) return;
  if (!isCdnImage(img)) return;
  img.dataset.sfDemo = "1";
  img.src = DEMO_PHOTOS[demoIndex % DEMO_PHOTOS.length];
  demoIndex++;
}

function replaceDemoPhotosIn(root) {
  if (root.querySelectorAll) {
    root.querySelectorAll("img").forEach(replaceDemoPhoto);
  }
  if (root.tagName === "IMG") replaceDemoPhoto(root);
}

const demoObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) replaceDemoPhotosIn(node);
    }
  }
});

demoObserver.observe(document.documentElement, { childList: true, subtree: true });

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
