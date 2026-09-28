import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * A two-route site doesn't need a router library: the pathname lives in
 * history, `navigate` pushes to it, and components re-render on popstate.
 * Netlify serves index.html for every path (see netlify.toml), so deep links
 * like /training resolve here on first load too.
 */

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

const normalize = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

const getPathname = () => normalize(window.location.pathname);

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname);
}

export function navigate(to: string) {
  if (normalize(to) !== getPathname()) {
    window.history.pushState(null, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  // "instant" overrides the global smooth scroll so a new page starts at the top.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
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
