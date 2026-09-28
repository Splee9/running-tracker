import { Hero } from "./Hero";
import { YearChart } from "./YearChart";
import { CumulativeJourney } from "./CumulativeJourney";
import { MarathonTimes } from "./MarathonTimes";
import { Comparisons } from "./Comparisons";
import { Colophon } from "./Colophon";
import { Footer } from "./Footer";

export function Miles() {
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
