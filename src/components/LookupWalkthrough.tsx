import { useState } from "react";
import { Chip } from "./Chip";
import { Link } from "../lib/router";
import { lookupHref, lookupWalkthrough, WALKTHROUGH_ASKS } from "../lib/lookupWalkthrough";
import styles from "./LookupWalkthrough.module.css";

export function LookupWalkthrough() {
  const [query, setQuery] = useState<string>(WALKTHROUGH_ASKS[0]);
  const walk = lookupWalkthrough(query);

  return (
    <div className={styles.walk} aria-label="Ask, shortlist, and why">
      <p className={styles.stepLabel}>Ask</p>
      <div className={styles.asks} role="group" aria-label="Sample asks from Lookup">
        {WALKTHROUGH_ASKS.map((ask) => (
          <Chip key={ask} active={ask === query} onClick={() => setQuery(ask)}>
            {ask}
          </Chip>
        ))}
      </div>

      <p className={styles.stepLabel}>Shortlist</p>
      {walk.parts.length > 0 && (
        <div className={styles.readAs}>
          <span>Read as</span>
          {walk.parts.map((part) => (
            <span key={part.key} className={styles.readPart}>
              <span className={styles.readLabel}>{part.label}</span>
              {part.value}
            </span>
          ))}
        </div>
      )}
      <p className={styles.line}>{walk.shortlist}</p>

      <p className={styles.stepLabel}>Why</p>
      <p className={styles.line}>{walk.why}</p>

      <Link href={lookupHref(query)} className={styles.open}>
        Open this ask in Lookup <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
