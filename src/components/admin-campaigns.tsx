import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adminImportZipCentroids,
  adminListCampaigns,
  adminReviewCampaign,
  adminUpdatePricing,
  adminZipStatus,
  getSponsorPricing,
  type CampaignDetail,
} from "@/lib/sponsor-campaigns.functions";
import { formatCents, STATUS_LABEL, type PricingRow } from "@/lib/sponsor-pricing";

type Action = "approve" | "reject" | "pause" | "resume" | "refund";

/** Admin console for Phase 1b sponsor campaigns: review queue, all
 *  campaigns, pricing per scope, and the ZIP-code lookup table. */
export function AdminCampaigns() {
  const [rows, setRows] = useState<CampaignDetail[] | null>(null);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [zip, setZip] = useState<{ count: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    adminListCampaigns().then(setRows).catch(() => setRows([]));
    getSponsorPricing().then(setPricing).catch(() => setPricing([]));
    adminZipStatus().then(setZip).catch(() => setZip(null));
  };
  useEffect(load, []);

  async function act(id: string, action: Action) {
    let note = "";
    if (action === "reject" || action === "refund") {
      const v = window.prompt(action === "reject" ? "Reason (sent to the sponsor):" : "Refund note:") ?? null;
      if (v === null) return;
      note = v;
    }
    setBusy(id);
    try {
      await adminReviewCampaign({ data: { id, action, note } });
      toast.success("Done");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function savePrice(p: PricingRow, dollars: string) {
    const cents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(cents) || cents < 0) return toast.error("Enter a valid price");
    try {
      await adminUpdatePricing({ data: { scope: p.scope, unit_cents: cents } });
      toast.success("Price saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function importZips() {
    setBusy("zip");
    try {
      const r = await adminImportZipCentroids();
      toast.success(`Loaded ${r.count.toLocaleString()} ZIP codes`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  const queue = rows?.filter((r) => r.status === "pending_review") ?? [];
  const others = rows?.filter((r) => r.status !== "pending_review") ?? [];

  const row = (c: CampaignDetail) => (
    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
      <div>
        <div className="font-medium">{c.creative?.business_name ?? "—"}</div>
        <div className="text-xs capitalize text-muted-foreground">
          {c.scope} · {c.starts_on} to {c.ends_on} · {formatCents(c.price_cents)}
          {c.contact_email && ` · ${c.contact_email}`}
        </div>
        {c.creative?.headline && <div className="text-xs">{c.creative.headline}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline">{STATUS_LABEL[c.status] ?? c.status}</Badge>
        {c.status === "pending_review" && (
          <>
            <Button size="sm" disabled={busy === c.id} onClick={() => act(c.id, "approve")}>
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => act(c.id, "reject")}>
              Decline &amp; refund
            </Button>
          </>
        )}
        {c.status === "active" && (
          <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => act(c.id, "pause")}>
            Pause
          </Button>
        )}
        {c.status === "paused" && (
          <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => act(c.id, "resume")}>
            Resume
          </Button>
        )}
        {["active", "paused", "ended"].includes(c.status) && (
          <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => act(c.id, "refund")}>
            Refund
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Waiting for review ({queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to review.</p>
          ) : (
            queue.map(row)
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All sponsorships</CardTitle>
        </CardHeader>
        <CardContent>
          {others.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : others.map(row)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pricing.map((p) => (
            <form
              key={p.scope}
              className="flex flex-wrap items-center gap-2 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get("price");
                savePrice(p, String(v ?? ""));
              }}
            >
              <span className="w-28 capitalize">{p.scope}</span>
              <span>$</span>
              <Input
                name="price"
                defaultValue={(p.unit_cents / 100).toFixed(2)}
                className="w-28"
                inputMode="decimal"
              />
              <span className="text-xs text-muted-foreground">
                per {p.unit === "per_calendar" ? "calendar per " : ""}
                {p.period}
              </span>
              <Button size="sm" type="submit" variant="outline">
                Save
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ZIP code lookup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {zip ? `${zip.count.toLocaleString()} US ZIP codes loaded.` : "Checking…"}{" "}
            {zip && zip.count === 0 && "Area sponsorships need this list."}
          </span>
          <Button size="sm" variant="outline" disabled={busy === "zip"} onClick={importZips}>
            {busy === "zip" ? "Loading…" : zip?.count ? "Refresh list" : "Load US ZIP codes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
