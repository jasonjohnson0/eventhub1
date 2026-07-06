import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Users, DollarSign, CheckCircle2, ArrowLeft } from "lucide-react";
import { getEventAnalytics } from "@/lib/monetization.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/events/$id/analytics")({
  component: AnalyticsPage,
  head: () => ({ meta: [{ title: "Analytics — EventHub" }] }),
});

type Data = Awaited<ReturnType<typeof getEventAnalytics>>;

function AnalyticsPage() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    getEventAnalytics({ data: { event_id: id } })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const a = data.analytics;
  const maxDaily = Math.max(1, ...data.viewsSeries.map((s) => s.count));
  const rsvpBars = [
    { label: "Going", value: a.rsvp_going, class: "bg-emerald-500" },
    { label: "Interested", value: a.rsvp_interested, class: "bg-sky-500" },
    { label: "Waitlist", value: a.rsvp_waitlist, class: "bg-amber-500" },
    { label: "Declined", value: a.rsvp_declined, class: "bg-rose-400" },
  ];
  const maxRsvp = Math.max(1, ...rsvpBars.map((r) => r.value));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="text-sm text-muted-foreground">Event analytics</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/events/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to event
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<Eye className="h-4 w-4" />} label="Views" value={a.view_count.toLocaleString()} />
        <StatCard icon={<Users className="h-4 w-4" />} label="RSVPs going" value={a.rsvp_going.toLocaleString()} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Ticket revenue" value={`$${(Number(a.ticket_revenue_cents) / 100).toFixed(2)}`} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Check-ins" value={a.check_ins.toLocaleString()} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Attendance" value={`${a.attendance_rate_pct}%`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Views over last 14 days</CardTitle></CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-1">
            {data.viewsSeries.map((s) => (
              <div key={s.date} className="group flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70 transition-all group-hover:bg-primary"
                  style={{ height: `${(s.count / maxDaily) * 100}%` }}
                  title={`${s.date}: ${s.count}`}
                />
                <span className="text-[9px] text-muted-foreground">{s.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">RSVPs by status</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rsvpBars.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-24 text-sm">{r.label}</div>
              <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                <div className={`h-full ${r.class}`} style={{ width: `${(r.value / maxRsvp) * 100}%` }} />
              </div>
              <div className="w-10 text-right text-sm tabular-nums">{r.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}