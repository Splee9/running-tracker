/** Whole-number miles with thousands separators: 12681 → "12,681". */
export const fmt = (n: number): string => Math.round(n).toLocaleString();

/** One decimal place: 7.05 → "7.1". */
export const fmt1 = (n: number): string =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** ISO date → "Apr 23, 2018" (parsed as local, no timezone drift). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
