import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listMyCampaigns, type CampaignDetail } from "@/lib/sponsor-campaigns.functions";
import { formatCents, STATUS_LABEL } from "@/lib/sponsor-pricing";

export const Route = createFileRoute("/_authenticated/sponsorships/")({
  head: () => ({
    meta: [
      { title: "My sponsorships — Dothan Today" },
      { name: "description", content: "Your sponsorships, their status and results." },
    ],
  }),
  component: MySponsorships,
});


function MySponsorships() {
  const [rows, setRows] = useState<CampaignDetail[] | null>(null);
  useEffect(() => {
    listMyCampaigns().then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My sponsorships</h1>
        <Button asChild>
          <Link to="/sponsorships/new">New sponsorship</Link>
        </Button>
      </div>
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && (
        <p className="text-sm text-muted-foreground">You haven't sponsored anything yet.</p>
      )}
      {rows?.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-semibold">{c.creative?.business_name ?? "Untitled ad"}</div>
              <div className="text-xs capitalize text-muted-foreground">
                {c.scope} · {c.starts_on} to {c.ends_on}
                {c.price_cents > 0 && ` · ${formatCents(c.price_cents)}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{STATUS_LABEL[c.status] ?? c.status}</Badge>
              <Button asChild size="sm" variant="outline">
                <Link to="/sponsorships/$id" params={{ id: c.id }}>
                  Open
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
