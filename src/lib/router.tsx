import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { planNavigation } from "./navigation";

/**
 * A two-route site doesn't need a router library: the pathname lives in
 * history, `navigate` pushes to it, and components re-render on popstate.
 * Vercel serves each route's static HTML file (see vercel.json cleanUrls), and
 * unknown paths fall back to index.html, so deep links like /training resolve
 * here on first load too.
 */

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

const normalize = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

const getPathname = () => normalize(window.location.pathname);
const getSearch = () => window.location.search;

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname);
}

/** The raw `location.search`, including the leading `?`, or `""`. Updates on `popstate`. */
export function useSearchString(): string {
  return useSyncExternalStore(subscribe, getSearch);
}

export function navigate(to: string) {
  const { push, scroll } = planNavigation(
    {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    },
    to,
  );
  if (push) {
    window.history.pushState(null, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  if (scroll) {
    // "instant" overrides the global smooth scroll so a new page starts at the top.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** An <a> that navigates client-side, but still behaves natively for new-tab clicks. */
export function Link({ href, onClick, ...rest }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      rest.target
    ) {
      return;
    }
    e.preventDefault();
    navigate(href);
  }
  return <a {...rest} href={href} onClick={handleClick} />;
}
