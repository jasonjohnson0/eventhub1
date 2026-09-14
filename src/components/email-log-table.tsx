import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEmailSends } from "@/lib/communications.functions";

type Row = Awaited<ReturnType<typeof listEmailSends>>[number];

const TYPE_LABEL: Record<Row["type"], string> = {
  invitation: "Invitation",
  announcement: "Announcement",
  update: "Update",
  reminder: "Reminder",
};

const STATUS_VARIANT: Record<Row["status"], "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  sent: "default",
  failed: "destructive",
  skipped: "secondary",
  simulated: "secondary",
  bounced: "destructive",
  complained: "destructive",
};

/** Spec 07's unified log: invitations, announcements, updates and reminders
 *  together, filterable. Used both scoped to one event (manage page) and
 *  workspace-wide (settings) -- same table, `eventId` just narrows the
 *  query, same as it narrows `listEmailSends` itself. */
export function EmailLogTable({ eventId }: { eventId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"all" | Row["type"]>("all");
  const [status, setStatus] = useState<"all" | Row["status"]>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      listEmailSends({
        data: {
          event_id: eventId,
          type: type === "all" ? undefined : type,
          status: status === "all" ? undefined : status,
          search: search.trim() || undefined,
        },
      })
        .then((r) => {
          if (!cancelled) setRows(r);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250); // debounce the search box; type/status filters resolve instantly enough on their own
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [eventId, type, status, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="invitation">Invitation</SelectItem>
            <SelectItem value="announcement">Announcement</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="reminder">Reminder</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="simulated">Simulated</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="complained">Complained</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipient email"
          className="h-8 max-w-[220px] text-xs"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" /> No email activity matches these filters.
        </p>
      ) : (
        <div className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <Badge variant={STATUS_VARIANT[r.status]} className="shrink-0">
                {r.status}
              </Badge>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {TYPE_LABEL[r.type]}
              </span>
              <span className="min-w-0 flex-1 truncate">{r.recipient_email || "(no email on file)"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </span>
              {(r.opened_at || r.clicked_at) && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.clicked_at ? "clicked" : "opened"}
                </span>
              )}
              {r.status === "failed" && r.error && (
                <span className="w-full truncate text-xs text-destructive" title={r.error}>
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
