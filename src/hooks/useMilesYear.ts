import { useEffect, useRef, useState } from "react";
import { readMilesYear } from "../lib/focus";
import { useSearchString } from "../lib/router";

export type MilesScope = number | "lifetime";

/**
 * The Miles page's one year selection, mirrored to `?year=`. The hero number,
 * the year bars, and the race log all read it.
 */
export function useMilesYear(years: readonly number[]) {
  const search = useSearchString();
  const writtenSearch = useRef(search);
  const [selected, setSelected] = useState<MilesScope>(() => readMilesYear(window.location.search, years));

  useEffect(() => {
    if (search === writtenSearch.current) return;
    writtenSearch.current = search;
    setSelected(readMilesYear(search, years));
  }, [search, years]);

  function choose(scope: MilesScope) {
    setSelected(scope);
    const params = new URLSearchParams(window.location.search);
    if (scope === "lifetime") params.delete("year");
    else params.set("year", String(scope));
    const qs = params.toString();
    const nextSearch = qs ? `?${qs}` : "";
    const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (url !== current) {
      writtenSearch.current = nextSearch;
      window.history.replaceState(window.history.state, "", url);
    }
  }

  return { selected, choose };
}
