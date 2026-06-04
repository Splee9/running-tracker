import { CursorSpotlight } from "./components/CursorSpotlight";
import { Hero } from "./components/Hero";
import { YearChart } from "./components/YearChart";
import { CumulativeJourney } from "./components/CumulativeJourney";
import { Comparisons } from "./components/Comparisons";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <CursorSpotlight />
      <main>
        <Hero />
        <YearChart />
        <CumulativeJourney />
        <Comparisons />
        <Footer />
      </main>
    </>
  );
}
