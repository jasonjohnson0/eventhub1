// Standalone verification of reminderOffsetLabel() in
// src/lib/communications.functions.ts (spec 07, unified email logs). Copied
// verbatim (no app-specific imports) since that file isn't loadable outside
// the Vite/TanStack build. If the real implementation changes, mirror the
// change here too.
//
// This is the one piece of genuinely fiddly logic in the reminder drain:
// scheduleReminders() computes an exact scheduled_for timestamp
// (start - 7d/1d/1h), but by the time the drain job actually picks a row up
// it may be running a few minutes late (the cron fires every 15 minutes, not
// continuously) -- reminderOffsetLabel has to bucket an approximate gap back
// to the right template ("next week" vs "tomorrow" vs "in 1 hour"), not
// assume the gap is exact.
// Run: node tests/unit/reminder-offset.mjs

function reminderOffsetLabel(startTimeIso, scheduledForIso) {
  const diffMs = new Date(startTimeIso).getTime() - new Date(scheduledForIso).getTime();
  if (diffMs >= 6 * 24 * 3600 * 1000) return "7d";
  if (diffMs >= 20 * 3600 * 1000) return "1d";
  return "1h";
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

const start = "2027-03-15T18:00:00.000Z";
const minus = (ms) => new Date(new Date(start).getTime() - ms).toISOString();

check(
  "exactly 7 days out labels 7d",
  reminderOffsetLabel(start, minus(7 * 24 * 3600 * 1000)) === "7d",
);
check(
  "7 days out but the drain ran 10 minutes late still labels 7d, not 1d",
  reminderOffsetLabel(start, minus(7 * 24 * 3600 * 1000 - 10 * 60 * 1000)) === "7d",
);
check(
  "exactly 1 day out labels 1d",
  reminderOffsetLabel(start, minus(24 * 3600 * 1000)) === "1d",
);
check(
  "1 day out but the drain ran 10 minutes late still labels 1d, not 1h",
  reminderOffsetLabel(start, minus(24 * 3600 * 1000 - 10 * 60 * 1000)) === "1d",
);
check(
  "just under the 6-day threshold falls back to 1d, not 7d",
  reminderOffsetLabel(start, minus(6 * 24 * 3600 * 1000 - 1000)) === "1d",
);
check(
  "just under the 20-hour threshold falls back to 1h, not 1d",
  reminderOffsetLabel(start, minus(20 * 3600 * 1000 - 1000)) === "1h",
);
check(
  "exactly 1 hour out labels 1h",
  reminderOffsetLabel(start, minus(3600 * 1000)) === "1h",
);
check(
  "a drain that runs right at start time still labels 1h, not something negative",
  reminderOffsetLabel(start, start) === "1h",
);

console.log("\n" + (failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);
