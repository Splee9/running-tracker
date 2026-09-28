import { Magnetic } from "./Magnetic";
import styles from "./Chip.module.css";

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Magnetic strength={0.25}>
      <button
        type="button"
        className={`${styles.chip} ${active ? styles.chipActive : ""}`}
        onClick={onClick}
        aria-pressed={active}
      >
        {children}
      </button>
    </Magnetic>
  );
}
