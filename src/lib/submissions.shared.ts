export const CATEGORIES = [
  "sports",
  "networking",
  "education",
  "social",
  "fundraiser",
  "workshop",
  "other",
] as const;

export type SubmissionCategory = (typeof CATEGORIES)[number];
export type SubmissionStatus = "pending" | "approved" | "rejected";