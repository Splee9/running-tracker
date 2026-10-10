import { lazy, Suspense, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { CursorSpotlight } from "./components/CursorSpotlight";
import { Nav } from "./components/Nav";
import { HireFiveLines } from "./components/Build/HireFiveLines";
import { Home } from "./components/Home";
import { Miles } from "./components/Miles";
import { NotFound } from "./components/NotFound";
import { NOT_FOUND_TITLE, PAGES } from "./lib/pages";
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

export default function App() {
  const path = usePathname();

  useEffect(() => {
    document.title = PAGES[path]?.title ?? NOT_FOUND_TITLE;
  }, [path]);

  return (
    <>
      <Analytics />
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
        ) : path === "/build/hire-five-lines" ? (
          <HireFiveLines />
        ) : (
          <NotFound />
        )}
      </main>
    </>
  );
}
