/** Looking for an item of a list by what the user types: case, accents and the order of the words do not matter. */

const simplify = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** A function that tells whether a text holds every word of `query`; a query without a word is held by every text. */
export function queryMatcher(query) {
  const words = simplify(query).split(/\s+/).filter(Boolean);
  return (text) => {
    const simple = simplify(text);
    return words.every((word) => simple.includes(word));
  };
}
