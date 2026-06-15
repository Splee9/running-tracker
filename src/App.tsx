import { CursorSpotlight } from "./components/CursorSpotlight";
import { Hero } from "./components/Hero";
import { YearChart } from "./components/YearChart";
import { CumulativeJourney } from "./components/CumulativeJourney";
import { MarathonTimes } from "./components/MarathonTimes";
import { Comparisons } from "./components/Comparisons";
import { Colophon } from "./components/Colophon";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <CursorSpotlight />
      <main>
        <Hero />
        <YearChart />
        <CumulativeJourney />
        <MarathonTimes />
        <Comparisons />
        <Colophon />
        <Footer />
      </main>
    </>
  );
}
