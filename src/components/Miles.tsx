import { useState } from "react";
import { Hero } from "./Hero";
import { YearChart } from "./YearChart";
import { CumulativeJourney } from "./CumulativeJourney";
import { MarathonTimes } from "./MarathonTimes";
import { Comparisons } from "./Comparisons";
import { Colophon } from "./Colophon";
import { Footer } from "./Footer";
import type { RaceFocus } from "../lib/races";

export function Miles() {
  const [raceFocus, setRaceFocus] = useState<RaceFocus>(null);
  // Chart hovers must not collapse a race the list has opened.
  function focusRace(focus: RaceFocus) {
    setRaceFocus((current) => (focus?.pin === false && current?.pin ? current : focus));
  }
  return (
    <>
      <Hero />
      <YearChart raceFocus={raceFocus} onFocusRace={focusRace} />
      <CumulativeJourney raceFocus={raceFocus} onFocusRace={focusRace} />
      <MarathonTimes raceFocus={raceFocus} onFocusRace={focusRace} />
      <Comparisons />
      <Colophon />
      <Footer />
    </>
  );
}
