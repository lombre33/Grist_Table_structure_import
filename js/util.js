import { translate } from "./i18n.js";

const GRIST_CALL_TIMEOUT_MS = 8000; // long enough for a big document on a slow server, short enough that a Grist that does not answer is reported rather than waited for

/** `promise`, a call to Grist, with a deadline: Grist does not always answer. */
export function callGrist(promise) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(translate("error.timeout"))), GRIST_CALL_TIMEOUT_MS);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** The text to show for a caught error, which is also logged for whoever reports the problem. */
export function reportError(err) {
  console.error(err);
  const message = err?.message || String(err);
  const details = err?.details || err?.data?.details;
  return details && details !== message ? `${message} (${details})` : message;
}
