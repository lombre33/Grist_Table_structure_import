import { initTheme, setTheme } from "./theme.js";
import { initLocale, setLocale } from "./i18n.js";
import { syncCheckedClass } from "./dom.js";

/**
 * Wires the Réglages dialog: appearance (theme) and language choices, plus
 * the static Crédits section already in index.html. Both choices are
 * applied immediately on load (initTheme/initLocale), before the dialog is
 * ever opened, so the chrome always reflects the stored choice from the
 * first paint.
 */
export function initSettings() {
  const dialog = document.getElementById("settings-dialog");
  const openBtn = document.getElementById("settings-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const themeRadios = Array.from(document.querySelectorAll('input[name="theme-choice"]'));
  const localeRadios = Array.from(document.querySelectorAll('input[name="locale-choice"]'));

  setChecked(themeRadios, initTheme());
  setChecked(localeRadios, initLocale());
  syncCheckedClass(themeRadios, "is-checked", ".segmented-option");
  syncCheckedClass(localeRadios, "is-checked", ".segmented-option");

  openBtn.addEventListener("click", () => dialog.showModal());
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  for (const radio of themeRadios) {
    radio.addEventListener("change", () => {
      setTheme(radio.value);
      syncCheckedClass(themeRadios, "is-checked", ".segmented-option");
    });
  }
  for (const radio of localeRadios) {
    radio.addEventListener("change", () => {
      setLocale(radio.value);
      syncCheckedClass(localeRadios, "is-checked", ".segmented-option");
    });
  }
}

function setChecked(radios, value) {
  for (const radio of radios) radio.checked = radio.value === value;
}
