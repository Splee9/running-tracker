import { useState, useRef, useEffect } from "react";
import { Link, usePathname } from "../lib/router";
import styles from "./Nav.module.css";

const NAV_ITEMS = [
  { href: "/miles", label: "Miles" },
  { href: "/training", label: "Variability" },
  { href: "/training/chicago", label: "Chicago" },
  { href: "/activity-lookup", label: "Lookup" },
];

export function Nav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <nav ref={navRef} className={styles.nav} aria-label="Primary navigation">
      <Link href="/" className={styles.brand}>
        Spencer Lee
      </Link>

      <button
        type="button"
        className={styles.menuToggle}
        onClick={() => setIsMenuOpen((open) => !open)}
        aria-expanded={isMenuOpen}
        aria-controls="primary-menu"
      >
        Menu
        <span className={styles.caret} aria-hidden>
          ▾
        </span>
      </button>

      <div id="primary-menu" className={`${styles.menu} ${isMenuOpen ? styles.menuOpen : ""}`}>
        {NAV_ITEMS.map((item) => {
          const current = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.menuItem} ${current ? styles.menuItemActive : ""}`}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
