// A classic script in <head>, so that the saved theme and language show from the first paint instead of
// after the modules have loaded. js/settings.js and js/i18n.js read the same keys and take over from there.
try {
  const theme = localStorage.getItem("gristFactory.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  const locale = localStorage.getItem("gristFactory.locale");
  if (locale === "fr" || locale === "en") document.documentElement.lang = locale;
  if (locale === "en") document.documentElement.dataset.pendingLocale = ""; // the markup is French: hidden until js/i18n.js has translated it
} catch {
  // storage blocked, as it can be in a cross-origin iframe: the defaults stand
}
