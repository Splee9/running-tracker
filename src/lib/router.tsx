import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * The pathname lives in history, `navigate` pushes to it, and components
 * re-render on popstate. Vercel serves each route's static HTML file (see
 * vercel.json cleanUrls), and unknown paths fall back to index.html, so deep
 * links like /chicago and /lookup?q=… resolve here on first load too.
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

/** Path plus query and hash, with a trailing slash stripped from the path. */
function hrefOf(to: string, base: string): string {
  const url = new URL(to, base);
  return `${normalize(url.pathname)}${url.search}${url.hash}`;
}

export function navigate(to: string) {
  const next = hrefOf(to, window.location.href);
  const current = hrefOf(window.location.href, window.location.href);
  if (next !== current) {
    window.history.pushState(null, "", next);
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
