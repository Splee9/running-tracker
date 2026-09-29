// Holidays and seasons from the activity's calendar date. Northern Hemisphere,
// meteorological seasons. No vault fields: December 25 is Christmas whether or
// not the export says so. Query phrases settle here so Jev is not asked to invent a holiday.

export const HOLIDAY_TAGS = ["christmas", "new years day", "thanksgiving", "july 4"] as const;
export const SEASON_TAGS = ["winter", "spring", "summer", "fall"] as const;
export type HolidayTag = (typeof HOLIDAY_TAGS)[number];
export type SeasonTag = (typeof SEASON_TAGS)[number];
export type CalendarTag = HolidayTag | SeasonTag;

const LABELS: Record<CalendarTag, string> = {
  christmas: "Christmas",
  "new years day": "New Year's Day",
  thanksgiving: "Thanksgiving",
  "july 4": "July 4",
  winter: "winter",
  spring: "spring",
  summer: "summer",
  fall: "fall",
};

type CalendarParts = { month: number; day: number; weekday: number };

/** Month is 0-based. Weekday is the UTC weekday of the calendar date, so a timezone cannot move it. */
function calendarParts(startDateLocal: string): CalendarParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDateLocal);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { month, day, weekday: new Date(Date.UTC(year, month, day)).getUTCDay() };
}

/** US Thanksgiving: the fourth Thursday in November. */
function isUsThanksgiving(parts: CalendarParts): boolean {
  return parts.month === 10 && parts.weekday === 4 && parts.day >= 22 && parts.day <= 28;
}

export function seasonOf(startDateLocal: string): SeasonTag | null {
  const parts = calendarParts(startDateLocal);
  if (!parts) return null;
  const { month } = parts;
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

export function holidayOf(startDateLocal: string): HolidayTag | null {
  const parts = calendarParts(startDateLocal);
  if (!parts) return null;
  if (parts.month === 11 && parts.day === 25) return "christmas";
  if (parts.month === 0 && parts.day === 1) return "new years day";
  if (parts.month === 6 && parts.day === 4) return "july 4";
  if (isUsThanksgiving(parts)) return "thanksgiving";
  return null;
}

export function calendarLabel(tag: string): string {
  return LABELS[tag as CalendarTag] ?? tag;
}

export function isSeasonTag(tag: string): boolean {
  return (SEASON_TAGS as readonly string[]).includes(tag);
}

/**
 * Index tokens for one activity. Distinctive on purpose: "day" and "new" are not
 * tags, or every activity would match them. The query path settles the phrase.
 */
export function calendarSearchTags(startDateLocal: string): string[] {
  const tags: string[] = [];
  const season = seasonOf(startDateLocal);
  if (season) tags.push(season);
  if (season === "fall") tags.push("autumn");
  const holiday = holidayOf(startDateLocal);
  if (holiday) tags.push(holiday);
  if (holiday === "new years day") tags.push("newyears");
  if (holiday === "july 4") tags.push("july4", "independence");
  return tags;
}

export function matchesCalendarTag(startDateLocal: string, tag: string): boolean {
  if (tag === "autumn") return seasonOf(startDateLocal) === "fall";
  if (tag === "newyears" || tag === "july4") return calendarSearchTags(startDateLocal).includes(tag);
  const season = seasonOf(startDateLocal);
  const holiday = holidayOf(startDateLocal);
  return tag === season || tag === holiday;
}

// Longest phrase wins. Holidays are listed before seasons so "Christmas" beats a
// one-word season when both could start at the same token.
const PHRASES: { tag: CalendarTag; phrase: string[] }[] = [
  { tag: "new years day", phrase: ["new", "year", "s", "day"] },
  { tag: "new years day", phrase: ["new", "years", "day"] },
  { tag: "new years day", phrase: ["new", "year", "day"] },
  { tag: "new years day", phrase: ["new", "year", "s"] },
  { tag: "new years day", phrase: ["new", "years"] },
  { tag: "new years day", phrase: ["new", "year"] },
  { tag: "july 4", phrase: ["fourth", "of", "july"] },
  { tag: "july 4", phrase: ["4th", "of", "july"] },
  { tag: "july 4", phrase: ["independence", "day"] },
  { tag: "july 4", phrase: ["july", "4th"] },
  { tag: "july 4", phrase: ["july", "4"] },
  { tag: "christmas", phrase: ["christmas", "day"] },
  { tag: "christmas", phrase: ["christmas"] },
  { tag: "thanksgiving", phrase: ["thanksgiving"] },
  { tag: "winter", phrase: ["winter"] },
  { tag: "spring", phrase: ["spring"] },
  { tag: "summer", phrase: ["summer"] },
  { tag: "fall", phrase: ["fall"] },
  { tag: "fall", phrase: ["autumn"] },
];
PHRASES.sort((a, b) => b.phrase.length - a.phrase.length);

function phraseAt(tokens: string[], index: number, phrase: string[], consumed: Set<number>): boolean {
  return phrase.every((word, offset) => !consumed.has(index + offset) && tokens[index + offset] === word);
}

function isHolidayTag(tag: string): boolean {
  return (HOLIDAY_TAGS as readonly string[]).includes(tag);
}

/**
 * Holiday and season phrases in the query. A holiday wins over a season when both
 * are present ("winter Christmas" is Christmas). Every matched phrase is consumed
 * so the leftover season does not fall through to Jev. Leading "on" / "the" sticks
 * to the phrase ("on Christmas").
 */
export function parseCalendarPhrase(
  tokens: string[],
  consumed: Set<number>,
): { tag: CalendarTag | null; consumedIndices: Set<number> } {
  const consumedIndices = new Set<number>();
  const taken = new Set(consumed);
  let tag: CalendarTag | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (taken.has(i)) continue;
    const hit = PHRASES.find((entry) => phraseAt(tokens, i, entry.phrase, taken));
    if (!hit) continue;
    if (!tag || (isSeasonTag(tag) && isHolidayTag(hit.tag))) tag = hit.tag;
    hit.phrase.forEach((_, offset) => {
      consumedIndices.add(i + offset);
      taken.add(i + offset);
    });
    let cursor = i - 1;
    while (cursor >= 0 && (consumed.has(cursor) || consumedIndices.has(cursor))) cursor--;
    if (cursor >= 0 && ["a", "an", "the", "every"].includes(tokens[cursor])) {
      consumedIndices.add(cursor);
      taken.add(cursor);
      cursor--;
      while (cursor >= 0 && (consumed.has(cursor) || consumedIndices.has(cursor))) cursor--;
    }
    if (cursor >= 0 && tokens[cursor] === "on") {
      consumedIndices.add(cursor);
      taken.add(cursor);
    }
  }
  return { tag, consumedIndices };
}
