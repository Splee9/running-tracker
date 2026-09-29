import { lazy, Suspense, useEffect } from "react";
import { CursorSpotlight } from "./components/CursorSpotlight";
import { Nav } from "./components/Nav";
import { Home } from "./components/Home";
import { Miles } from "./components/Miles";
import { NotFound } from "./components/NotFound";
import { usePathname } from "./lib/router";

// The weekly series is ~370 KB of JSON; keep it out of the home page bundle.
const Training = lazy(() => import("./components/Training").then((m) => ({ default: m.Training })));
// Same for the activity log (~700 KB of JSON).
const ActivityLookup = lazy(() =>
  import("./components/ActivityLookup").then((m) => ({ default: m.ActivityLookup })),
);
// Chicago tracker with its own data bundle.
const ChicagoTracker = lazy(() =>
  import("./components/Chicago/ChicagoTracker").then((m) => ({ default: m.ChicagoTracker })),
);

const TITLES: Record<string, string> = {
  "/": "Spencer Lee — Projects",
  "/miles": "Miles — a running log",
  "/training": "Training variability — Miles",
  "/training/chicago": "Chicago Marathon 2026 — Training tracker",
  "/activity-lookup": "Activity lookup — Miles",
};

export default function App() {
  const path = usePathname();

  useEffect(() => {
    document.title = TITLES[path] ?? "Not found — Spencer Lee";
  }, [path]);

  return (
    <>
      <CursorSpotlight />
      <Nav />
      <main>
        {path === "/" ? (
          <Home />
        ) : path === "/miles" ? (
          <Miles />
        ) : path === "/training" ? (
          <Suspense fallback={null}>
            <Training />
          </Suspense>
        ) : path === "/training/chicago" ? (
          <Suspense fallback={null}>
            <ChicagoTracker />
          </Suspense>
        ) : path === "/activity-lookup" ? (
          <Suspense fallback={null}>
            <ActivityLookup />
          </Suspense>
        ) : (
          <NotFound />
        )}
      </main>
    </>
  );
}
