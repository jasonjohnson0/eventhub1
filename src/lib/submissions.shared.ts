// Was its own copy of the category list; now re-exports the canonical one
// from categories.ts so expanding categories only ever means editing one
// file.
export { CATEGORIES } from "@/lib/categories";
import type { CATEGORIES as _CATEGORIES } from "@/lib/categories";

export type SubmissionCategory = (typeof _CATEGORIES)[number];
export type SubmissionStatus = "pending" | "approved" | "rejected";