import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getAnnualPlanStatus,
  createAnnualCheckout,
  openBillingPortal,
  type AnnualPlanStatus,
} from "@/lib/annual-plan.functions";

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

const LABEL: Record<AnnualPlanStatus["status"], string> = {
  none: "Not subscribed",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Canceled",
};

/**
 * $100/year, flat, auto-renewing -- a real Stripe subscription, not the
 * monthly ad-based ledger elsewhere on this page. Whether this actually
 * suppresses platform ads is a separate piece not built yet; this card is
 * just the billing relationship itself: subscribe, see status, manage it.
 */
export function AnnualPlanCard() {
  const [status, setStatus] = useState<AnnualPlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAnnualPlanStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get("annual") === "success") {
      toast.success("You're subscribed -- refreshing status…");
    } else if (params.get("annual") === "canceled") {
      toast("Checkout canceled -- nothing was charged.");
    }
  }, []);

  async function subscribe() {
    setBusy(true);
    try {
      const { url } = await createAnnualCheckout();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Annual plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {money(10_000)} per year, auto-renews annually. Status:{" "}
              <span className="font-medium text-foreground">
                {LABEL[status?.status ?? "none"]}
              </span>
              {status?.current_period_end && status.status === "active" && (
                <>
                  {" "}
                  — renews{" "}
                  {new Date(status.current_period_end).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  {status.cancel_at_period_end ? " (canceling, won't renew)" : ""}
                </>
              )}
            </p>
            {status?.status === "active" || status?.status === "past_due" ? (
              <Button size="sm" variant="outline" onClick={manage} disabled={busy}>
                Manage billing
              </Button>
            ) : (
              <Button size="sm" onClick={subscribe} disabled={busy}>
                {busy ? "Redirecting…" : `Subscribe — ${money(10_000)}/year`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
