import { translate } from "./i18n.js";

const GRIST_CALL_TIMEOUT_MS = 8000; // long enough for a big document on a slow server, short enough that a Grist that does not answer is reported rather than waited for
const GRIST_WRITE_TIMEOUT_MS = 120000; // a write to a big document takes longer than a read, and a late answer is not an error: the user is told what to check

/** `promise` with a deadline: rejected with the text of `messageKey` when `ms` have passed. */
function withDeadline(promise, ms, messageKey) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(translate(messageKey))), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** `promise`, a read of Grist, with a deadline: Grist does not always answer. */
export const callGrist = (promise) => withDeadline(promise, GRIST_CALL_TIMEOUT_MS, "error.timeout");

/** `promise`, a write to Grist, with a long deadline; when it passes, the write may still go through, which the message says. */
export const writeGrist = (promise) => withDeadline(promise, GRIST_WRITE_TIMEOUT_MS, "error.writeTimeout");

/** What Grist answers, in English whatever the language of the page, that is told in the language of the page, with what it said. */
const KNOWN_ERRORS = [[/no write access/i, "error.noWriteAccess"]];

/** The text to show for a caught error, which is also logged for whoever reports the problem. */
export function reportError(err) {
  console.error(err);
  const message = err?.message || String(err);
  const details = err?.details || err?.data?.details;
  const text = details && details !== message ? `${message} (${details})` : message;
  const known = KNOWN_ERRORS.find(([pattern]) => pattern.test(text));
  return known ? translate(known[1], { error: text }) : text;
}
