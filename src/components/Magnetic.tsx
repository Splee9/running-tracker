import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

interface Props {
  children: ReactNode;
  /** How strongly the element follows the cursor (0–1). */
  strength?: number;
  className?: string;
}

/**
 * Wraps an element so it's gently pulled toward the cursor on hover, then
 * springs back on leave. Disabled under prefers-reduced-motion.
 */
export function Magnetic({ children, strength = 0.3, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 15, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 200, damping: 15, mass: 0.3 });

  function handleMove(e: React.PointerEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, display: "inline-block" }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.span>
  );
}
