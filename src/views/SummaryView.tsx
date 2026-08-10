import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime } from "@/queries/events";
import { CATEGORIES, categoryLabel, categoryClasses } from "@/lib/categories";
import { useEventFilters } from "@/hooks/useEventFilters";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, RotateCcw } from "lucide-react";

/** Compact sidebar-style summary list with persisted date/category/venue filters. */
export function SummaryView({ events }: { events: CalendarEvent[] }) {
  const { filters, set, reset, filtered, venues, activeCount } = useEventFilters(events);

  const sorted = [...filtered].sort(
    (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:self-start">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-bold uppercase tracking-wide text-slate-500">
            Filters {activeCount > 0 && `(${activeCount})`}
          </h3>
          <button
            onClick={reset}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-fuchsia-600 hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        <input
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search events…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-400"
        />

        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => set({ category: filters.category === c ? null : c })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                filters.category === c ? categoryClasses(c) : "bg-slate-100 text-slate-500"
              }`}
            >
              {categoryLabel(c)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-slate-500">
            From
            <input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-500">
            To
            <input
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => set({ to: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </label>
        </div>

        <label className="block text-[11px] font-semibold text-slate-500">
          Venue
          <select
            value={filters.venue ?? ""}
            onChange={(e) => set({ venue: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-500">
          {sorted.length} {sorted.length === 1 ? "event" : "events"}
        </p>
        {sorted.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 p-10 text-center text-sm text-slate-500">
            Nothing matches these filters.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {sorted.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 hover:bg-slate-50 sm:p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(e.start_time).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {fmtTime(e.start_time)}
                    </span>
                    {e.location && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{e.location}</span>
                      </span>
                    )}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">
                  <Link to="/events/$id" params={{ id: e.id }}>
                    View
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SummaryView;