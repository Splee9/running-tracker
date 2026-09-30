// How Activity Lookup reads an ask: the same parser and ranking rules as the live page.
// This describes the shortlist. It does not invent activity rows or membership scores.

import {
  classifyIntent,
  MEMBERSHIP_DEMOTE_BELOW,
  rankGradeFor,
  type IntentClassification,
} from "./activitySearch.ts";
import { interpretationParts, primaryBranch, type InterpretationPart } from "./lookupView.ts";

/** Asks copied from the chips on the Lookup page. */
export const WALKTHROUGH_ASKS = ["easy runs last week", "longest run", "hilly ride"] as const;

/** Same floor the live re-rank uses, as a percent for display. */
export const MEMBERSHIP_FLOOR_PERCENT = Math.round(MEMBERSHIP_DEMOTE_BELOW * 100);

export type Walkthrough = {
  query: string;
  parts: InterpretationPart[];
  shortlist: string;
  why: string;
};

export function lookupHref(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `/lookup?${params.toString()}`;
}

export function lookupWalkthrough(query: string, now?: Date): Walkthrough {
  const classification = classifyIntent(query, now);
  return {
    query,
    parts: interpretationParts(classification, null),
    shortlist: shortlistLine(classification, query),
    why: whyLine(classification, query),
  };
}

function floorPercent(): number {
  return MEMBERSHIP_FLOOR_PERCENT;
}

function shortlistLine(c: IntentClassification, query: string): string {
  const branch = primaryBranch(c);
  const grade = rankGradeFor(query, c, true);
  if (branch === "metric") {
    return "Code filters this list and sorts it. Those rows stay in that order.";
  }
  if (c.isDeterministic && (branch === "date-list" || branch === "place-list")) {
    return "Sport, workout, date, and place filters settle the shortlist in code. Those rows stay in code order.";
  }
  if (grade) {
    const by = grade.label === "climbing" ? "climbing per kilometre" : grade.label;
    return `Keyword and fuzzy hits stay open. Rows at or above ${floorPercent()}% membership come first, ordered by ${by}.`;
  }
  if (!c.isDeterministic) {
    return "Leftover words keep the shortlist open. Membership is the order.";
  }
  return "Code assembles the shortlist from the parsed ask.";
}

function whyLine(c: IntentClassification, query: string): string {
  const branch = primaryBranch(c);
  const grade = rankGradeFor(query, c, true);
  const floor = floorPercent();
  if (branch === "metric" || (c.isDeterministic && (branch === "date-list" || branch === "place-list"))) {
    return `Jev's membership is a noul: the probability a row is what the ask means. Lookup can show that probability beside a row. List order stays with code. Open Lookup for the real rows.`;
  }
  if (grade) {
    return "The live page scores each shortlisted activity and shows that probability on the row. Real rows open in Lookup.";
  }
  return `Jev's membership noul orders an open shortlist. Under ${floor}% ranks later and stays listed. Open Lookup for the real rows.`;
}
