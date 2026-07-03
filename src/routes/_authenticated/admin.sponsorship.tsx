import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSponsorshipStats } from "@/lib/admin.stats.functions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/sponsorship")({
  component: SponsorshipPage,
});

type Data = Awaited<ReturnType<typeof adminSponsorshipStats>>;

function SponsorshipPage() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    adminSponsorshipStats().then(setData).catch(() => setData(null));
  }, []);
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Available" value={data.slots.available} color="#84cc16" />
        <Stat label="Reserved" value={data.slots.reserved} color="#f97316" />
        <Stat label="Paid" value={data.slots.paid} color="#a855f7" />
        <Stat label="Expired" value={data.slots.expired} color="#94a3b8" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue trend (last 6 months)</CardTitle>
        </CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data.revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip />
              <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top sponsors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Top-sponsor rankings appear once payments start flowing in Phase 1b.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-2xl font-bold">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}