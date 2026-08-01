import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminOverview } from "@/lib/admin.stats.functions";
import { getPlatformConfig } from "@/lib/setup.functions";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Megaphone, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: OverviewPage,
});

type Overview = Awaited<ReturnType<typeof adminOverview>>;

function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    adminOverview().then(setData).catch(() => setData(null));
    getPlatformConfig()
      .then((c) => setNeedsSetup(!(c.stripe_ready && c.email_configured)))
      .catch(() => setNeedsSetup(true));
  }, []);
  if (!data) return <p className="text-sm text-muted-foreground">Loading overview…</p>;
  const fmtMoney = (c: number) => `$${(c / 100).toLocaleString()}`;
  return (
    <div className="space-y-4">
      {needsSetup && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="font-medium">Finish setting up EventHub</p>
            <p className="text-sm text-muted-foreground">
              Connect Stripe and pick an email provider to enable payments and notifications.
            </p>
          </div>
          <Link to="/admin/setup">
            <Button>Set up integrations</Button>
          </Link>
        </div>
      )}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat icon={<Calendar className="h-4 w-4" />} label="Events (this month)" value={data.events.thisMonth} sub={`${data.events.allTime} all-time`} />
      <Stat icon={<Users className="h-4 w-4" />} label="Users" value={data.users.allTime} sub={`${data.users.mauPlaceholder} MAU`} />
      <Stat icon={<DollarSign className="h-4 w-4" />} label="Revenue (this month)" value={fmtMoney(data.revenueCents.thisMonth)} sub={`${fmtMoney(data.revenueCents.allTime)} all-time`} />
      <Stat icon={<Megaphone className="h-4 w-4" />} label="Sponsored slots filled" value={`${data.slots.fillRate.toFixed(0)}%`} sub={`${data.slots.filled} / ${data.slots.total}`} />
    </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}