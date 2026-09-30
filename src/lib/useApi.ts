import { useEffect, useState } from "react";

/**
 * GET a JSON endpoint once per page load. Responses are shared across components and
 * route changes, so leaving and coming back to a page does not refetch.
 */

export type ApiState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: string };

const results = new Map<string, ApiState<unknown>>();
const pending = new Map<string, Promise<ApiState<unknown>>>();

function load(url: string): Promise<ApiState<unknown>> {
  let request = pending.get(url);
  if (!request) {
    request = fetch(url, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return { status: "ready", data: await res.json() } as const;
      })
      .catch((err: unknown) => ({ status: "error", error: err instanceof Error ? err.message : String(err) }) as const)
      .then((state) => {
        results.set(url, state);
        // A failure can be retried on the next mount; a success stays for the page load.
        if (state.status === "error") pending.delete(url);
        return state;
      });
    pending.set(url, request);
  }
  return request;
}

export function useApi<T>(url: string): ApiState<T> {
  const [state, setState] = useState<ApiState<unknown>>(() => results.get(url) ?? { status: "loading" });

  useEffect(() => {
    let live = true;
    const cached = results.get(url);
    if (cached?.status === "ready") {
      setState(cached);
      return;
    }
    setState({ status: "loading" });
    load(url).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [url]);

  return state as ApiState<T>;
}
