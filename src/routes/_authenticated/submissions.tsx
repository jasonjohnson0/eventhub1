import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Inbox, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveSubmission,
  listSubmissions,
  rejectSubmission,
  type EventSubmission,
} from "@/lib/submissions.functions";

export const Route = createFileRoute("/_authenticated/submissions")({
  component: SubmissionsPage,
  head: () => ({
    meta: [
      { title: "Event submissions queue — EventHub" },
      {
        name: "description",
        content: "Review, approve, or decline community event submissions before they hit the calendar.",
      },
      { property: "og:title", content: "Event submissions queue — EventHub" },
      {
        property: "og:description",
        content: "Coordinator queue for reviewing community-submitted events.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "pending" | "approved" | "rejected" | "all";

function SubmissionsPage() {
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<EventSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (s: Status) => {
    setLoading(true);
    try {
      setRows(await listSubmissions({ data: { status: s } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load submissions");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(status);
  }, [status]);

  const act = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      const payload = { data: { id, notes: notes[id] ?? null } };
      if (approve) await approveSubmission(payload);
      else await rejectSubmission(payload);
      toast.success(approve ? "Published to the calendar" : "Submission declined");
      await load(status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Inbox className="h-6 w-6" /> Event submissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Community-submitted events waiting for your review.
        </p>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Declined</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nothing here right now.
          </CardContent>
        </Card>
      ) : (
        rows.map((s) => {
          const ed = s.event_data;
          return (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3">
                <div>
                  <CardTitle className="text-lg">{ed.title}</CardTitle>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {new Date(ed.start_time).toLocaleString()} · {ed.location ?? "No location"}
                  </p>
                </div>
                <Badge
                  variant={
                    s.status === "pending"
                      ? "secondary"
                      : s.status === "approved"
                        ? "default"
                        : "outline"
                  }
                >
                  {s.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {ed.image_url ? (
                  <img
                    src={ed.image_url}
                    alt={`Submitted image for ${ed.title}`}
                    className="h-36 w-full rounded object-cover"
                    loading="lazy"
                  />
                ) : null}
                {ed.description ? (
                  <p className="whitespace-pre-line text-sm">{ed.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{ed.category ?? "other"}</Badge>
                  <span>
                    From {ed.contact_name ? `${ed.contact_name} · ` : ""}
                    {s.submitted_by_email}
                  </span>
                </div>

                {s.status === "pending" ? (
                  <>
                    <Textarea
                      rows={2}
                      placeholder="Optional note emailed to the submitter"
                      value={notes[s.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => act(s.id, true)} disabled={busyId === s.id}>
                        <Check className="mr-1 h-4 w-4" /> Approve & publish
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => act(s.id, false)}
                        disabled={busyId === s.id}
                      >
                        <X className="mr-1 h-4 w-4" /> Decline
                      </Button>
                    </div>
                  </>
                ) : s.notes ? (
                  <p className="rounded bg-muted p-2 text-xs">Note: {s.notes}</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}