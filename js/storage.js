/** Saved choices. Storage can be blocked in a cross-origin iframe such as a Grist widget: then nothing is saved, and nothing breaks. */

export function load(key, isValid, fallback) {
  try {
    const value = localStorage.getItem(key);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not saved
  }
}
