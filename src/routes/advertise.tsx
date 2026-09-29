import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSponsorPricing } from "@/lib/sponsor-campaigns.functions";
import { formatCents, type PricingRow } from "@/lib/sponsor-pricing";

export const Route = createFileRoute("/advertise")({
  head: () => ({
    meta: [
      { title: "Advertise on local event calendars — Dothan Today" },
      {
        name: "description",
        content: "Sponsor an event, community calendars, a local area by ZIP code, or the whole network.",
      },
      { property: "og:title", content: "Advertise on local event calendars — Dothan Today" },
      {
        property: "og:description",
        content: "Sponsor an event, community calendars, a local area by ZIP code, or the whole network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Advertise,
});

const OPTIONS = [
  { scope: "event", title: "One event", text: "Put your business on a single event's page." },
  { scope: "calendars", title: "Calendars", text: "Choose one or several community calendars." },
  { scope: "geo", title: "Local area", text: "Everything near a ZIP code, or in a list of ZIP codes." },
  { scope: "network", title: "Whole network", text: "Every calendar that runs network-wide ads." },
] as const;

function Advertise() {
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  useEffect(() => {
    getSponsorPricing().then(setPricing).catch(() => setPricing([]));
  }, []);
  const priceFor = (s: string) => {
    const p = pricing.find((r) => r.scope === s);
    if (!p) return null;
    return `${formatCents(p.unit_cents)} per ${p.unit === "per_calendar" ? "calendar per " : ""}${p.period}`;
  };
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 md:p-10">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Reach people who are looking for things to do</h1>
        <p className="text-muted-foreground">
          Sponsor local events and community calendars. Your ad shows beside the events, and you see how many
          people viewed and clicked it.
        </p>
        <Button asChild size="lg">
          <Link to="/sponsorships/new">Become a sponsor</Link>
        </Button>
        <p className="text-xs text-muted-foreground">You'll be asked to sign in first.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <Card key={o.scope}>
            <CardContent className="space-y-1 p-5">
              <div className="text-lg font-semibold">{o.title}</div>
              <p className="text-sm text-muted-foreground">{o.text}</p>
              {priceFor(o.scope) && <p className="text-sm font-medium">{priceFor(o.scope)}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Every ad is reviewed before it goes live. If we turn it down, you get a full refund.
      </p>
    </main>
  );
}
