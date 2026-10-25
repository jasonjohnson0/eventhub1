import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { pendingSubmissionsQuery } from "@/queries/dashboard";

/**
 * Dashboard banner so the review queue can't silently back up: a thin public
 * calendar is usually a moderation backlog, not a lack of submissions. Shows
 * only when there is at least one pending submission; renders nothing (and
 * stays quiet on error) otherwise.
 */
export function PendingSubmissionsReminder({ userId }: { userId: string }) {
  const { data: rows, error } = useQuery(pendingSubmissionsQuery(userId));
  if (error) return <p role="alert" className="text-sm text-muted-foreground">Pending reviews unavailable right now.</p>;
  if (!rows?.length) return null;
  const oldest = Math.min(...rows.map((r) => new Date(r.submitted_at).getTime()));
  const pending = {
    count: rows.length,
    oldestDays: Math.max(0, Math.floor((Date.now() - oldest) / 86_400_000)),
  };

  return (
    <Link
      to="/coordinator/submissions"
      className="flex items-center gap-3 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground transition-colors hover:bg-muted"
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
