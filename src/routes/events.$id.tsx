import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upsertRsvp } from "@/lib/tracking.functions";
import { purchaseTicket, createTicketCheckout, listMyPurchases } from "@/lib/monetization.functions";
import { getEventOrganizers, type Organizer, type PersonKind } from "@/lib/organizers.functions";
import { Button } from "@/components/ui/button";
import { categoryClasses, categoryLabel } from "@/lib/categories";
import { fmtTime } from "@/queries/events";
import { viewerTimeZone } from "@/lib/timezone";
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

// ?buy=<tierId> carries a signed-out visitor's purchase intent through the
// sign-in round trip; ?purchase=success|canceled is Stripe Checkout's own
// return.
const searchSchema = z.object({
  buy: z.string().uuid().optional(),
  purchase: z.enum(["success", "canceled"]).optional(),
  session_id: z.string().optional(),
});

export const Route = createFileRoute("/events/$id")({
  component: PublicEventDetail,
  validateSearch: (s) => searchSchema.parse(s),
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
    timezone?: string | null;
    visibility?: "public" | "unlisted" | null;
  };
  image: string | null;
  photos: { id: string; photo_url: string; caption: string | null }[];
  goingCount: number;
  coordinatorName: string | null;
  /** null when the coordinator's own profile isn't public yet (setup
   *  incomplete) -- people still render, just without a link to /c/$slug. */
  coordinatorSlug: string | null;
  people: (Organizer & { role: PersonKind })[];
  moreFromCoordinator: { id: string; title: string; start_time: string; category: string | null }[];
  tickets: {
    id: string;
    name: string;
    description: string | null;
    price_cents: number;
    quantity_available: number | null;
    quantity_sold: number | null;
    early_bird?: boolean | null;
    early_bird_price_cents: number | null;
  }[];
  sponsors: {
    id: string;
    position: number;
    slot_type: string;
    status: string;
    cost_cents: number;
  }[];
  sponsorAds: SponsorAd[];
  isOwner: boolean;
};

/** Public-facing sponsor creative, from get_public_sponsors(). Deliberately
 *  carries no commercial terms: no cost, no buyer, no advertiser contact. */
type SponsorAd = {
  slot_id: string;
  position: number;
  slot_type: string;
  business_name: string;
  logo_url: string | null;
  link_url: string | null;
  headline: string | null;
  body: string | null;
};

/** The database constrains these to https://, but this renders into a page and
 *  the check is cheap, so it is enforced here too rather than assumed. */
