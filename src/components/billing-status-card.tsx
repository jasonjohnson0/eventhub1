import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBillingStatus, type BillingStatus } from "@/lib/ad-stats.functions";
import { BadgeCheck, CircleAlert, Clock, Receipt } from "lucide-react";

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

/** Tone per state. A fee coming due is worth noticing; it is not an emergency,
 *  and nothing about it stops the calendar working, so it does not get the
 *  full-bleed red treatment that would imply otherwise. */
const LOOK: Record<BillingStatus["state"], { ring: string; icon: React.ReactNode; title: string }> =
  {
    free_sponsored: {
      ring: "border-emerald-200 bg-emerald-50/60",
      icon: <BadgeCheck className="h-5 w-5 text-emerald-600" />,
      title: "Your calendar is free this month",
    },
    grace: {
      ring: "border-sky-200 bg-sky-50/60",
      icon: <Clock className="h-5 w-5 text-sky-600" />,
      title: "Free while you get started",
    },
    free_no_fee: {
      ring: "border-slate-200 bg-slate-50/60",
      icon: <BadgeCheck className="h-5 w-5 text-slate-500" />,
      title: "No charge on this account",
    },
    fee_due: {
      ring: "border-amber-300 bg-amber-50/60",
      icon: <CircleAlert className="h-5 w-5 text-amber-600" />,
      title: "A monthly fee applies",
    },
  };

/**
 * Why this calendar is free, or is not.
 *
 * A coordinator should never learn what they owe from an invoice. The state,
 * the reason and the way out are all on the page before anything is charged --
 * and the fee is only assessed after a month has closed, so there is always
 * time to sell a slot and make it moot.
 */
export function BillingStatusCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => getBillingStatus({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Checking your plan…</p>
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Plan status unavailable right now. Nothing is charged while this cannot be determined.
          </p>
        </CardContent>
      </Card>
    );
  }

  const look = LOOK[data.state] ?? LOOK.free_no_fee;
  const owing = data.state === "fee_due";

  return (
    <Card className={look.ring}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {look.icon}
          {look.title}
          {owing && (
            <span className="ml-auto rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              {money(data.amount_due_cents)}/mo
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{data.reason}</p>

        {data.state === "grace" && data.grace_days_left > 0 && (
          <p className="text-sm text-muted-foreground">
            {data.grace_days_left} day{data.grace_days_left === 1 ? "" : "s"} left. After that, a
            calendar carrying at least one paid sponsor stays free — otherwise the{" "}
            {money(data.monthly_fee_cents)} monthly fee starts.
          </p>
        )}

        {owing && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {data.sponsored_enabled
                ? "Sell a single sponsorship on any of your events and the fee goes away for that month."
                : "Turn sponsors back on and sell one slot, and the fee goes away for that month."}{" "}
              Nothing is charged until{" "}
              {new Date(data.next_assessment_on).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
              })}
              , so there is still time.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/calendar">Open an event to add a sponsor slot</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to="/settings">Billing settings</Link>
              </Button>
            </div>
          </div>
        )}

        {data.state === "free_sponsored" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Receipt className="h-4 w-4 shrink-0" />
            Keep at least one sponsorship running and it stays that way.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
