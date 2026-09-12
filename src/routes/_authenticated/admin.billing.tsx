import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CloseBillingMonth } from "@/components/close-billing-month";
import {
  adminListBilling,
  adminListFeeLedger,
  adminSetCoordinatorBilling,
  type AdminBillingRow,
} from "@/lib/ad-stats.functions";
import { CircleAlert, BadgeCheck, Clock, CircleDollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: AdminBilling,
  head: () => ({ meta: [{ title: "Billing — EventHub admin" }] }),
});

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

const STATE: Record<
  AdminBillingRow["state"],
  { label: string; cls: string; icon: React.ReactNode }
> = {
  fee_due: {
    label: "Fee due",
    cls: "bg-amber-100 text-amber-900",
    icon: <CircleAlert className="h-3.5 w-3.5" />,
  },
  free_sponsored: {
    label: "Free — sponsored",
    cls: "bg-emerald-100 text-emerald-900",
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
  },
  grace: {
    label: "Grace",
    cls: "bg-sky-100 text-sky-900",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  free_no_fee: {
    label: "No price set",
    cls: "bg-slate-200 text-slate-700",
    icon: <CircleDollarSign className="h-3.5 w-3.5" />,
  },
};

function AdminBilling() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["admin-billing"], queryFn: () => adminListBilling() });
  const ledger = useQuery({ queryKey: ["admin-fee-ledger"], queryFn: () => adminListFeeLedger() });

  const save = useMutation({
    mutationFn: adminSetCoordinatorBilling,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      qc.invalidateQueries({ queryKey: ["billing-status"] });
    },
  });

  const list = rows.data ?? [];
  const monthlyRun = list.reduce((a, r) => a + r.amount_due_cents, 0);
  const unpaid = list.reduce((a, r) => a + Number(r.unpaid_cents), 0);
  const unpriced = list.filter((r) => r.state === "free_no_fee").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Tile label="Coordinators" value={String(list.length)} />
        <Tile label="Billable this month" value={money(monthlyRun)} emphasis />
        <Tile label="Invoiced, unpaid" value={money(unpaid)} />
        <Tile
          label="No price set"
          value={String(unpriced)}
          hint={unpriced > 0 ? "These run free indefinitely" : undefined}
        />
      </div>

      <CloseBillingMonth />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coordinators</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.error ? (
            <p className="text-sm text-destructive">{(rows.error as Error).message}</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No coordinators yet.</p>
          ) : (
            <div className="space-y-2">
              {list.map((r) => (
                <CoordinatorRow
                  key={r.coordinator_id}
                  row={r}
                  saving={save.isPending}
                  onSave={(fee, ads) =>
                    save.mutate({
                      data: {
                        coordinator_id: r.coordinator_id,
                        monthly_fee_cents: fee,
                        sponsored_enabled: ads,
                      },
                    })
                  }
                />
              ))}
            </div>
          )}
          {save.error && (
            <p className="mt-3 text-sm text-destructive">{(save.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fee ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (ledger.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing invoiced yet. Charges appear here after a month is closed above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Period</th>
                  <th className="py-2 pr-3 font-medium">Coordinator</th>
                  <th className="py-2 pr-3 font-medium">Reason</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(ledger.data ?? []).map((b) => {
                  const who = list.find((r) => r.coordinator_id === b.coordinator_id);
                  return (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{b.period_month?.slice(0, 7)}</td>
                      <td className="py-2 pr-3">{who?.company_name ?? who?.email ?? "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{b.description ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(b.amount_cents)}</td>
                      <td className="py-2">{b.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CoordinatorRow({
  row,
  saving,
  onSave,
}: {
  row: AdminBillingRow;
  saving: boolean;
  onSave: (feeCents: number, sponsoredEnabled: boolean) => void;
}) {
  // Edited in whole currency units; nobody wants to type cents.
  const [dollars, setDollars] = useState(String(row.monthly_fee_cents / 100));
  const [ads, setAds] = useState(row.sponsored_enabled);
  const look = STATE[row.state] ?? STATE.free_no_fee;
  const dirty =
    Math.round(Number(dollars) * 100) !== row.monthly_fee_cents || ads !== row.sponsored_enabled;
  const valid = Number.isFinite(Number(dollars)) && Number(dollars) >= 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {row.company_name ?? row.email ?? row.coordinator_id.slice(0, 8)}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${look.cls}`}
          >
            {look.icon}
            {look.label}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {row.slug ? `/c/${row.slug} · ` : ""}
          {row.approved_events} event{row.approved_events === 1 ? "" : "s"} ·{" "}
          {row.active_sponsorships} sponsor{row.active_sponsorships === 1 ? "" : "s"} running
          {Number(row.unpaid_cents) > 0 && (
            <span className="font-semibold text-amber-700">
              {" "}
              · {money(Number(row.unpaid_cents))} unpaid
            </span>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <Switch checked={ads} onCheckedChange={setAds} aria-label="Sponsors allowed" />
        Sponsors allowed
      </label>

      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">$</span>
        <Input
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          inputMode="decimal"
          aria-label="Monthly fee"
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">/mo</span>
      </div>

      <Button
        size="sm"
        disabled={!dirty || !valid || saving}
        onClick={() => onSave(Math.round(Number(dollars) * 100), ads)}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={`tabular-nums ${emphasis ? "text-2xl font-bold" : "text-xl font-semibold"}`}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-amber-700">{hint}</div>}
      </CardContent>
    </Card>
  );
}
