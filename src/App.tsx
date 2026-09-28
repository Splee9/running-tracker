import { lazy, Suspense, useEffect } from "react";
import { CursorSpotlight } from "./components/CursorSpotlight";
import { Hero } from "./components/Hero";
import { YearChart } from "./components/YearChart";
import { CumulativeJourney } from "./components/CumulativeJourney";
import { MarathonTimes } from "./components/MarathonTimes";
import { Comparisons } from "./components/Comparisons";
import { Colophon } from "./components/Colophon";
import { Footer } from "./components/Footer";
import { NotFound } from "./components/NotFound";
import { usePathname } from "./lib/router";

// The weekly series is ~370 KB of JSON; keep it out of the home page bundle.
const Training = lazy(() => import("./components/Training").then((m) => ({ default: m.Training })));

const TITLES: Record<string, string> = {
  "/": "Miles — a running log",
  "/training": "Training variability — Miles",
};

function Home() {
  return (
    <>
      <Hero />
      <YearChart />
      <CumulativeJourney />
      <MarathonTimes />
      <Comparisons />
      <Colophon />
      <Footer />
    </>
  );
}

export default function App() {
  const path = usePathname();

  useEffect(() => {
    document.title = TITLES[path] ?? "Not found — Miles";
  }, [path]);

  return (
    <>
      <CursorSpotlight />
      <main>
        {path === "/" ? (
          <Home />
        ) : path === "/training" ? (
          <Suspense fallback={null}>
            <Training />
          </Suspense>
        ) : (
          <NotFound />
        )}
      </main>
    </>
  );
}
