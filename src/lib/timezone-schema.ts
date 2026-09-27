import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

/** An IANA zone name ("America/Chicago"), validated against the runtime's own
 *  tz database. Every event/series write path uses this, so a typo is a clear
 *  400 with a fixable message instead of a stored value that silently renders
 *  as UTC. The database enforces the same rule (migration 20260927100000) for
 *  writers that bypass these server functions. */
export const ianaTimeZone = z
  .string()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, { message: "Unknown timezone -- use an IANA name such as America/Chicago" });
