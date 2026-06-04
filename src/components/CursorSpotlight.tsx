import { motion, useReducedMotion, useTransform } from "framer-motion";
import { usePointer } from "../hooks/usePointer";
import styles from "./CursorSpotlight.module.css";

/**
 * A soft radial glow that trails the cursor across the whole page — the
 * "alive" polish layer. Pointer-events: none, so it never blocks interaction.
 * Rendered as nothing under prefers-reduced-motion.
 */
export function CursorSpotlight() {
  const reduce = useReducedMotion();
  const { x, y } = usePointer();

  const background = useTransform(
    [x, y],
    ([lx, ly]: number[]) =>
      `radial-gradient(460px circle at ${lx}px ${ly}px, rgba(26,26,26,0.10), transparent 72%)`,
  );

  if (reduce) return null;
  return <motion.div aria-hidden className={styles.spotlight} style={{ background }} />;
}
