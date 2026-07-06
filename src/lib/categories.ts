export const CATEGORIES = [
  "sports",
  "networking",
  "education",
  "social",
  "fundraiser",
  "workshop",
  "other",
] as const;

export type EventCategory = (typeof CATEGORIES)[number];

export function categoryLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

const CLASSES: Record<string, string> = {
  sports: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  networking: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  education: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  social: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  fundraiser: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  workshop: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  other: "bg-muted text-muted-foreground",
};

export function categoryClasses(c: string | null | undefined): string {
  return CLASSES[c ?? "other"] ?? CLASSES.other;
}