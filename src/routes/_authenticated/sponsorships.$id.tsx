import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createSponsorCheckout,
  deleteSponsorDraft,
  getMyCampaign,
} from "@/lib/sponsor-campaigns.functions";
import { formatCents, STATUS_LABEL } from "@/lib/sponsor-pricing";

export const Route = createFileRoute("/_authenticated/sponsorships/$id")({
  head: () => ({
    meta: [
      { title: "Sponsorship — Dothan Today" },
      { name: "description", content: "Status and results for your sponsorship." },
    ],
  }),
  component: SponsorshipDetail,
});

type Data = Awaited<ReturnType<typeof getMyCampaign>>;

function SponsorshipDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const paid = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("paid");

  useEffect(() => {
    getMyCampaign({ data: { id } }).then(setData).catch(() => setData(null));
  }, [id]);

  if (data === undefined) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (data === null) return <p className="p-6 text-sm">Sponsorship not found.</p>;
  const { campaign: c, stats } = data;

  async function pay() {
    setBusy(true);
    try {
      const { url } = await createSponsorCheckout({ data: { id } });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteSponsorDraft({ data: { id } });
      navigate({ to: "/sponsorships" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Link to="/sponsorships" className="text-sm text-muted-foreground hover:underline">
        ← My sponsorships
      </Link>
      {paid && c.status === "pending_payment" && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm">
          Thanks! We're confirming your payment with the bank. This page will show "awaiting review" once it clears.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{c.creative?.business_name ?? "Sponsorship"}</h1>
        <Badge variant="outline">{STATUS_LABEL[c.status] ?? c.status}</Badge>
      </div>

      <Card>
        <CardContent className="space-y-1 p-4 text-sm">
          <p className="capitalize">
            <strong>Type:</strong> {c.scope}
          </p>
          <p>
            <strong>Dates:</strong> {c.starts_on} to {c.ends_on} ({c.tz})
          </p>
          {c.geo && (
            <p>
              <strong>Area:</strong>{" "}
              {c.geo.center_zip ? `${c.geo.radius_miles} miles around ${c.geo.center_zip}` : ""}
              {c.geo.center_zip && c.geo.zips.length ? " + " : ""}
              {c.geo.zips.length ? `ZIPs ${c.geo.zips.join(", ")}` : ""}
            </p>
          )}
          {c.calendar_ids.length > 0 && (
            <p>
              <strong>Calendars:</strong> {c.calendar_ids.length}
            </p>
          )}
          {c.price_cents > 0 && (
            <p>
              <strong>Price:</strong> {formatCents(c.price_cents)}
            </p>
          )}
          {c.review_note && (
            <p>
              <strong>Note from our team:</strong> {c.review_note}
            </p>
          )}
        </CardContent>
      </Card>

      {c.creative && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your ad</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="font-semibold">{c.creative.business_name}</div>
            {c.creative.headline && <div>{c.creative.headline}</div>}
            {c.creative.body && <p className="text-muted-foreground">{c.creative.body}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Views" value={stats.views} />
          <Stat label="People reached" value={stats.unique_viewers} />
          <Stat label="Clicks" value={stats.clicks} />
          <Stat label="People who clicked" value={stats.unique_clickers} />
        </CardContent>
      </Card>

      {(c.status === "draft" || c.status === "pending_payment") && (
        <div className="flex gap-2">
          <Button onClick={pay} disabled={busy}>
            Pay with card
          </Button>
          {c.status === "draft" && (
            <Button variant="outline" onClick={remove} disabled={busy}>
              Delete draft
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
