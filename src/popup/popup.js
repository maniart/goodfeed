// SofterFeed — popup script
// Reads/writes chrome.storage.sync and renders feature toggles.

// Feature definitions — expand this array as features are added.
const FEATURES = [
  { key: "grayscale", label: "Grayscale", description: "Removes all color from the page" },
  { key: "blurImages", label: "Blur media", description: "Blurs photos & videos — click to reveal" },
  { key: "disableAutoplay", label: "No autoplay", description: "Videos won't play until revealed" },
];

const controls = document.getElementById("controls");

function renderFeatures(settings) {
  controls.innerHTML = "";
  for (const f of FEATURES) {
    const row = document.createElement("div");
    row.className = "feature-row";
    row.innerHTML = `
      <div class="feature-label">
        ${f.label}
        ${f.description ? `<small>${f.description}</small>` : ""}
      </div>
      <label class="toggle">
        <input type="checkbox" data-key="${f.key}" ${settings[f.key] !== false ? "checked" : ""} />
        <span class="slider"></span>
      </label>
    `;
    controls.appendChild(row);
  }

  controls.querySelectorAll("input[data-key]").forEach((el) => {
    el.addEventListener("change", () => {
      chrome.storage.sync.set({ [el.dataset.key]: el.checked });
    });
  });
}

chrome.storage.sync.get(null, (settings) => {
  renderFeatures(settings);
});
