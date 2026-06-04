import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { fmt } from "../lib/format";

interface Props {
  value: number;
  format?: (n: number) => string;
  /** Animation duration in seconds. */
  duration?: number;
}

/**
 * Counts from its previous value to the new one whenever `value` changes.
 * On first mount it counts up from 0, giving the hero its "count-up on load"
 * feel and the interactive scope readout a smooth transition on selection.
 * Respects prefers-reduced-motion (snaps instantly).
 */
export function AnimatedNumber({ value, format = fmt, duration = 0.8 }: Props) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplay,
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <>{format(display)}</>;
}
