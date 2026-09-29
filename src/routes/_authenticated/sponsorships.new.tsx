import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createSponsorCheckout,
  listTargetableCalendars,
  listTargetableEvents,
  quoteSponsorCampaign,
  saveSponsorDraft,
  type Quote,
} from "@/lib/sponsor-campaigns.functions";
import { formatCents, isZip, parseZipList, type SponsorScope } from "@/lib/sponsor-pricing";

export const Route = createFileRoute("/_authenticated/sponsorships/new")({
  head: () => ({
    meta: [
      { title: "Become a sponsor — Dothan Today" },
      { name: "description", content: "Sponsor an event, calendars, a local area or the whole network." },
    ],
  }),
  component: NewSponsorship,
});

const SCOPES: { value: SponsorScope; label: string; help: string }[] = [
  { value: "event", label: "One event", help: "Your ad on a single event's page." },
  { value: "calendars", label: "Calendars", help: "Pick one or several community calendars." },
  { value: "geo", label: "Local area", help: "Every calendar near a ZIP code, or in a list of ZIP codes." },
  { value: "network", label: "Whole network", help: "Every calendar that carries network-wide ads." },
];

const STEPS = ["What to sponsor", "Where", "When", "Your ad", "Review & pay"];

function today(offset = 0) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function NewSponsorship() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<SponsorScope>("geo");
  const [eventId, setEventId] = useState("");
  const [calendarIds, setCalendarIds] = useState<string[]>([]);
  const [centerZip, setCenterZip] = useState("");
  const [radius, setRadius] = useState(25);
  const [zipText, setZipText] = useState("");
  const [startsOn, setStartsOn] = useState(today(1));
  const [endsOn, setEndsOn] = useState(today(30));
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago", []);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [calendars, setCalendars] = useState<{ coordinator_id: string; name: string }[]>([]);
  const [events, setEvents] = useState<{ id: string; title: string; start_time: string }[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTargetableCalendars().then(setCalendars).catch(() => setCalendars([]));
    listTargetableEvents().then(setEvents).catch(() => setEvents([]));
  }, []);

  const zips = parseZipList(zipText);
  const targeting = {
    scope,
    starts_on: startsOn,
    ends_on: endsOn,
    tz,
    event_id: scope === "event" ? eventId || null : null,
    calendar_ids: scope === "calendars" ? calendarIds : [],
    center_zip: scope === "geo" && centerZip ? centerZip : null,
    radius_miles: scope === "geo" && centerZip ? radius : null,
    zips: scope === "geo" ? zips : [],
  };
  const targetingKey = JSON.stringify(targeting);

  useEffect(() => {
    setQuote(null);
    setQuoteErr(null);
    const t = setTimeout(() => {
      quoteSponsorCampaign({ data: targeting })
        .then(setQuote)
        .catch((e) => setQuoteErr(e instanceof Error ? e.message : "Could not price this"));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetingKey]);

  const badUrl = (v: string) => v.trim() !== "" && !/^https:\/\//i.test(v.trim());
  const whereOk =
    (scope === "event" && !!eventId) ||
    (scope === "calendars" && calendarIds.length > 0) ||
    scope === "network" ||
    (scope === "geo" &&
      ((centerZip !== "" && isZip(centerZip)) || zips.length > 0) &&
      zips.every(isZip) &&
      !(quote?.unknown_zips.length ?? 0));
  const whenOk = startsOn >= today(0) && endsOn >= startsOn;
  const adOk = businessName.trim() !== "" && !badUrl(logoUrl) && !badUrl(linkUrl);
  const canNext = [true, whereOk, whenOk, adOk, true][step];

  async function payNow() {
    setBusy(true);
    try {
      const { id } = await saveSponsorDraft({
        data: {
          ...targeting,
          id: draftId,
          contact_name: contactName,
          contact_email: contactEmail,
          creative: { business_name: businessName, logo_url: logoUrl, link_url: linkUrl, headline, body },
        },
      });
      setDraftId(id);
      const { url } = await createSponsorCheckout({ data: { id } });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
      setBusy(false);
    }
  }

  async function saveForLater() {
    setBusy(true);
    try {
      const { id } = await saveSponsorDraft({
        data: {
          ...targeting,
          id: draftId,
          contact_name: contactName,
          contact_email: contactEmail,
          creative: { business_name: businessName, logo_url: logoUrl, link_url: linkUrl, headline, body },
        },
      });
      toast.success("Saved as a draft");
      navigate({ to: "/sponsorships/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Become a sponsor</h1>
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`rounded-lg border p-4 text-left transition ${scope === s.value ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/50"}`}
                >
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-sm text-muted-foreground">{s.help}</div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && scope === "event" && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Event</span>
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">Choose an upcoming event…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {new Date(ev.start_time).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
          )}

          {step === 1 && scope === "calendars" && (
            <div className="max-h-80 space-y-2 overflow-auto">
              {calendars.length === 0 && <p className="text-sm text-muted-foreground">No calendars yet.</p>}
              {calendars.map((c) => (
                <label key={c.coordinator_id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={calendarIds.includes(c.coordinator_id)}
                    onCheckedChange={(v) =>
                      setCalendarIds((ids) =>
                        v ? [...ids, c.coordinator_id] : ids.filter((i) => i !== c.coordinator_id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}

          {step === 1 && scope === "geo" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Center ZIP code</span>
                  <Input
                    value={centerZip}
                    onChange={(e) => setCenterZip(e.target.value.trim())}
                    placeholder="36301"
                    inputMode="numeric"
                    maxLength={5}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Radius: {radius} miles</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium">And/or specific ZIP codes</span>
                <Textarea
                  value={zipText}
                  onChange={(e) => setZipText(e.target.value)}
                  placeholder="36301, 36303, 32446"
                  rows={2}
                />
                <span className="text-xs text-muted-foreground">
                  Each listed ZIP covers about 5 miles around its center.
                </span>
              </label>
              {quote && quote.unknown_zips.length > 0 && (
                <p className="text-sm text-destructive">ZIP not found: {quote.unknown_zips.join(", ")}</p>
              )}
            </div>
          )}

          {step === 1 && scope === "network" && (
            <p className="text-sm">
              Your ad runs across every calendar that has chosen network-wide ads.
            </p>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Start date</span>
                  <Input type="date" value={startsOn} min={today(0)} onChange={(e) => setStartsOn(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">End date</span>
                  <Input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Runs from the start of the first day to the end of the last day, in your time zone ({tz}).
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Business name</span>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Logo link (https://)</span>
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className={badUrl(logoUrl) ? "border-destructive" : undefined}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Website (https://)</span>
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className={badUrl(linkUrl) ? "border-destructive" : undefined}
                  />
                </label>
              </div>
              {(badUrl(logoUrl) || badUrl(linkUrl)) && (
                <p className="text-xs text-destructive">Links must start with https://</p>
              )}
              <label className="block space-y-1">
                <span className="text-sm font-medium">Headline</span>
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Short message</span>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={400} rows={2} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Contact name (private)</span>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Contact email (private)</span>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    maxLength={254}
                  />
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Sponsoring:</strong> {SCOPES.find((s) => s.value === scope)?.label}
              </p>
              <p>
                <strong>Dates:</strong> {startsOn} to {endsOn} ({tz})
              </p>
              <p>
                <strong>Ad:</strong> {businessName} {headline && `— ${headline}`}
              </p>
              <p className="text-muted-foreground">
                After payment an admin reviews your ad before it goes live. If it's turned down, you're refunded in full.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Price</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {quoteErr ? (
            <span className="text-muted-foreground">{quoteErr}</span>
          ) : quote ? (
            <div className="space-y-1">
              <div className="text-2xl font-bold">{formatCents(quote.price_cents)}</div>
              <div className="text-muted-foreground">
                {formatCents(quote.pricing.unit_cents)} per {quote.pricing.unit === "per_calendar" ? "calendar per " : ""}
                {quote.pricing.period} × {quote.units > 1 ? `${quote.units} calendars × ` : ""}
                {quote.periods} {quote.pricing.period}
                {quote.periods === 1 ? "" : "s"}
              </div>
              {scope === "geo" && (
                <div className="text-muted-foreground">
                  Reaches {quote.calendars_reached} calendar{quote.calendars_reached === 1 ? "" : "s"} with local ads.
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Working out the price…</span>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy || !adOk} onClick={saveForLater}>
              Save for later
            </Button>
            <Button disabled={busy || !quote || !adOk || !whereOk || !whenOk} onClick={payNow}>
              {busy ? "Opening payment…" : "Pay with card"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
