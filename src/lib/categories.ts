// The canonical category list -- every other file that validates or
// stores a category (events.functions.ts, submissions.shared.ts,
// event-import.ts, the MCP tools, the REST API v1 routes) imports this
// instead of keeping its own copy of the same array. There used to be 9
// separate hardcoded copies of the original 7 categories; one typo'd
// differently from the others would have been a silent, hard-to-spot
// inconsistency. "other" stays last as the catch-all it's always been.
export const CATEGORIES = [
  "sports",
  "networking",
  "education",
  "social",
  "fundraiser",
  "workshop",
  "music",
  "family",
  "arts",
  "theater",
  "comedy",
  "food_drink",
  "community",
  "expo",
  "books",
  "free",
  "other",
] as const;

export type EventCategory = (typeof CATEGORIES)[number];

const LABELS: Record<string, string> = {
  food_drink: "Food & Drink",
  family: "Family & Kids",
};

export function categoryLabel(c: string): string {
  return LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

// Text shades measured against their own tinted background in a real
// browser (canvas-resolved sRGB, WCAG relative-luminance contrast) rather
// than assumed from the Tailwind shade number -- amber-700 and
// muted-foreground both measured just under 4.5:1 (4.48 and 4.35) against
// their light-mode backgrounds, failing WCAG AA for normal-size text;
// amber-800/slate-600 clear it with margin (6.3+). The rest already
// passed as-is. dark: variants were already well clear of 4.5:1 and are
// unchanged.
const CLASSES: Record<string, string> = {
  sports: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  networking: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  education: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  social: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  fundraiser: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  workshop: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  // Measured the same way as the original six (see comment above) --
  // yellow/lime/orange-family hues needed the darker -800 shade to clear
  // 4.5:1, same as education's amber did.
  music: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  family: "bg-lime-500/15 text-lime-800 dark:text-lime-300",
  arts: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  theater: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  comedy: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  food_drink: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  community: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  expo: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  books: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  free: "bg-green-500/15 text-green-800 dark:text-green-300",
  other: "bg-muted text-slate-600 dark:text-muted-foreground",
};

export function categoryClasses(c: string | null | undefined): string {
  return CLASSES[c ?? "other"] ?? CLASSES.other;
}