import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime } from "@/queries/events";
import { CategoryTag } from "@/components/CalendarViews/shared";
import { Button } from "@/components/ui/button";
import { CalendarDays, MapPin, Users, X } from "lucide-react";

/** Image-first gallery grid. Lazy-loaded covers, modal with full details. */
export function PhotoView({ events }: { events: CalendarEvent[] }) {
  const [active, setActive] = useState<CalendarEvent | null>(null);

  if (events.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 p-12 text-center">
        <div className="text-5xl">📸</div>
        <p className="mt-3 text-sm font-medium text-slate-500">No events to show in the gallery yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => setActive(e)}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-200 via-amber-100 to-cyan-200 text-left shadow-sm ring-1 ring-slate-200 transition-transform hover:-translate-y-0.5"
          >
            {e.image_url ? (
              <img
                src={e.image_url}
                alt={e.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-4xl">🎉</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 sm:p-3">
              <span className="block truncate text-xs font-bold text-white sm:text-sm">{e.title}</span>
              <span className="block truncate text-[10px] text-white/80 sm:text-xs">
                {new Date(e.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                {fmtTime(e.start_time)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setActive(null)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={active.title}
          >
            <div className="relative">
              {active.image_url ? (
                <img src={active.image_url} alt={active.title} className="h-56 w-full object-cover sm:h-72" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-fuchsia-300 to-amber-200 text-6xl">
                  🎊
                </div>
              )}
              <button
                onClick={() => setActive(null)}
                aria-label="Close"
                className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-700 shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryTag category={active.category} />
                {active.going_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Users className="h-3.5 w-3.5" /> {active.going_count} going
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-black text-slate-900">{active.title}</h3>
              <div className="space-y-1 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-fuchsia-500" />
                  {new Date(active.start_time).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  · {fmtTime(active.start_time)} – {fmtTime(active.end_time)}
                </p>
                {active.location && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-cyan-500" />
                    <span className="min-w-0 truncate">{active.location}</span>
                  </p>
                )}
              </div>
              {active.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {active.description}
                </p>
              )}
              <Button asChild className="w-full rounded-full sm:w-auto">
                <Link to="/events/$id" params={{ id: active.id }}>
                  View full event
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PhotoView;