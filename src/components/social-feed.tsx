import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import type { CalendarEvent } from "@/queries/events";
import { fmtEventDate, fmtTime, isMultiDay } from "@/queries/events";
import { categoryLabel } from "@/lib/categories";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 20;

type CampaignAd = {
  ad_key: string;
  scope: "calendars" | "geo" | "network" | "event";
  business_name: string;
  logo_url: string | null;
  link_url: string | null;
  headline: string | null;
  body: string | null;
};

type SlotAd = {
  slot_id: string;
  business_name: string;
  logo_url: string | null;
  link_url: string | null;
  headline: string | null;
  body: string | null;
};

const categoryFallback: Record<string, string> = {
  sports: "from-emerald-800 via-teal-700 to-cyan-600",
  networking: "from-sky-900 via-blue-700 to-cyan-600",
  education: "from-amber-800 via-orange-700 to-rose-600",
  social: "from-fuchsia-900 via-rose-700 to-orange-500",
  fundraiser: "from-rose-900 via-red-700 to-amber-600",
  workshop: "from-violet-900 via-fuchsia-700 to-pink-600",
  other: "from-slate-900 via-slate-700 to-zinc-500",
};

function safeHttps(value: string | null) {
  return value && /^https:\/\//i.test(value) ? value : null;
}

function formatWhen(event: CalendarEvent) {
  const date = fmtEventDate(event.start_time, event.timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const start = fmtTime(event.start_time, event.timezone);
  if (isMultiDay(event)) {
    const endDate = fmtEventDate(event.end_time, event.timezone, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return `${date} · ${start} – ${endDate} · ${fmtTime(event.end_time, event.timezone)}`;
  }
  return `${date} · ${start} – ${fmtTime(event.end_time, event.timezone)}`;
}

function EventFeedCard({ event }: { event: CalendarEvent }) {
  const image = safeHttps(event.image_url);
  const fallback = categoryFallback[event.category ?? "other"] ?? categoryFallback.other;
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      className={`group relative block aspect-video min-h-52 max-h-[28rem] w-full overflow-hidden rounded-md bg-gradient-to-br ${fallback} shadow-sm outline-none ring-1 ring-foreground/10 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-64`}
      aria-label={`${event.title}, ${formatWhen(event)}`}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.02]"
        />
      ) : null}
      <span className="absolute inset-0 bg-gradient-to-t from-foreground/95 via-foreground/35 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 block p-5 sm:p-7">
        <span className="mb-2 inline-flex rounded-sm bg-background/90 px-2 py-1 text-[11px] font-bold uppercase text-foreground">
          {categoryLabel(event.category ?? "other")}
        </span>
        <span className="line-clamp-3 block text-2xl font-black leading-tight text-background sm:text-3xl">
          {event.title}
        </span>
        <span className="mt-2 block text-sm font-semibold text-background/90 sm:text-base">
          {formatWhen(event)}
        </span>
      </span>
    </Link>
  );
}

