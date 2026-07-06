import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getEvent } from "@/lib/events.functions";
import { recordShare, recordClick, upsertRsvp } from "@/lib/tracking.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { colorForEvent } from "@/lib/event-colors";
import { Calendar, MapPin, Users, Share2, Eye, Facebook, Twitter, Mail, Link2 } from "lucide-react";
import { categoryClasses, categoryLabel } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/events/$id")({
  component: EventPage,
  head: () => ({ meta: [{ title: "Event — EventHub" }] }),
});

type Data = Awaited<ReturnType<typeof getEvent>>;

function EventPage() {
  const { id } = Route.useParams();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getEvent({ data: { id } })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
    // Fire click tracking once on mount; server dedupes per (event,user,day)
    recordClick({ data: { event_id: id } }).catch(() => undefined);
  }, [id]);

  if (err) return <div className="p-8 text-sm text-red-600">{err}</div>;
  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const { event, details, counts, myRsvp, slots, isCoordinator } = data;
  const geo = (data as unknown as { geo: { latitude: number; longitude: number } | null }).geo;
  const c = colorForEvent(event.id);
  const cover = details?.landscape_image_url ?? null;
  const [distanceMi, setDistanceMi] = useState<number | null>(null);
  useEffect(() => {
    if (!geo || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 3958.8;
      const dLat = toRad(geo.latitude - pos.coords.latitude);
      const dLon = toRad(geo.longitude - pos.coords.longitude);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(pos.coords.latitude)) * Math.cos(toRad(geo.latitude)) * Math.sin(dLon / 2) ** 2;
      setDistanceMi(2 * R * Math.asin(Math.sqrt(a)));
    });
  }, [geo]);

  async function handleRsvp(status: "going" | "interested" | "declined") {
    if (busy) return;
    setBusy(true);
    const previous = data;
    if (!previous) return;
    const toggling = myRsvp === status;
    setData({ ...previous, myRsvp: toggling ? null : status });
    try {
      const res = await upsertRsvp({ data: { event_id: id, status } });
      setData({ ...previous, myRsvp: res.myRsvp, counts: { ...previous.counts, ...res.counts } });
    } catch (e) {
      setData(previous);
      toast.error(e instanceof Error ? e.message : "RSVP failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(platform: "facebook" | "twitter" | "email" | "link") {
    try {
      const res = await recordShare({ data: { event_id: id, platform } });
      setData((d) => (d ? { ...d, counts: { ...d.counts, shares: res.shares } } : d));
      if (platform === "link") {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied");
      } else {
        const labels = { facebook: "Facebook", twitter: "Twitter", email: "Email" } as const;
        toast(`Share would open ${labels[platform]} — wiring in Phase 1b`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Share failed");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div
        className="relative h-56 overflow-hidden rounded-lg border"
        style={{ backgroundColor: c.hex }}
      >
        {cover && <img src={cover} alt={event.title} className="h-full w-full object-cover" />}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{event.title}</h1>
          <div className="flex flex-wrap gap-2">
            {event.category && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${categoryClasses(event.category)}`}>
                {categoryLabel(event.category)}
              </span>
            )}
            <Badge variant="outline" className="gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(event.start_time).toLocaleString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Badge>
            {event.location && (
              <Link
                to="/map"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
              >
                <MapPin className="h-3 w-3" />
                {event.location}
              </Link>
            )}
            {distanceMi != null && (
              <Badge variant="outline">{distanceMi.toFixed(1)} miles away</Badge>
            )}
          </div>
          {event.tags && event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {event.tags.map((t: string) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/calendar">Back to calendar</Link>
        </Button>
      </div>

      {event.description && <p className="whitespace-pre-line text-sm text-foreground/80">{event.description}</p>}

      {series && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4" /> Part of a recurring series
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Rule: <code className="rounded bg-muted px-1 text-xs">{series.rrule}</code>
            </p>
            {isCoordinator && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleDeleteSeries("this")}>
                  Delete this occurrence
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDeleteSeries("future")}>
                  Delete this and future
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteSeries("all")}>
                  Delete entire series
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">RSVP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(["going", "interested", "declined"] as const).map((s) => (
              <Button
                key={s}
                variant={myRsvp === s ? "default" : "outline"}
                size="sm"
                onClick={() => handleRsvp(s)}
                disabled={busy}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{counts.going} going</span>
            <span>{counts.interested} interested</span>
            <span>{counts.declined} declined</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => handleShare("facebook")}>
              <Facebook className="mr-1 h-4 w-4" /> Facebook
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleShare("twitter")}>
              <Twitter className="mr-1 h-4 w-4" /> Twitter
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleShare("email")}>
              <Mail className="mr-1 h-4 w-4" /> Email
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleShare("link")}>
              <Link2 className="mr-1 h-4 w-4" /> Copy link
            </Button>
          </div>
          <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Share2 className="h-4 w-4" /> {counts.shares} total shares
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {counts.going + counts.interested} interested attendees
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sponsored slots</CardTitle>
        </CardHeader>
        <CardContent>
          {slots.length === 0 && <p className="text-sm text-muted-foreground">No slots configured for this event.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">Ad #{s.position}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {s.slot_type} · {s.status}
                  </div>
                </div>
                {s.status === "available" ? (
                  <Button size="sm" variant="secondary" onClick={() => toast("Sponsor checkout lands in Phase 1b")}>
                    Sponsor · ${(s.cost_cents / 100).toFixed(0)}
                  </Button>
                ) : (
                  <Badge variant="outline" className="capitalize">
                    {s.status}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isCoordinator && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coordinator insights</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              This event has been viewed {counts.clicksLast24h} times in the last 24 hours by registered users.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}