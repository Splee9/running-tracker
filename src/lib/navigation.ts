/**
 * Pure URL decisions for the history router. No `window`, so tests can call it.
 */

const normalize = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

export type LocationParts = { pathname: string; search: string; hash: string };

function splitHref(to: string): LocationParts {
  const url = new URL(to, "http://running-tracker.local");
  return { pathname: normalize(url.pathname), search: url.search, hash: url.hash };
}

/**
 * Whether `to` should push a history entry, and whether the page should jump
 * to the top. A new search on the same path pushes and does not scroll, so a
 * week link can land without throwing away the reader's place on Back.
 */
export function planNavigation(current: LocationParts, to: string): { push: boolean; scroll: boolean } {
  const next = splitHref(to);
  const pathChanged = next.pathname !== normalize(current.pathname);
  const changed = pathChanged || next.search !== current.search || next.hash !== current.hash;
  return { push: changed, scroll: pathChanged };
}
