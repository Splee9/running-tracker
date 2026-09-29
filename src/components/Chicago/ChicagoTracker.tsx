import { Hero } from "./Hero";
import { PhaseTimeline } from "./PhaseTimeline";
import { WeeklyLoad } from "./WeeklyLoad";
import { CrossBuild } from "./CrossBuild";
import { TrainingVariability } from "./TrainingVariability";
import { Colophon } from "./Colophon";
import { Footer } from "./Footer";

export function ChicagoTracker() {
  return (
    <>
      <Hero />
      <PhaseTimeline />
      <WeeklyLoad />
      <CrossBuild />
      <TrainingVariability />
      <Colophon />
      <Footer />
    </>
  );
}
