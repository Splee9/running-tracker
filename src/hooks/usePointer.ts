import { useEffect } from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";

/**
 * Spring-smoothed pointer position in viewport coordinates.
 * Used by the cursor spotlight; returns motion values so consumers animate
 * without re-rendering on every mousemove.
 */
export function usePointer(): { x: MotionValue<number>; y: MotionValue<number> } {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 120, damping: 20, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 120, damping: 20, mass: 0.4 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [x, y]);

  return { x: sx, y: sy };
}
