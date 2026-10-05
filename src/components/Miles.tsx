import { useEffect, useState } from "react";
import { Hero } from "./Hero";
import { RaceLog } from "./RaceLog";
import { CumulativeJourney } from "./CumulativeJourney";
import { MarathonTimes } from "./MarathonTimes";
import { Comparisons } from "./Comparisons";
import { Colophon } from "./Colophon";
import { Footer } from "./Footer";
import { data } from "../lib/data";
import { raceByKey } from "../lib/loggedRaces";
import type { RaceFocus } from "../lib/races";
import { useMilesYear, type MilesScope } from "../hooks/useMilesYear";

const YEARS = data.years.map((y) => y.year);

export function Miles() {
  const { selected, choose } = useMilesYear(YEARS);
  const [raceFocus, setRaceFocus] = useState<RaceFocus>(null);
  // Chart hovers must not collapse a race the list has opened.
  function focusRace(focus: RaceFocus) {
    setRaceFocus((current) => (focus?.pin === false && current?.pin ? current : focus));
  }

  function chooseYear(scope: MilesScope) {
    choose(scope);
    setRaceFocus(null);
  }

  // A related race opened from a card follows that race's year. Chart hovers do
  // not, so scanning markers does not rescope the hero under the cursor.
  useEffect(() => {
    if (!raceFocus?.pin) return;
    const race = raceByKey(raceFocus.key);
    if (!race) return;
    if (selected !== "lifetime" && selected !== race.year) choose(race.year);
    // choose only writes state and the URL; selected is read for the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceFocus]);

  return (
    <>
      <Hero selected={selected} onChoose={chooseYear} />
      <RaceLog selected={selected} raceFocus={raceFocus} onFocusRace={focusRace} />
      <CumulativeJourney raceFocus={raceFocus} onFocusRace={focusRace} />
      <MarathonTimes raceFocus={raceFocus} onFocusRace={focusRace} />
      <Comparisons />
      <Colophon />
      <Footer />
    </>
  );
}
