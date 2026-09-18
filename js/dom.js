/**
 * Minimal, safe DOM construction helpers.
 *
 * Deliberately the only place in this codebase that builds DOM nodes, so
 * that a security review of untrusted-data handling only needs to look
 * here: every value ends up as a text node (via `textContent` / child
 * strings), never through `innerHTML`, so pasted table/column names can
 * never be interpreted as markup.
 */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
