import { Link } from "@tanstack/react-router";
import { categoryClasses, categoryLabel } from "@/lib/categories";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime } from "@/queries/events";

export function EventChip({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      title={`${event.title} · ${fmtTime(event.start_time)}`}
      className={`block truncate rounded-lg px-2 py-1 text-xs font-semibold transition-transform hover:scale-[1.02] ${categoryClasses(
        event.category,
      )}`}
    >
      {!compact && <span className="mr-1 opacity-70">{fmtTime(event.start_time)}</span>}
      {event.title}
    </Link>
  );
}

export function CategoryTag({ category }: { category: string | null }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${categoryClasses(category)}`}>
      {categoryLabel(category ?? "other")}
    </span>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 p-12 text-center">
      <div className="text-5xl">🗓️</div>
      <p className="mt-3 text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}