import { $, syncCheckedClass } from "./dom.js";
import { initLocale, setLocale } from "./i18n.js";
import { load, save } from "./storage.js";

const THEME_KEY = "gristFactory.theme";
const THEMES = ["system", "light", "dark"];

/** "System" leaves data-theme off, so that the prefers-color-scheme media query decides. */
function applyTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

/** Makes the radio group `name` show `current` and report each change to `onChange`. */
function bindChoice(name, current, onChange) {
  const radios = Array.from(document.querySelectorAll(`input[name="${name}"]`));
  const sync = () => syncCheckedClass(radios, "is-checked", ".segmented-option");
  for (const radio of radios) {
    radio.checked = radio.value === current;
    radio.addEventListener("change", () => {
      onChange(radio.value);
      sync();
    });
  }
  sync();
}

/** The Réglages dialog: theme and language, both applied at once and remembered. */
export function initSettings() {
  const dialog = $("settings-dialog");
  $("settings-btn").addEventListener("click", () => dialog.showModal());
  $("settings-close-btn").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close(); // the backdrop is the dialog itself
  });

  const theme = load(THEME_KEY, (value) => THEMES.includes(value), "system");
  applyTheme(theme);
  bindChoice("theme-choice", theme, (value) => {
    applyTheme(value);
    save(THEME_KEY, value);
  });
  bindChoice("locale-choice", initLocale(), setLocale);
}
