import { useState, useRef, useEffect } from "react";
import { Link, usePathname } from "../lib/router";
import styles from "./Nav.module.css";

export function Nav() {
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsTrainingOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsTrainingOpen(false);
      }
    }

    if (isTrainingOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isTrainingOpen]);

  useEffect(() => {
    setIsTrainingOpen(false);
  }, [pathname]);

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.brand}>
        Spencer Lee
      </Link>
      <div className={styles.menu}>
        <div className={styles.dropdown} ref={dropdownRef}>
          <button
            className={styles.dropdownToggle}
            onClick={() => setIsTrainingOpen(!isTrainingOpen)}
            aria-expanded={isTrainingOpen}
            aria-haspopup="true"
          >
            Training <span className={styles.caret}>▾</span>
          </button>
          {isTrainingOpen && (
            <div className={styles.dropdownMenu}>
              <Link href="/miles" className={styles.dropdownItem}>
                Running log
              </Link>
              <Link href="/training" className={styles.dropdownItem}>
                Training variability
              </Link>
              <Link href="/activity-lookup" className={styles.dropdownItem}>
                Activity lookup
              </Link>
              <Link href="/training/chicago" className={styles.dropdownItem}>
                Chicago build
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
