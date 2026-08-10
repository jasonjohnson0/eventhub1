import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpDown, MapPin, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/queries/events";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { fmtTime } from "@/queries/events";
import { CategoryTag, EmptyState } from "./shared";

export function ListView({ events }: { events: CalendarEvent[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [asc, setAsc] = useState(true);

  const organizers = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) e.organizers.forEach((o) => set.add(o));
    return Array.from(set).sort();
  }, [events]);

  const rows = useMemo(() => {
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return events
      .filter((e) => {
        const t = new Date(e.start_time).getTime();
        if (fromT !== null && t < fromT) return false;
        if (toT !== null && t > toT) return false;
        if (category && e.category !== category) return false;
        if (organizer && !e.organizers.includes(organizer)) return false;
        return true;
      })
      .sort((a, b) =>
        asc ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time),
      );
  }, [events, from, to, category, organizer, asc]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-slate-500">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Organizer
          <select
            value={organizer}
            onChange={(e) => setOrganizer(e.target.value)}
            className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            {organizers.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAsc((v) => !v)}>
          <ArrowUpDown className="mr-1 h-4 w-4" />
          Start time {asc ? "↑" : "↓"}
        </Button>
        <span className="ml-auto text-sm text-slate-500">{rows.length} events</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="No events match these filters." />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {rows.map((e) => (
            <Link
              key={e.id}
              to="/events/$id"
              params={{ id: e.id }}
              className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-slate-50"
            >
              <div className="w-16 shrink-0 rounded-xl bg-slate-900 p-2 text-center text-white">
                <div className="text-[10px] uppercase">
                  {new Date(e.start_time).toLocaleDateString(undefined, { month: "short" })}
                </div>
                <div className="text-lg font-black leading-none">{new Date(e.start_time).getDate()}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-bold text-slate-900">{e.title}</span>
                  <CategoryTag category={e.category} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{fmtTime(e.start_time)}</span>
                  {e.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {e.location}
                    </span>
                  )}
                  {e.organizers.length > 0 && <span>by {e.organizers.join(", ")}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {e.going_count}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}