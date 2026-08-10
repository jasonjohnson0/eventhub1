import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { categoryClasses, categoryLabel } from "@/lib/categories";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  MapPin,
  Users,
  ArrowLeft,
  Share2,
  Twitter,
  Facebook,
  Mail,
  Video,
  PartyPopper,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Megaphone,
  Settings,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/events/$id")({
  component: PublicEventDetail,
  head: () => ({
    meta: [
      { title: "Event — EventHub" },
      { name: "description", content: "Event details on EventHub." },
    ],
  }),
});

type Detail = {
  event: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    start_time: string;
    end_time: string;
    category: string | null;
    coordinator_id: string;
    event_format?: string | null;
    virtual_link?: string | null;
  };
  image: string | null;
  photos: { id: string; photo_url: string; caption: string | null }[];
  goingCount: number;
  coordinatorName: string | null;
  moreFromCoordinator: { id: string; title: string; start_time: string; category: string | null }[];
  tickets: { id: string; name: string; description: string | null; price_cents: number; quantity_available: number | null; quantity_sold: number | null; early_bird?: boolean | null; early_bird_price_cents: number | null }[];
  sponsors: { id: string; position: number; slot_type: string; status: string; cost_cents: number }[];
  isOwner: boolean;
};

const DEMO_SPONSOR_SLOTS = [
  { id: "demo-hero", position: 1, slot_type: "banner", status: "available", cost_cents: 25000 },
  { id: "demo-community", position: 2, slot_type: "card", status: "available", cost_cents: 15000 },
];

function PublicEventDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // biome-ignore lint/suspicious/noExplicitAny: extended columns not yet in generated types
      const { data: ev } = await (supabase as any)
        .from("events")
        .select("id, title, description, location, start_time, end_time, category, coordinator_id, event_format, virtual_link, status")
        .eq("id", id)
        .maybeSingle();
      if (!ev || ev.status !== "approved") {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
        return;
      }
      const [detailsRes, photosRes, rsvpRes, profileRes, ticketsRes, slotsRes] = await Promise.all([
        supabase.from("event_details").select("landscape_image_url, portrait_image_url").eq("event_id", id).maybeSingle(),
        supabase.from("event_photos").select("id, photo_url, caption").eq("event_id", id).order("created_at", { ascending: false }),
        supabase.from("event_rsvps").select("event_id", { count: "exact", head: true }).eq("event_id", id).eq("status", "going"),
        supabase.from("profiles").select("display_name").eq("id", ev.coordinator_id).maybeSingle(),
        supabase.from("event_tickets").select("id, name, description, price_cents, quantity_available, quantity_sold, early_bird, early_bird_price_cents").eq("event_id", id).order("price_cents"),
        supabase.from("sponsored_slots").select("id, position, slot_type, status, cost_cents").eq("event_id", id).order("position"),
      ]);
      const nowIso = new Date().toISOString();
      const { data: more } = await supabase
        .from("events")
        .select("id, title, start_time, category")
        .eq("coordinator_id", ev.coordinator_id)
        .eq("status", "approved")
        .neq("id", id)
        .gte("end_time", nowIso)
        .order("start_time", { ascending: true })
        .limit(4);
      if (!cancelled) {
        setData({
          event: ev,
          image: detailsRes.data?.landscape_image_url ?? detailsRes.data?.portrait_image_url ?? null,
          photos: photosRes.data ?? [],
          goingCount: rsvpRes.count ?? 0,
          // biome-ignore lint/suspicious/noExplicitAny: profile may not exist
          coordinatorName: (profileRes.data as any)?.display_name ?? null,
          moreFromCoordinator: more ?? [],
          // biome-ignore lint/suspicious/noExplicitAny: extended types
          tickets: (ticketsRes.data as any) ?? [],
          sponsors: slotsRes.data ?? [],
          isOwner: !!userId && userId === ev.coordinator_id,
        });
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white p-8">
        <div className="mx-auto max-w-4xl">
          <div className="h-96 animate-pulse rounded-3xl bg-slate-100" />
          <div className="mt-6 h-8 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white">
        <div className="text-center">
          <div className="text-6xl">🎈</div>
          <h1 className="mt-4 text-2xl font-bold">Event not found</h1>
          <p className="mt-2 text-slate-500">It may have been removed or is no longer public.</p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/events">Back to events</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { event, image, photos, goingCount, coordinatorName, moreFromCoordinator, tickets, sponsors, isOwner } = data;
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const dateLabel = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeLabel = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(event.title);

  const handleRsvpClick = () => {
    if (signedIn) {
      navigate({ to: "/events/$id/manage", params: { id: event.id } });
    } else {
      setRsvpOpen(true);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const sponsorSlots = sponsors.length > 0 ? sponsors : DEMO_SPONSOR_SLOTS;
  const availableSponsorSlots = sponsorSlots.filter((s) => s.status === "available" || s.status === "reserved");
  const activeSponsors = sponsors.filter((s) => s.status === "sold" || s.status === "active");

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/60 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-fuchsia-600">
          <ArrowLeft className="h-4 w-4" /> All events
        </Link>
        <div className="flex items-center gap-3">
          {isOwner && (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/events/$id/manage" params={{ id: event.id }}>
                <Settings className="mr-1 h-4 w-4" /> Manage
              </Link>
            </Button>
          )}
          <Link to="/events" className="flex items-center gap-2 font-black text-slate-900">
            <PartyPopper className="h-5 w-5 text-fuchsia-500" /> EventHub
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-16">
        {/* Hero card */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.2)]">
          <div className="relative h-72 bg-gradient-to-br from-fuchsia-400 via-pink-400 to-amber-300 md:h-96">
            {image ? (
              <img src={image} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-9xl">🎉</div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-6">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow ${categoryClasses(event.category)}`}>
                {categoryLabel(event.category ?? "other")}
              </span>
              <h1 className="mt-3 text-3xl font-black text-white drop-shadow md:text-5xl">
                {event.title}
              </h1>
            </div>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-3 md:p-8">
            <div className="space-y-4 md:col-span-2">
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-fuchsia-500" />
                  <div>
                    <div className="font-semibold text-slate-900">{dateLabel}</div>
                    <div className="text-slate-500">{timeLabel}</div>
                  </div>
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-sky-500" />
                    <div className="font-semibold text-slate-900">{event.location}</div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-500" />
                  <div>
                    <div className="font-semibold text-slate-900">{goingCount} going 🎊</div>
                    <div className="text-slate-500">Join the community</div>
                  </div>
                </div>
              </div>

              {event.event_format && event.event_format !== "in_person" && event.virtual_link && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                  <div className="flex items-center gap-2 font-semibold text-sky-900">
                    <Video className="h-4 w-4" /> {event.event_format === "hybrid" ? "Hybrid event" : "Virtual event"}
                  </div>
                  <a
                    href={event.virtual_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block break-all text-sm text-sky-700 underline hover:text-sky-900"
                  >
                    {event.virtual_link}
                  </a>
                </div>
              )}

              {event.description && (
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <Sparkles className="h-4 w-4 text-amber-500" /> About this event
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700 leading-relaxed">
                    {event.description}
                  </p>
                </div>
              )}

              {coordinatorName && (
                <div className="pt-2 text-sm text-slate-500">
                  Hosted by <span className="font-semibold text-slate-800">{coordinatorName}</span>
                </div>
              )}
            </div>

            {/* RSVP + share sidebar */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-fuchsia-50 to-amber-50 p-5 text-center">
                <div className="text-3xl">🎟️</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">Save your spot</div>
                <Button
                  onClick={handleRsvpClick}
                  className="mt-3 w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white hover:opacity-95"
                  size="lg"
                >
                  {signedIn ? "RSVP now" : "Sign in to RSVP"}
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Share2 className="h-4 w-4" /> Share this event
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <a
                    href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center rounded-xl bg-sky-50 py-2 text-sky-600 hover:bg-sky-100"
                    aria-label="Share on Twitter"
                  >
                    <Twitter className="h-4 w-4" />
                  </a>
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center rounded-xl bg-blue-50 py-2 text-blue-600 hover:bg-blue-100"
                    aria-label="Share on Facebook"
                  >
                    <Facebook className="h-4 w-4" />
                  </a>
                  <a
                    href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}
                    className="flex items-center justify-center rounded-xl bg-rose-50 py-2 text-rose-600 hover:bg-rose-100"
                    aria-label="Share by email"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Sponsorship / ad slots */}
        <section className="mt-10 rounded-3xl border border-amber-100 bg-gradient-to-b from-amber-50/70 to-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Megaphone className="h-5 w-5 text-amber-500" /> Featured Sponsors & Ad Slots
            </h2>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {availableSponsorSlots.length} slot{availableSponsorSlots.length === 1 ? "" : "s"} available
            </span>
          </div>
          <div className="space-y-3">
            {activeSponsors.map((slot) => (
              <div
                key={slot.id}
                className="relative overflow-hidden rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-6 shadow-sm"
              >
                <div className="absolute right-4 top-4 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-white shadow">
                  ⭐ Featured
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow">
                    {slot.slot_type === "banner" ? "🎯" : slot.slot_type === "video" ? "🎬" : "📣"}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                      Position #{slot.position} · {slot.slot_type}
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      Community partner spotlight
                    </div>
                    <div className="text-sm text-slate-600">
                      Sponsored placement shown to everyone viewing this event.
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {availableSponsorSlots.map((slot) => (
              <div
                key={slot.id}
                className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-5 transition-colors hover:border-fuchsia-300 sm:flex-row sm:items-center"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-100 to-amber-100 text-3xl">
                  ✨
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {slot.slot_type} · Position #{slot.position}
                  </div>
                  <div className="font-bold text-slate-900">Sponsor slot available</div>
                  <div className="text-sm text-slate-500">
                    Full-width ad card placeholder · Starting at {formatPrice(slot.cost_cents)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => (signedIn ? navigate({ to: "/events/$id/manage", params: { id: event.id } }) : setRsvpOpen(true))}
                >
                  Become a sponsor
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Ticket tiers */}
        {tickets.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
              <Ticket className="h-5 w-5 text-fuchsia-500" /> Get your tickets
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {tickets.map((t) => {
                const remaining =
                  t.quantity_available != null
                    ? Math.max(0, t.quantity_available - (t.quantity_sold ?? 0))
                    : null;
                const soldOut = remaining === 0;
                const price = t.early_bird && t.early_bird_price_cents != null ? t.early_bird_price_cents : t.price_cents;
                return (
                  <div
                    key={t.id}
                    className={`relative rounded-2xl border-2 p-5 transition-all ${
                      soldOut
                        ? "border-slate-200 bg-slate-50 opacity-70"
                        : "border-fuchsia-100 bg-white shadow-sm hover:-translate-y-0.5 hover:border-fuchsia-300 hover:shadow-md"
                    }`}
                  >
                    {t.early_bird && !soldOut && (
                      <div className="absolute -top-2 right-4 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-bold text-white shadow">
                        <Star className="mr-1 inline h-3 w-3" /> Early bird
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900">{t.name}</div>
                        {t.description && (
                          <div className="mt-1 text-sm text-slate-500">{t.description}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-fuchsia-600">{formatPrice(price)}</div>
                        {remaining != null && !soldOut && (
                          <div className="text-xs text-slate-500">{remaining} left</div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={handleRsvpClick}
                      disabled={soldOut}
                      className="mt-4 w-full rounded-full"
                    >
                      {soldOut ? "Sold out" : signedIn ? "Buy ticket" : "Sign in to buy"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Photo gallery carousel */}
        {photos.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold text-slate-900">📸 Event gallery</h2>
            <div className="relative overflow-hidden rounded-3xl bg-slate-900">
              <img
                src={photos[photoIdx].photo_url}
                alt={photos[photoIdx].caption ?? "Event photo"}
                className="h-96 w-full object-cover"
              />
              {photos[photoIdx].caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-sm text-white">
                  {photos[photoIdx].caption}
                </div>
              )}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIdx((i) => (i === 0 ? photos.length - 1 : i - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                    {photoIdx + 1} / {photos.length}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* More from this coordinator */}
        {moreFromCoordinator.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-xl font-bold text-slate-900">More from this host ✨</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {moreFromCoordinator.map((m) => (
                <Link
                  key={m.id}
                  to="/events/$id"
                  params={{ id: m.id }}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-400 to-amber-300 text-2xl">
                    🎈
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 font-semibold text-slate-900 group-hover:text-fuchsia-600">
                      {m.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(m.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" · "}
                      {categoryLabel(m.category ?? "other")}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Dialog open={rsvpOpen} onOpenChange={setRsvpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 Almost there!</DialogTitle>
            <DialogDescription>
              Sign in (it's free) to RSVP, save events, and get updates from coordinators.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRsvpOpen(false)}>
              Keep browsing
            </Button>
            <Button asChild className="rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500">
              <Link to="/auth">Sign in to RSVP</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}