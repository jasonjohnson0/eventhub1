import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PublicHero } from "@/components/public-hero";
import { EventCardPublic, type PublicEvent } from "@/components/event-card-public";
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { fetchEvents, addDays, startOfWeek, type CalendarEvent } from "@/queries/events";
import { MonthView } from "@/components/CalendarViews/MonthView";
import { WeekView } from "@/components/CalendarViews/WeekView";
import { DayView } from "@/components/CalendarViews/DayView";
import { ListView } from "@/components/CalendarViews/ListView";
import { AgendaView } from "@/components/CalendarViews/AgendaView";

const searchSchema = z.object({
  category: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  range: fallback(z.string(), "all").default("all"),
  view: fallback(z.string(), "grid").default("grid"),
});

export const Route = createFileRoute("/events")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Discover Events — EventHub" },
      { name: "description", content: "Browse the community event calendar — concerts, workshops, meetups, fundraisers and more. No account needed to explore." },
      { property: "og:title", content: "Discover Events — EventHub" },
      { property: "og:description", content: "Find your next adventure. A fun, live calendar of events happening near you." },
    ],
  }),
  component: EventsRouteComponent,
});

function EventsRouteComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/events") return <Outlet />;

  return <EventsPage />;
}

const VIEWS = ["grid", "month", "week", "day", "list", "agenda"] as const;
type ViewKey = (typeof VIEWS)[number];
const VIEW_LABELS: Record<ViewKey, string> = {
  grid: "Grid",
  month: "Month",
  week: "Week",
  day: "Day",
  list: "List",
  agenda: "My agenda",
};

function EventsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/events" });
  const [signedIn, setSignedIn] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<Date>(() => new Date());

  const query = search.q;
  const category = search.category ? search.category : null;
  const range: "all" | "week" | "month" =
    search.range === "week" || search.range === "month" ? search.range : "all";
  const view: ViewKey = (VIEWS as readonly string[]).includes(search.view)
    ? (search.view as ViewKey)
    : "grid";

  const setQuery = (q: string) =>
    navigate({ search: (prev: Record<string, string>) => ({ ...prev, q }), replace: true });
  const setCategory = (c: string | null) =>
    navigate({ search: (prev: Record<string, string>) => ({ ...prev, category: c ?? "" }), replace: true });
  const setRange = (r: "all" | "week" | "month") =>
    navigate({ search: (prev: Record<string, string>) => ({ ...prev, range: r }), replace: true });
  const setView = (v: ViewKey) =>
    navigate({ search: (prev: Record<string, string>) => ({ ...prev, view: v }), replace: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const rows = await fetchEvents({ limit: 400 });
        if (!cancelled) setEvents(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const upcomingOnly = view === "grid";
    return events.filter((e) => {
      if (upcomingOnly && new Date(e.end_time).getTime() < now) return false;
      if (category && e.category !== category) return false;
      if (q) {
        const hay = `${e.title} ${e.description ?? ""} ${e.location ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (range !== "all" && (view === "grid" || view === "list")) {
        const t = new Date(e.start_time).getTime();
        const limit = range === "week" ? weekMs : monthMs;
        if (t - now > limit) return false;
      }
      return true;
    });
  }, [events, query, category, range, view]);

  const periodTitle = useMemo(() => {
    if (view === "month") return cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
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

  function step(delta: number) {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else if (view === "week") setCursor(addDays(cursor, 7 * delta));
    else setCursor(addDays(cursor, delta));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-amber-50/40 to-white">
      {/* Top bar */}
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-5">
        <Link to="/events" className="flex items-center gap-2 text-lg font-black text-slate-900">
          <PartyPopper className="h-6 w-6 text-fuchsia-500" />
          EventHub
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <Link to="/tour">Tour</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <Link to="/submit-event">Submit an event</Link>
          </Button>
          {signedIn ? (
            <Button asChild size="sm" className="rounded-full">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full bg-white/80 backdrop-blur">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <PublicHero query={query} onQuery={setQuery} category={category} onCategory={setCategory} />

      <main className="mx-auto max-w-7xl px-6 py-14">
        {/* Date range chips */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {range === "week" ? "This week" : range === "month" ? "Upcoming this month" : "Events in your area"}
            </h2>
            <p className="text-sm text-slate-500">
              {filtered.length} {filtered.length === 1 ? "event" : "events"} · Join the community 🎊
            </p>
          </div>
          <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-sm font-medium">
            {(["all", "week", "month"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-full px-4 py-1.5 transition-all ${
                  range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {r === "all" ? "All" : r === "week" ? "This week" : "This month"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-3xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 p-14 text-center">
            <div className="text-6xl">🕵️‍♀️</div>
            <h3 className="mt-4 text-xl font-bold text-slate-900">No events match your search</h3>
            <p className="mt-2 text-sm text-slate-500">Try clearing filters or exploring another category.</p>
            <Button className="mt-6 rounded-full" onClick={() => { setQuery(""); setCategory(null); setRange("all"); }}>
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ev, i) => (
              <EventCardPublic key={ev.id} event={ev} index={i} />
            ))}
          </div>
        )}

        {/* CTA banner */}
        {!signedIn && (
          <div className="mt-16 overflow-hidden rounded-3xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-amber-400 p-10 text-center text-white shadow-xl">
            <CalendarDays className="mx-auto h-10 w-10" />
            <h3 className="mt-4 text-3xl font-black">Ready to RSVP? 🎉</h3>
            <p className="mx-auto mt-2 max-w-md text-white/90">
              Create a free account to RSVP, save events, and get updates from coordinators.
            </p>
            <Button asChild size="lg" className="mt-6 rounded-full bg-white text-fuchsia-600 hover:bg-white/90">
              <Link to="/auth">Sign in to RSVP</Link>
            </Button>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        Made with ❤️ by EventHub ·{" "}
        <Link to="/tour" className="underline hover:text-slate-600">
          Built with EventHub — see the tour
        </Link>
      </footer>
    </div>
  );
}