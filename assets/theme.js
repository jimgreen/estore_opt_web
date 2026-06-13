const ESTORE_THEMES = ["aurora", "purple", "workbench"];

function currentTheme() {
  const saved = localStorage.getItem("estore_theme") || "aurora";
  return ESTORE_THEMES.includes(saved) ? saved : "aurora";
}

function applyTheme() {
  const theme = currentTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-select]").forEach((select) => {
    select.value = theme;
  });
}

applyTheme();

function bindThemeControls() {
  applyTheme();
  document.body.addEventListener("change", (event) => {
    const select = event.target.closest("[data-theme-select]");
    if (!select) return;
    localStorage.setItem("estore_theme", ESTORE_THEMES.includes(select.value) ? select.value : "aurora");
    applyTheme();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindThemeControls);
} else {
  bindThemeControls();
}

window.applyTheme = applyTheme;
