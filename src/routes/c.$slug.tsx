import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { CalendarDays, ChevronLeft, ChevronRight, Compass, PartyPopper } from "lucide-react";
import { getPublicCoordinator } from "@/lib/coordinator.functions";
import { fetchEvents, fetchNearbyEvents, addDays, startOfWeek, type NearbyEvent } from "@/queries/events";
import { MonthView } from "@/components/CalendarViews/MonthView";
import { DayView } from "@/components/CalendarViews/DayView";
import { ListView } from "@/components/CalendarViews/ListView";
import { AgendaView } from "@/components/CalendarViews/AgendaView";
import { WeekView } from "@/views/WeekView";
import { PhotoView } from "@/views/PhotoView";
import { SummaryView } from "@/views/SummaryView";
import { TimelineView } from "@/views/TimelineView";
import { supabase } from "@/integrations/supabase/client";
import { siteUrl } from "@/lib/site-url";
import { brandWash, findPresetByColor } from "@/lib/organizer-presets";

/** Every view the platform has, minus the ones that need geo state the embed
 *  does not carry. Adding a view here is all it takes to expose it. */
const VIEWS = ["month", "week", "day", "list", "agenda", "photo", "summary", "timeline"] as const;
type ViewKey = (typeof VIEWS)[number];
const DEFAULT_VIEW: ViewKey = "month";
const ANCHOR_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIEW_LABELS: Record<ViewKey, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  list: "List",
  agenda: "Agenda",
  photo: "Photos",
  summary: "Summary",
  timeline: "Timeline",
};

/** Every param is optional and nothing is defaulted here.
 *
 *  A `.default()` makes the router rewrite /c/acme to /c/acme?view=month&q=&on=
 *  before it will render -- a 307 on the one URL an organizer actually hands
 *  out, and three near-identical URLs for search engines to pick between.
 *  Defaults are resolved in the component instead, so the bare URL stays bare
 *  and only params a visitor really chose ever appear. */
const searchSchema = z.object({
  view: fallback(z.string(), "").optional(),
  q: fallback(z.string(), "").optional(),
  /** Anchor date as YYYY-MM-DD. Real URLs mean crawlers and no-JS visitors can
   *  page through the calendar, which is what makes an embed indexable. */
  on: fallback(z.string(), "").optional(),
});

type CalendarSearch = z.infer<typeof searchSchema>;

/** Drops anything at its default so generated links carry only what differs
 *  from the bare URL. Without this, one click on "Month" would pin ?q=&on= to
 *  every link the visitor copies from then on. */
function tidy(next: CalendarSearch): CalendarSearch {
  const out: CalendarSearch = {};
  // Junk a visitor arrived with is dropped rather than carried along, so a
  // shared ?view=bogus link heals itself on the first click.
  if (next.view && next.view !== DEFAULT_VIEW && (VIEWS as readonly string[]).includes(next.view))
    out.view = next.view;
  if (next.q) out.q = next.q;
  if (next.on && ANCHOR_RE.test(next.on)) out.on = next.on;
  return out;
}

