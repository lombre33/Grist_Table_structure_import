/** The code the Export tab generated, and the button that copies it. */

import { byIds } from "./dom.js";
import { translate } from "./i18n.js";

const DONE_FOR_MS = 2000; // how long the button of a copy that worked shows a tick

export function createOutput() {
  const ui = byIds({ block: "export-output-block", code: "export-output", copyBtn: "copy-btn", copyStatus: "copy-status" });

  let tickTimer;

  /** The button shows a tick for a moment: it has no text to say that the copy worked. */
  function flashTick(on) {
    clearTimeout(tickTimer);
    ui.copyBtn.classList.toggle("is-done", on);
    if (on) tickTimer = setTimeout(() => flashTick(false), DONE_FOR_MS);
  }

  /** The outcome of Copier: a short confirmation, or what to do instead, which is a message since the user has to act on it. */
  function setCopyStatus(message, level = "hint") {
    ui.copyStatus.className = level === "hint" ? "hint" : `status status-${level}`;
    ui.copyStatus.textContent = message;
  }

  ui.copyBtn.addEventListener("click", async () => {
    ui.code.focus();
    ui.code.select();
    try {
      await navigator.clipboard.writeText(ui.code.value);
      setCopyStatus(translate("export.copy.done"));
      flashTick(true);
    } catch {
      setCopyStatus(translate("export.copy.fallback"), "info");
    }
  });

  return {
    show(code) {
      ui.code.value = code;
      ui.block.hidden = false;
      setCopyStatus("");
      flashTick(false);
    },
    hide() {
      ui.block.hidden = true;
    },
    /** Brings the code into view, once what has to be said about it has been written. */
    reveal() {
      ui.block.scrollIntoView({ block: "start" });
    },
  };
}
