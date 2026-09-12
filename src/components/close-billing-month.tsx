import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { closeBillingMonth } from "@/lib/ad-stats.functions";
import { CalendarClock } from "lucide-react";

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

function lastMonthLabel(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Closes the previous month: writes a pending charge for every coordinator who
 * ran no sponsor and is past their grace window.
 *
 * A deliberate button rather than a silent job, for now. The first months of a
 * billing system are when its rules get corrected, and a human pressing this
 * after glancing at the numbers is safer than a cron quietly invoicing people
 * at 3am on rules nobody has watched run yet. It is idempotent either way, so
 * moving it to a schedule later changes nothing about its behaviour.
 */
export function CloseBillingMonth() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ coordinators_billed: number; total_cents: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await closeBillingMonth({ data: {} }));
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5" />
          Close {lastMonthLabel()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Records a pending charge for every coordinator who ran no sponsor last month and is past
          their getting-started window. Coordinators who carried a sponsor, who have no fee set, or
          who are still in grace are skipped.
        </p>

        {!confirming ? (
          <Button size="sm" onClick={() => setConfirming(true)} disabled={busy}>
            Close the month
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <span className="text-sm">
              This writes charges to the billing ledger. Running it again is harmless — nobody can
              be billed twice for the same month.
            </span>
            <div className="flex gap-2">
              <Button size="sm" onClick={run} disabled={busy}>
                {busy ? "Working…" : "Yes, close it"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {result && (
          <p className="text-sm">
            {result.coordinators_billed === 0 ? (
              <>Nothing to bill — every calendar either carried a sponsor or is not on a fee.</>
            ) : (
              <>
                Billed <strong>{result.coordinators_billed}</strong>{" "}
                {result.coordinators_billed === 1 ? "coordinator" : "coordinators"} for a total of{" "}
                <strong>{money(result.total_cents)}</strong>.
              </>
            )}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
