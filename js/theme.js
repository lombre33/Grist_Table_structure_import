/**
 * Three-way theme choice (système/clair/sombre), applied via a `data-theme`
 * attribute on <html> — see style.css. "Système" means no attribute at all,
 * so the `prefers-color-scheme` media query decides. Persisted in
 * localStorage on a best-effort basis: inside a Grist custom widget's
 * (cross-origin, iframed) page, storage access can be partitioned or
 * blocked by the browser, so every access is wrapped and a failure just
 * means the choice resets to "système" next time, never a broken widget.
 */

const STORAGE_KEY = "gristFactory.theme";
const VALID = new Set(["system", "light", "dark"]);

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID.has(value) ? value : "system";
  } catch {
    return "system";
  }
}

function writeStored(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Best effort only — see module comment above.
  }
}

function apply(value) {
  if (value === "light" || value === "dark") {
    document.documentElement.setAttribute("data-theme", value);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function initTheme() {
  const value = readStored();
  apply(value);
  return value;
}

export function setTheme(value) {
  const next = VALID.has(value) ? value : "system";
  writeStored(next);
  apply(next);
}