export const Route = createFileRoute("/c/$slug")({
  validateSearch: zodValidator(searchSchema),
  // Both the profile and the events resolve server-side, so the crawler
  // receives a populated calendar rather than an empty shell it would have to
  // execute JavaScript to fill. That is what makes this page indexable, and the
  // embed inherits the same property.
  loader: async ({ params }) => {
    const coordinator = await getPublicCoordinator({ data: { slug: params.slug } });
    if (!coordinator) throw notFound();
    const events = await fetchEvents({
      coordinator: coordinator.coordinator_id,
      limit: 400,
    });

    // Cross-promotion, opt-in per coordinator (default on): anchor on the
    // average location of this coordinator's own upcoming events, and look
    // for other organizers' events nearby. No anchor, no section -- there's
    // nothing honest to search from.
    let nearby: NearbyEvent[] = [];
    if (coordinator.show_nearby_events) {
      const withLoc = events.filter(
        (e): e is typeof e & { latitude: number; longitude: number } =>
          e.latitude != null && e.longitude != null,
      );
      if (withLoc.length > 0) {
        const lat = withLoc.reduce((s, e) => s + e.latitude, 0) / withLoc.length;
        const lng = withLoc.reduce((s, e) => s + e.longitude, 0) / withLoc.length;
        nearby = await fetchNearbyEvents({
          lat,
          lng,
          excludeCoordinator: coordinator.coordinator_id,
        }).catch(() => []);
      }
    }
    return { coordinator, events, nearby };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.coordinator;
    const name = c?.company_name || "Event calendar";
    const description =
      c?.description || `Upcoming events from ${name}. No account needed to browse.`;
    return {
      meta: [
        { title: `${name} — Events` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} — Events` },
        { property: "og:description", content: description },
        ...(c?.logo_url ? [{ property: "og:image", content: c.logo_url }] : []),
      ],
      links: [
        // Every view and every month shows the same calendar in a different
        // shape, so they all credit the one URL an organizer promotes. Without
        // this, ?view=photo and ?on=2027-03-01 compete with /c/slug for the
        // same search results and each gets a fraction of the ranking.
        ...(c?.slug
          ? [{ rel: "canonical", href: siteUrl(`/c/${encodeURIComponent(c.slug)}`) }]
          : []),
        ...(c?.favicon_url ? [{ rel: "icon", href: c.favicon_url }] : []),
      ],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <PartyPopper className="h-10 w-10 text-fuchsia-400" />
      <h1 className="text-2xl font-black text-slate-900">No calendar here</h1>
      <p className="max-w-md text-slate-500">
        This calendar either does not exist or has not finished being set up.
      </p>
      <Link to="/events" className="mt-2 font-semibold text-fuchsia-600 hover:underline">
        Browse all events
      </Link>
    </div>
  ),
  component: CoordinatorCalendar,
});

function parseAnchor(on: string): Date {
  if (ANCHOR_RE.test(on)) {
    const d = new Date(`${on}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function toAnchor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CoordinatorCalendar() {
  const { coordinator, events, nearby } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const [signedIn, setSignedIn] = useState(false);

  const view: ViewKey = (VIEWS as readonly string[]).includes(search.view ?? "")
    ? (search.view as ViewKey)
    : DEFAULT_VIEW;
  const query = search.q ?? "";
  const cursor = useMemo(() => parseAnchor(search.on ?? ""), [search.on]);

  /** `replace` for typing, which would otherwise stack a history entry per
   *  keystroke; a real push for anything a visitor would expect Back to undo. */
  const setSearch = (next: CalendarSearch, replace = false) =>
    navigate({ search: tidy({ ...search, ...next }), replace });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      `${e.title} ${e.description ?? ""} ${e.location ?? ""}`.toLowerCase().includes(q),
    );
  }, [events, query]);

  const periodLabel = useMemo(() => {
    // Timeline's axis defaults to "current month" (spec 05), same cursor
    // semantics as Month.
    if (view === "month" || view === "timeline")
      return cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (view === "day")
      return cursor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    return null;
  }, [view, cursor]);

  const step = (delta: number) => {
    const next =
      view === "month" || view === "timeline"
        ? new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)
        : view === "week"
          ? addDays(cursor, 7 * delta)
          : addDays(cursor, delta);
    setSearch({ on: toAnchor(next) });
  };

  const brand = coordinator.primary_color || "#f97316";
  const brand2 = coordinator.secondary_color || "#06b6d4";
  const name = coordinator.company_name || coordinator.slug;
  const preset = findPresetByColor(coordinator.primary_color);

  return (
    <div className="min-h-screen bg-white">
      {coordinator.custom_css ? (
        // Sanitized on write (sanitizeCustomCss) -- safe to inject as-is.
        // Rendered after every other style on the page, including the
        // theme tokens above, so a coordinator's own CSS can override them.
        <style data-testid="coordinator-custom-css">{coordinator.custom_css}</style>
      ) : null}
      <header
        className="border-b border-slate-200"
        style={{
          background: brandWash(brand, brand2),
          borderTopColor: brand,
          borderTopWidth: 4,
          borderTopStyle: "solid",
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-6">
          {coordinator.logo_url ? (
            <img
              src={coordinator.logo_url}
              alt={`${name} logo`}
              loading="lazy"
              className="h-14 w-14 rounded-2xl border border-slate-200 object-contain"
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl text-white"
              style={{ backgroundColor: brand }}
            >
              <CalendarDays className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black text-slate-900">
              {preset && <span className="mr-1.5">{preset.emoji}</span>}
              {name}
            </h1>
            {coordinator.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">
                {coordinator.description}
              </p>
            )}
          </div>
          <Link
            to="/submit-event"
            search={{ c: coordinator.slug }}
            className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            Submit an event
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-slate-100 p-1">
            {VIEWS.map((v) => (
              <Link
                key={v}
                to="/c/$slug"
                params={{ slug: coordinator.slug }}
                search={tidy({ ...search, view: v })}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {VIEW_LABELS[v]}
              </Link>
            ))}
          </div>

          <input
            value={query}
            onChange={(e) => setSearch({ q: e.target.value }, true)}
            placeholder="Search these events"
            aria-label="Search events"
            className="w-full max-w-xs rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-slate-400 sm:w-auto"
          />
        </div>

        {periodLabel && (
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous period"
              className="rounded-full border border-slate-200 p-1.5 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-lg font-bold text-slate-900">{periodLabel}</span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next period"
              className="rounded-full border border-slate-200 p-1.5 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {view === "agenda" ? (
          <AgendaView
            signedIn={signedIn}
            filters={{ coordinator: coordinator.coordinator_id }}
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
            No events on this calendar yet.
          </div>
        ) : view === "month" ? (
          <MonthView cursor={cursor} events={filtered} />
        ) : view === "week" ? (
          <WeekView cursor={cursor} events={filtered} />
        ) : view === "day" ? (
          <DayView cursor={cursor} events={filtered} />
        ) : view === "list" ? (
          <ListView events={filtered} />
        ) : view === "photo" ? (
          <PhotoView events={filtered} />
        ) : view === "timeline" ? (
          <TimelineView cursor={cursor} events={filtered} />
        ) : (
          <SummaryView events={filtered} />
        )}

        {nearby.length > 0 && (
          <div className="mt-12 border-t border-slate-200 pt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Compass className="h-5 w-5 text-slate-400" /> Also happening nearby
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {nearby.map((e) => (
                <Link
                  key={e.id}
                  to="/events/$id"
                  params={{ id: e.id }}
                  className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{e.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(e.start_time).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {(e.distance_meters / 1609.34).toFixed(1)} miles away
                  </p>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              From other organizers' calendars on EventHub, not {name}'s own events.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <Link to="/events" className="hover:text-slate-600">
          Powered by EventHub
        </Link>
      </footer>
    </div>
  );
}
