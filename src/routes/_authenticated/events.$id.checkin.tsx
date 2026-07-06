import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getEvent } from "@/lib/events.functions";
import {
  listAttendees,
  markAttended,
  getAttendanceRate,
} from "@/lib/attendee.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Circle, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/events/$id/checkin")({
  component: CheckinPage,
  head: () => ({ meta: [{ title: "Check-in — EventHub" }] }),
});

type Attendee = {
  user_id: string;
  name: string;
  email: string;
  status: string;
  checked_in_at: string | null;
};

function CheckinPage() {
  const { id } = Route.useParams();
  const [title, setTitle] = useState<string>("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [rate, setRate] = useState<{ rsvp_count: number; checked_in_count: number; rate: number } | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    try {
      const [ev, list, r] = await Promise.all([
        getEvent({ data: { id } }),
        listAttendees({ data: { event_id: id } }),
        getAttendanceRate({ data: { event_id: id } }),
      ]);
      setTitle(ev.event.title);
      setAttendees(list as Attendee[]);
      setRate(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void reload();
  }, [id]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return attendees;
    return attendees.filter(
      (a) => a.name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term),
    );
  }, [attendees, q]);

  async function toggle(a: Attendee) {
    setBusy(a.user_id);
    const attending = a.checked_in_at == null;
    // optimistic
    setAttendees((xs) =>
      xs.map((x) =>
        x.user_id === a.user_id
          ? { ...x, checked_in_at: attending ? new Date().toISOString() : null }
          : x,
      ),
    );
    try {
      await markAttended({ data: { event_id: id, user_id: a.user_id, attended: attending } });
      const r = await getAttendanceRate({ data: { event_id: id } });
      setRate(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      await reload();
    } finally {
      setBusy(null);
    }
  }

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/events/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Check-in</h1>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold">
              {rate?.checked_in_count ?? 0}/{rate?.rsvp_count ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">checked in ({rate?.rate ?? 0}%)</div>
          </div>
        </CardContent>
      </Card>

      <Input
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-12 text-base"
      />

      <div className="divide-y overflow-hidden rounded-lg border">
        {filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No attendees match.</p>
        )}
        {filtered.map((a) => {
          const attended = a.checked_in_at != null;
          return (
            <button
              key={a.user_id}
              onClick={() => toggle(a)}
              disabled={busy === a.user_id}
              className={`flex w-full items-center justify-between gap-3 p-4 text-left transition-colors ${
                attended
                  ? "bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:hover:bg-green-900/40"
                  : "hover:bg-muted"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="truncate text-xs text-muted-foreground">{a.email || "—"}</div>
              </div>
              <Badge variant="outline" className="capitalize">
                {a.status}
              </Badge>
              {attended ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-6 w-6 shrink-0 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}