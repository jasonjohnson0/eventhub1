import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { listPendingSubmissions } from "@/lib/submissions.functions";

/**
 * Dashboard banner so the review queue can't silently back up: a thin public
 * calendar is usually a moderation backlog, not a lack of submissions. Shows
 * only when there is at least one pending submission; renders nothing (and
 * stays quiet on error) otherwise.
 */
export function PendingSubmissionsReminder() {
  const [pending, setPending] = useState<{ count: number; oldestDays: number } | null>(null);

  useEffect(() => {
    listPendingSubmissions()
      .then((rows) => {
        if (!rows.length) {
          setPending(null);
          return;
        }
        const oldest = Math.min(...rows.map((r) => new Date(r.submitted_at).getTime()));
        setPending({
          count: rows.length,
          oldestDays: Math.max(0, Math.floor((Date.now() - oldest) / 86_400_000)),
        });
      })
      .catch(() => {});
  }, []);

  if (!pending) return null;

  return (
    <Link
      to="/coordinator/submissions"
      className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100"
    >
      <Inbox className="h-5 w-5 shrink-0" />
      <span>
        <span className="font-semibold">
          {pending.count} {pending.count === 1 ? "submission" : "submissions"} waiting for review
        </span>
        {pending.oldestDays > 0 && (
          <>
            {" "}
            — the oldest has been sitting for {pending.oldestDays}{" "}
            {pending.oldestDays === 1 ? "day" : "days"}
          </>
        )}
        . Approved events are what fill your public calendar.
      </span>
    </Link>
  );
}