function FeedAdCard({ ad, onVisible }: { ad: CampaignAd; onVisible: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const logo = safeHttps(ad.logo_url);
  const hasLink = safeHttps(ad.link_url);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onVisible(ad.ad_key);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ad.ad_key, onVisible]);

  const content = (
    <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-background/90 px-2 py-1 text-[11px] font-bold uppercase text-foreground">
        <Megaphone className="h-3.5 w-3.5" /> Sponsored
      </span>
      <span className="flex items-end gap-4">
        {logo ? (
          <img
            src={logo}
            alt={`${ad.business_name} logo`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-14 w-14 shrink-0 rounded-md bg-background object-contain p-1 sm:h-16 sm:w-16"
          />
        ) : null}
        <span className="min-w-0">
          <span className="block text-sm font-bold text-background/80">{ad.business_name}</span>
          {ad.headline ? (
            <span className="mt-1 line-clamp-2 block text-xl font-black leading-tight text-background sm:text-2xl">
              {ad.headline}
            </span>
          ) : null}
          {ad.body ? <span className="mt-1 line-clamp-2 block text-sm text-background/85">{ad.body}</span> : null}
        </span>
      </span>
    </div>
  );

  return (
    <div
      ref={ref}
      data-feed-ad={ad.ad_key}
      className="relative aspect-video min-h-52 max-h-[28rem] overflow-hidden rounded-md bg-gradient-to-br from-slate-950 via-slate-800 to-amber-700 shadow-sm ring-1 ring-amber-500/30 sm:min-h-64"
    >
      {hasLink ? (
        <a
          href={`/api/ad/c/${encodeURIComponent(ad.ad_key)}?s=feed`}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Sponsored: ${ad.business_name}${ad.headline ? `, ${ad.headline}` : ""}`}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="space-y-3" aria-label="Loading more events" aria-live="polite">
      {[0, 1].map((key) => (
        <div key={key} className="aspect-video min-h-52 animate-pulse rounded-md bg-muted sm:min-h-64" />
      ))}
    </div>
  );
}

export function SocialFeed({
  coordinatorId,
  slug,
  events,
}: {
  coordinatorId: string;
  slug: string;
  events: CalendarEvent[];
}) {
  const upcoming = useMemo(
    () => events.filter((event) => new Date(event.end_time).getTime() >= Date.now()),
    [events],
  );
  const storageKey = `eventhub:feed:${slug}`;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<CampaignAd[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const impressed = useRef(new Set<string>());

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const state = JSON.parse(saved) as { count?: number; y?: number };
      setVisibleCount(Math.max(PAGE_SIZE, state.count ?? PAGE_SIZE));
      requestAnimationFrame(() => window.scrollTo({ top: state.y ?? 0 }));
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    return () => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ count: visibleCount, y: window.scrollY }),
      );
    };
  }, [storageKey, visibleCount]);

  useEffect(() => {
    let alive = true;
    // Both RPCs expose creative fields only and keep eligibility in the database.
    // biome-ignore lint/suspicious/noExplicitAny: generated RPC types can lag migrations
    Promise.all([
      (supabase as any).rpc("get_public_coordinator_sponsors", {
        p_coordinator_id: coordinatorId,
        p_limit: 20,
      }),
      (supabase as any).rpc("get_campaign_sponsors_for_calendar", {
        p_coordinator_id: coordinatorId,
        p_limit: 20,
      }),
    ]).then(([slotResult, campaignResult]: [{ data: SlotAd[] | null }, { data: CampaignAd[] | null }]) => {
        if (!alive) return;
        const slots: CampaignAd[] = (slotResult.data ?? []).map((row) => ({
          ad_key: row.slot_id,
          scope: "event",
          business_name: row.business_name,
          logo_url: row.logo_url,
          link_url: row.link_url,
          headline: row.headline,
          body: row.body,
        }));
        const rows = [...slots, ...(campaignResult.data ?? [])];
        const priority = rows[0]?.scope;
        const peers = rows.filter((row) => row.scope === priority);
        const rest = rows.filter((row) => row.scope !== priority);
        const offset = peers.length > 0 ? Math.floor(Math.random() * peers.length) : 0;
        const rotated = [...peers.slice(offset), ...peers.slice(0, offset), ...rest];
        setAds(rotated.slice(0, 2));
      });
    return () => {
      alive = false;
    };
  }, [coordinatorId]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || visibleCount >= upcoming.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || loading) return;
      setLoading(true);
      window.setTimeout(() => {
        setVisibleCount((count) => Math.min(count + PAGE_SIZE, upcoming.length));
        setLoading(false);
      }, 180);
    }, { rootMargin: "400px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, upcoming.length, visibleCount]);

  const recordImpression = useCallback((key: string) => {
    if (impressed.current.has(key)) return;
    impressed.current.add(key);
    const pixel = new Image(1, 1);
    pixel.referrerPolicy = "no-referrer";
    pixel.src = `/api/ad/i/${encodeURIComponent(key)}?s=feed`;
  }, []);

  const shown = upcoming.slice(0, visibleCount);
  const adBreak = (key: string) =>
    ads.length > 0 ? (
      <section key={key} aria-label="Sponsored advertisers" className="space-y-3" data-feed-ad-break>
        {ads.map((ad) => <FeedAdCard key={ad.ad_key} ad={ad} onVisible={recordImpression} />)}
      </section>
    ) : null;

  return (
    <div className="-mx-4 w-[calc(100%+2rem)] max-w-3xl space-y-3 sm:mx-auto sm:w-full" data-social-feed data-event-count={upcoming.length}>
      {upcoming.length < 3 ? adBreak("top") : null}
      {shown.map((event, index) => (
        <div key={event.id} className="space-y-3" data-feed-event={event.id}>
          <EventFeedCard event={event} />
          {upcoming.length >= 3 && (index + 1) % 3 === 0 ? adBreak(`after-${index + 1}`) : null}
        </div>
      ))}
      {upcoming.length === 0 ? (
        <div className="border-y border-border px-5 py-12 text-center text-muted-foreground">
          <p className="font-semibold text-foreground">No upcoming events yet</p>
          <p className="mt-1 text-sm">Check back soon.</p>
        </div>
      ) : null}
      {visibleCount < upcoming.length ? <div ref={sentinel} className="h-1" aria-hidden="true" /> : null}
      {loading ? <SkeletonCards /> : null}
    </div>
  );
}