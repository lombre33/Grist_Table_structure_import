/** The code the Export tab generated, and the button that copies it. */

import { byIds } from "./dom.js";
import { t } from "./i18n.js";

export function createOutput() {
  const ui = byIds({ block: "export-output-block", code: "export-output", copyBtn: "copy-btn", copyStatus: "copy-status" });

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
      setCopyStatus(t("export.copy.done"));
    } catch {
      setCopyStatus(t("export.copy.fallback"), "info");
    }
  });

  return {
    show(code) {
      ui.code.value = code;
      ui.block.hidden = false;
      setCopyStatus("");
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
