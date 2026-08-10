import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime } from "@/queries/events";
import { MapPin, Timer } from "lucide-react";

/** Countdown to the next upcoming event with an animated progress bar. */
export function EventsCountdownWidget({
  events,
  event,
}: {
  events?: CalendarEvent[];
  event?: CalendarEvent | null;
}) {
  const target = useMemo(() => {
    if (event) return event;
    const now = Date.now();
    return (
      [...(events ?? [])]
        .filter((e) => +new Date(e.start_time) > now)
        .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))[0] ?? null
    );
  }, [events, event]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [progress, setProgress] = useState(0);
  const startsAt = target ? +new Date(target.start_time) : 0;
  const daysLeft = target ? Math.max(0, Math.ceil((startsAt - now) / 86_400_000)) : 0;
  const pct = target ? Math.max(4, Math.min(100, ((30 - Math.min(daysLeft, 30)) / 30) * 100)) : 0;

  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  if (!target) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        No upcoming events scheduled yet.
      </div>
    );
  }

  return (
    <Link
      to="/events/$id"
      params={{ id: target.id }}
      className="block rounded-3xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 p-5 text-white shadow-lg transition-transform hover:-translate-y-0.5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/80">Next up</p>
          <h4 className="truncate text-lg font-black">{target.title}</h4>
        </div>
        <Timer className="h-6 w-6 shrink-0 text-white/90" />
      </div>

      <p className="mt-3 text-3xl font-black leading-none">
        {daysLeft === 0 ? "Today!" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="mt-3 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-white/90">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{target.location ?? "Venue TBA"}</span>
        <span className="shrink-0">· {fmtTime(target.start_time)}</span>
      </p>
    </Link>
  );
}

export default EventsCountdownWidget;