function safeHttps(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Organized-by / Speakers block on the event page. Each person links to
 *  their /c/$slug/p/$id profile when the coordinator's own calendar is
 *  public (`coordinatorSlug` set); otherwise renders as plain text rather
 *  than a dead link. */
function PeopleBlock({
  title,
  people,
  coordinatorSlug,
}: {
  title: string;
  people: Organizer[];
  coordinatorSlug: string | null;
}) {
  return (
    <div className="pt-2">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-3">
        {people.map((p) => {
          const inner = (
            <>
              {p.photo_url ? (
                <img
                  src={p.photo_url}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                {p.title && <div className="truncate text-xs text-slate-500">{p.title}</div>}
              </div>
            </>
          );
          return coordinatorSlug ? (
            <Link
              key={p.id}
              to="/c/$slug/p/$id"
              params={{ slug: coordinatorSlug, id: p.id }}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 hover:border-fuchsia-300"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3"
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DEMO_SPONSOR_SLOTS = [
  { id: "demo-hero", position: 1, slot_type: "banner", status: "available", cost_cents: 25000 },
  { id: "demo-community", position: 2, slot_type: "card", status: "available", cost_cents: 15000 },
];

function PublicEventDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  /** Which tier prompted the sign-in dialog, if any -- lets the dialog say
   *  "sign in to buy" instead of the generic RSVP copy, and carries the
   *  intent through to /auth's `next` param. */
  const [buyIntentTierId, setBuyIntentTierId] = useState<string | null>(null);
  const [checkoutBusyTierId, setCheckoutBusyTierId] = useState<string | null>(null);
  const [purchaseBanner, setPurchaseBanner] = useState<
    "confirming" | "confirmed" | "canceled" | "timeout" | null
  >(search.purchase === "success" ? "confirming" : search.purchase === "canceled" ? "canceled" : null);
  /** The visitor's own RSVP, and the going count once they change it. Both are
   *  null until known, so the loader's count is shown in the meantime. */
  const [myRsvp, setMyRsvp] = useState<"going" | "interested" | "declined" | null>(null);
  const [goingOverride, setGoingOverride] = useState<number | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [rsvpNote, setRsvpNote] = useState<string | null>(null);
  const [sponsorOpen, setSponsorOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  // The "Users manage own rsvp" policy covers exactly this row and no other, so
  // a visitor can be shown their own state without seeing anyone else's.
  useEffect(() => {
    if (!userId) {
      setMyRsvp(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: mine } = await supabase
        .from("event_rsvps")
        .select("status")
        .eq("event_id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) setMyRsvp((mine?.status as "going" | "interested" | "declined") ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // biome-ignore lint/suspicious/noExplicitAny: extended columns not yet in generated types
      const { data: ev } = await (supabase as any)
        .from("events")
        .select(
          "id, title, description, location, start_time, end_time, category, coordinator_id, event_format, virtual_link, status, timezone, visibility",
        )
        .eq("id", id)
        .maybeSingle();
      if (!ev || ev.status !== "approved") {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
        return;
      }
      const [
        detailsRes,
        photosRes,
        rsvpCountsRes,
        profileRes,
        ticketsRes,
        slotsRes,
        adsRes,
        slugRes,
        people,
      ] = await Promise.all([
          supabase
            .from("event_details")
            .select("landscape_image_url, portrait_image_url")
            .eq("event_id", id)
            .maybeSingle(),
          supabase
            .from("event_photos")
            .select("id, photo_url, caption")
            .eq("event_id", id)
            .order("created_at", { ascending: false }),
          // event_rsvps' own RLS only lets a caller read their own row (or an
          // event's staff/admin see everyone's), so a direct count here reads
          // as zero for almost every visitor -- including signed-in attendees
          // who are not staff. This RPC returns the true aggregate without
          // exposing who is attending.
          // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
          (supabase as any).rpc("get_event_rsvp_counts", { p_event_id: id }),
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", ev.coordinator_id)
            .maybeSingle(),
          supabase
            .from("event_tickets")
            .select(
              "id, name, description, price_cents, quantity_available, quantity_sold, early_bird, early_bird_price_cents",
            )
            .eq("event_id", id)
            .order("price_cents"),
          supabase
            .from("sponsored_slots")
            .select("id, position, slot_type, status, cost_cents")
            .eq("event_id", id)
            .order("position"),
          // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
          (supabase as any).rpc("get_public_sponsors", { p_event_id: id }),
          // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
          (supabase as any).rpc("get_coordinator_slug", { p_coordinator_id: ev.coordinator_id }),
          getEventOrganizers({ data: { event_id: id } }).catch(() => []),
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
          image:
            detailsRes.data?.landscape_image_url ?? detailsRes.data?.portrait_image_url ?? null,
          photos: photosRes.data ?? [],
          goingCount: (rsvpCountsRes.data?.[0]?.going as number | undefined) ?? 0,
          // biome-ignore lint/suspicious/noExplicitAny: profile may not exist
          coordinatorName: (profileRes.data as any)?.display_name ?? null,
          coordinatorSlug: (slugRes.data as string | null) ?? null,
          people,
          moreFromCoordinator: more ?? [],
          // biome-ignore lint/suspicious/noExplicitAny: extended types
          tickets: (ticketsRes.data as any) ?? [],
          sponsors: slotsRes.data ?? [],
          sponsorAds: (adsRes.data as SponsorAd[] | null) ?? [],
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

  /** Returning from Stripe Checkout with ?purchase=success -- the webhook
   *  confirms the purchase async, so this polls rather than trusting the
   *  redirect alone. Matches spec 01's "Confirming payment..." / 15s
   *  timeout behavior. */
  useEffect(() => {
    if (search.purchase !== "success") return;
    let cancelled = false;
    const deadline = Date.now() + 15_000;
    async function poll() {
      while (!cancelled && Date.now() < deadline) {
        try {
          const purchases = await listMyPurchases({ data: { event_id: id } });
          if (purchases.some((p: { status: string }) => p.status === "confirmed")) {
            if (!cancelled) setPurchaseBanner("confirmed");
            return;
          }
        } catch {
          // keep polling -- a transient error here shouldn't flip to timeout early
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setPurchaseBanner("timeout");
    }
    void poll();
    navigate({ to: "/events/$id", params: { id }, search: {}, replace: true });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.purchase, id]);

  useEffect(() => {
    if (search.purchase === "canceled") {
      toast("Purchase canceled. No charge.");
      navigate({ to: "/events/$id", params: { id }, search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.purchase, id]);

  /** A signed-out visitor who clicked Buy is sent to /auth?next=…, which
   *  redirects back here with ?buy=<tierId> once signed in -- resume their
   *  intent automatically instead of making them find the button again. */
  useEffect(() => {
    if (!search.buy || !signedIn || !data) return;
    const tier = data.tickets.find((t) => t.id === search.buy);
    if (!tier) return;
    navigate({ to: "/events/$id", params: { id }, search: {}, replace: true });
    void handleBuyClick(tier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.buy, signedIn, data]);

  async function handleBuyClick(tier: Detail["tickets"][number]) {
    if (!signedIn) {
      setBuyIntentTierId(tier.id);
      setRsvpOpen(true);
      return;
    }
    setCheckoutBusyTierId(tier.id);
    try {
      const price =
        tier.early_bird && tier.early_bird_price_cents != null
          ? tier.early_bird_price_cents
          : tier.price_cents;
      if (price === 0) {
        const res = await purchaseTicket({ data: { ticket_id: tier.id, quantity: 1 } });
        toast.success("You're confirmed! Check your tickets on your dashboard.");
        if (res.checkout_url) window.location.href = res.checkout_url;
        return;
      }
      const res = await createTicketCheckout({ data: { ticket_id: tier.id, quantity: 1 } });
      window.location.href = res.checkout_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setCheckoutBusyTierId(null);
    }
  }

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

  const {
    event,
    image,
    photos,
    goingCount,
    coordinatorName,
    coordinatorSlug,
    people,
    moreFromCoordinator,
    tickets,
    sponsors,
    sponsorAds,
    isOwner,
  } = data;
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const eventTz = event.timezone || "UTC";
  const viewerTz = viewerTimeZone();
  // Spec 03 F2: the primary line is always the event's own zone -- "Saturday
  // 6pm" means 6pm in that town, not a silent conversion to whoever's
  // looking. A secondary "your time" line only appears when it would
  // actually read differently for this viewer.
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: eventTz,
  });
  const timeLabel = `${fmtTime(start, eventTz, { abbr: true })} – ${fmtTime(end, eventTz, { abbr: true })}`;
  const viewerDiffers = viewerTz !== eventTz;
  const viewerTimeLabel = viewerDiffers
    ? `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: viewerTz })}, ${fmtTime(start, viewerTz, { abbr: true })} – ${fmtTime(end, viewerTz, { abbr: true })} your time`
    : null;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(event.title);

  /**
   * RSVPs. Previously this sent a signed-in visitor to /events/$id/manage --
   * the coordinator's management screen -- so the primary call to action on
   * every event page did not RSVP anybody, and pushed attendees at a page that
   * is not theirs.
   *
   * Clicking again withdraws, because there was previously no way to undo.
   */
  const handleRsvpClick = async () => {
    if (!signedIn) {
      setRsvpOpen(true);
      return;
    }
    setRsvpBusy(true);
    setRsvpNote(null);
    try {
      const next = myRsvp === "going" ? "declined" : "going";
      const res = await upsertRsvp({ data: { event_id: event.id, status: next } });
      setMyRsvp((res.myRsvp as "going" | "interested" | "declined") ?? null);
      setGoingOverride(res.counts.going);
      if (res.waitlisted) {
        setRsvpNote(
          res.waitlistPosition
            ? `This event is full — you're #${res.waitlistPosition} on the waitlist.`
            : "This event is full — you've been added to the waitlist.",
        );
      }
    } catch (e) {
      setRsvpNote(e instanceof Error ? e.message : "Could not save your RSVP.");
    } finally {
      setRsvpBusy(false);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const sponsorSlots = sponsors.length > 0 ? sponsors : DEMO_SPONSOR_SLOTS;
  const availableSponsorSlots = sponsorSlots.filter(
    (s) => s.status === "available" || s.status === "reserved",
  );
  const activeSponsors = sponsors.filter((s) => s.status === "paid");
  const adsBySlot = new Map(sponsorAds.map((a) => [a.slot_id, a]));

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/60 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-fuchsia-600"
        >
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

      {purchaseBanner && (
        <div className="mx-auto max-w-4xl px-6">
          <div
            className={`mb-4 rounded-2xl border p-4 text-sm ${
              purchaseBanner === "confirmed"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : purchaseBanner === "timeout"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {purchaseBanner === "confirming" && "Confirming payment…"}
            {purchaseBanner === "confirmed" &&
              "You're confirmed! 🎉 Find your ticket QR code on your dashboard."}
            {purchaseBanner === "timeout" &&
              "Still confirming — refresh this page in a moment and your ticket will appear once payment lands."}
          </div>
        </div>
      )}

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
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow ${categoryClasses(event.category)}`}
              >
                {categoryLabel(event.category ?? "other")}
              </span>
              {event.visibility === "unlisted" && (
                // Quiet, not a scare banner -- someone with a shared link
                // shouldn't expect to find this on the public calendar later,
                // but there's nothing alarming about an unlisted event.
                <span className="ml-2 inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white shadow">
                  Unlisted event
                </span>
              )}
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
                    {viewerTimeLabel && (
                      <div className="text-xs text-slate-400">{viewerTimeLabel}</div>
                    )}
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
                    <div className="font-semibold text-slate-900">
                      {goingOverride ?? goingCount} going 🎊
                    </div>
                    <div className="text-slate-500">Join the community</div>
                  </div>
                </div>
              </div>

              {event.event_format && event.event_format !== "in_person" && event.virtual_link && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                  <div className="flex items-center gap-2 font-semibold text-sky-900">
                    <Video className="h-4 w-4" />{" "}
                    {event.event_format === "hybrid" ? "Hybrid event" : "Virtual event"}
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

              {people.some((p) => p.role === "organizer" || p.role === "both") && (
                <PeopleBlock
                  title="Organized by"
                  people={people.filter((p) => p.role === "organizer" || p.role === "both")}
                  coordinatorSlug={coordinatorSlug}
                />
              )}

              {people.some((p) => p.role === "speaker" || p.role === "both") && (
                <PeopleBlock
                  title="Speakers"
                  people={people.filter((p) => p.role === "speaker" || p.role === "both")}
                  coordinatorSlug={coordinatorSlug}
                />
              )}
            </div>

            {/* RSVP + share sidebar */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-fuchsia-50 to-amber-50 p-5 text-center">
                <div className="text-3xl">🎟️</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  {myRsvp === "going" ? "You're going" : "Save your spot"}
                </div>
                <Button
                  onClick={handleRsvpClick}
                  disabled={rsvpBusy}
                  className="mt-3 w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white hover:opacity-95"
                  size="lg"
                >
                  {rsvpBusy
                    ? "Saving…"
                    : !signedIn
                      ? "Sign in to RSVP"
                      : myRsvp === "going"
                        ? "Cancel my RSVP"
                        : "RSVP now"}
                </Button>
                {rsvpNote && <p className="mt-2 text-xs text-slate-600">{rsvpNote}</p>}
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
              {availableSponsorSlots.length} slot{availableSponsorSlots.length === 1 ? "" : "s"}{" "}
              available
            </span>
          </div>
          <div className="space-y-3">
            {activeSponsors.map((slot) => {
              const ad = adsBySlot.get(slot.id);
              const logo = safeHttps(ad?.logo_url ?? null);
              // Same-origin, so a relative URL is enough. The destination is
              // resolved from the slot at click time rather than carried in the
              // link -- putting it in the URL would make this an open redirect
              // on our own domain.
              const link = safeHttps(ad?.link_url ?? null)
                ? `/api/ad/c/${encodeURIComponent(slot.id)}?s=site`
                : null;
              const inner = (
                <>
                  <div className="absolute right-4 top-4 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-white shadow">
                    ⭐ Sponsored
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-3xl shadow">
                      {logo ? (
                        <img
                          src={logo}
                          alt={ad ? `${ad.business_name} logo` : ""}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                        />
                      ) : slot.slot_type === "banner" ? (
                        "🎯"
                      ) : (
                        "📣"
                      )}
                    </div>
                    <div className="flex-1">
                      {/* An advertiser's name is a brand, so it keeps its own
                          casing; only the generic slot label is uppercased. */}
                      {ad ? (
                        <div className="text-sm font-semibold text-amber-800">
                          {ad.business_name}
                        </div>
                      ) : (
                        <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                          {`Position #${slot.position} · ${slot.slot_type}`}
                        </div>
                      )}
                      <div className="mt-1 text-lg font-bold text-slate-900">
                        {ad?.headline ?? "Community partner spotlight"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {ad?.body ?? "Sponsored placement shown to everyone viewing this event."}
                      </div>
                    </div>
                  </div>
                  {/* Counts a view. Rendered in the markup rather than fired
                      from an effect so it survives ad blockers and works before
                      hydration, and lazily so an ad nobody scrolled to is not
                      billed as one somebody saw. Only real creative is
                      counted -- an empty placeholder slot is not an advertiser
                      impression. */}
                  {ad ? (
                    <img
                      src={`/api/ad/i/${encodeURIComponent(slot.id)}?s=site`}
                      alt=""
                      width={1}
                      height={1}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      aria-hidden="true"
                      className="pointer-events-none absolute h-px w-px opacity-0"
                    />
                  ) : null}
                </>
              );
              const className =
                "relative block overflow-hidden rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-6 shadow-sm";
              // rel="sponsored" is what tells search engines this is paid
              // placement; without it these links look like editorial ones.
              return link ? (
                <a
                  key={slot.id}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className={`${className} transition-shadow hover:shadow-md`}
                >
                  {inner}
                </a>
              ) : (
                <div key={slot.id} className={className}>
                  {inner}
                </div>
              );
            })}
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
                  // Only the owner manages slots. This used to send any signed-in
                  // visitor to /events/$id/manage -- a page that is not theirs -- and
                  // show anonymous visitors the RSVP dialog, which talks about saving
                  // events. An advertiser reading the slot price deserves an answer
                  // about sponsoring: it is the one path the free-with-sponsors model
                  // depends on.
                  onClick={() =>
                    isOwner
                      ? navigate({ to: "/events/$id/manage", params: { id: event.id } })
                      : setSponsorOpen(true)
                  }
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
                const price =
                  t.early_bird && t.early_bird_price_cents != null
                    ? t.early_bird_price_cents
                    : t.price_cents;
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
                        <div className="text-2xl font-black text-fuchsia-600">
                          {formatPrice(price)}
                        </div>
                        {remaining != null && !soldOut && (
                          <div className="text-xs text-slate-500">{remaining} left</div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleBuyClick(t)}
                      disabled={soldOut || checkoutBusyTierId === t.id}
                      className="mt-4 w-full rounded-full"
                    >
                      {soldOut
                        ? "Sold out"
                        : checkoutBusyTierId === t.id
                          ? "Redirecting…"
                          : signedIn
                            ? "Buy ticket"
                            : "Sign in to buy"}
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
                      {new Date(m.start_time).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
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

      <Dialog open={sponsorOpen} onOpenChange={setSponsorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sponsor this event</DialogTitle>
            <DialogDescription>
              {coordinatorName
                ? `Sponsorships for this event are arranged directly with ${coordinatorName}.`
                : "Sponsorships for this event are arranged directly with the organizer."}{" "}
              Get in touch and they can reserve a slot for you — your logo, headline and link then
              appear here and on every site that embeds this calendar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSponsorOpen(false)}>
              Close
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/events">See other events</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rsvpOpen}
        onOpenChange={(v) => {
          setRsvpOpen(v);
          if (!v) setBuyIntentTierId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎉 Almost there!</DialogTitle>
            <DialogDescription>
              {buyIntentTierId
                ? "Sign in (it's free) to buy your ticket — we'll bring you right back here."
                : "Sign in (it's free) to RSVP, save events, and get updates from coordinators."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRsvpOpen(false)}>
              Keep browsing
            </Button>
            <Button asChild className="rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500">
              <Link
                to="/auth"
                search={{
                  next: buyIntentTierId ? `/events/${id}?buy=${buyIntentTierId}` : `/events/${id}`,
                }}
              >
                {buyIntentTierId ? "Sign in to buy" : "Sign in to RSVP"}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
