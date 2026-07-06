import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, DollarSign, Eye, Users } from "lucide-react";
import { getCoordinatorAnalytics } from "@/lib/monetization.functions";
import { Link } from "@tanstack/react-router";

type Data = Awaited<ReturnType<typeof getCoordinatorAnalytics>>;

export function CoordinatorAnalyticsCard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const params: { from?: string; to?: string } = {};
    if (from) params.from = new Date(from).toISOString();
    if (to) params.to = new Date(to).toISOString();
    getCoordinatorAnalytics({ data: params }).then(setData).catch(() => undefined);
  }, [from, to]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" /> Analytics dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div>
            <Label htmlFor="an-from" className="text-xs">From</Label>
            <Input id="an-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="an-to" className="text-xs">To</Label>
            <Input id="an-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${(data.total_revenue_cents / 100).toFixed(2)}`} />
              <Stat icon={<Eye className="h-4 w-4" />} label="Total views" value={data.total_views.toLocaleString()} />
              <Stat icon={<Users className="h-4 w-4" />} label="Avg attendance" value={`${data.avg_attendance_pct}%`} />
            </div>
            {data.most_viewed && (
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Most viewed event</div>
                <Link to="/events/$id" params={{ id: data.most_viewed.event_id }} className="font-medium underline">
                  {data.most_viewed.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">{data.most_viewed.view_count} views</span>
              </div>
            )}
            {data.events.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs">
                    <tr>
                      <th className="p-2 text-left">Event</th>
                      <th className="p-2 text-right">Views</th>
                      <th className="p-2 text-right">Going</th>
                      <th className="p-2 text-right">Revenue</th>
                      <th className="p-2 text-right">Attend %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e.event_id} className="border-t">
                        <td className="p-2">
                          <Link to="/events/$id/analytics" params={{ id: e.event_id }} className="hover:underline">
                            {e.title}
                          </Link>
                        </td>
                        <td className="p-2 text-right">{e.view_count}</td>
                        <td className="p-2 text-right">{e.rsvp_going}</td>
                        <td className="p-2 text-right">${(Number(e.ticket_revenue_cents) / 100).toFixed(0)}</td>
                        <td className="p-2 text-right">{e.attendance_rate_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}