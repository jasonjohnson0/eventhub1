import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Users, Share2 } from "lucide-react";
import { toast } from "sonner";
import { listMyEvents, rescheduleEvent, listEventCounts } from "@/lib/events.functions";
import { colorForEvent } from "@/lib/event-colors";
import { EventModal } from "@/components/event-modal";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
  head: () => ({ meta: [{ title: "Calendar — EventHub" }] }),
});

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  status: string;
  coordinator_id: string;
};

type View = "month" | "week" | "day";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonthGrid(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return addDays(startOfDay(first), -first.getDay());
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, { rsvps: number; shares: number }>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStart, setModalStart] = useState<Date | undefined>(undefined);
  const [selected, setSelected] = useState<EventRow | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = (await listMyEvents()) as EventRow[];
      setEvents(rows);
      if (rows.length) {
        const c = await listEventCounts({ data: { ids: rows.map((r) => r.id).slice(0, 200) } });
        setCounts(c);
      } else {
        setCounts({});
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load events");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const title = useMemo(() => {
    if (view === "month") return cursor.toLocaleString("en", { month: "long", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleString("en", { month: "short", day: "numeric" })} – ${e.toLocaleString("en", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursor.toLocaleString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [view, cursor]);

  function step(delta: number) {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else if (view === "week") setCursor(addDays(cursor, 7 * delta));
    else setCursor(addDays(cursor, delta));
  }

  async function handleDropOn(day: Date, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/event-id");
    if (!id) return;
    const ev = events.find((x) => x.id === id);
    if (!ev) return;
    const oldStart = new Date(ev.start_time);
    const duration = new Date(ev.end_time).getTime() - oldStart.getTime();
    const newStart = new Date(day);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);
    // optimistic
    setEvents((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, start_time: newStart.toISOString(), end_time: newEnd.toISOString() } : x,
      ),
    );
    try {
      await rescheduleEvent({
        data: { id, start_time: newStart.toISOString(), end_time: newEnd.toISOString() },
      });
      toast.success("Event rescheduled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reschedule failed");
      await reload();
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <h1 className="ml-2 text-xl font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-3 py-1 text-sm capitalize ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button
            onClick={() => {
              setModalStart(cursor);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Create event
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {view === "month" && (
          <MonthView cursor={cursor} events={events} counts={counts} onDropOn={handleDropOn} onSelect={setSelected} />
        )}
        {view === "week" && (
          <WeekView cursor={cursor} events={events} onDropOn={handleDropOn} onSelect={setSelected} />
        )}
        {view === "day" && <DayView cursor={cursor} events={events} onSelect={setSelected} />}
      </div>

      <EventModal open={modalOpen} onOpenChange={setModalOpen} initialStart={modalStart} onCreated={reload} />
      <EventDetailPanel event={selected} onClose={() => setSelected(null)} counts={selected ? counts[selected.id] : undefined} />
    </div>
  );
}

function EventChip({ ev, onSelect }: { ev: EventRow; onSelect: (e: EventRow) => void }) {
  const c = colorForEvent(ev.id);
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/event-id", ev.id)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(ev);
      }}
      className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs font-medium text-white shadow-sm hover:brightness-110"
      style={{ backgroundColor: c.hex }}
    >
      <span className="truncate">
        {fmtTime(ev.start_time)} · {ev.title}
      </span>
    </button>
  );
}

function MonthView({
  cursor,
  events,
  counts,
  onDropOn,
  onSelect,
}: {
  cursor: Date;
  events: EventRow[];
  counts: Record<string, { rsvps: number; shares: number }>;
  onDropOn: (day: Date, e: React.DragEvent) => void;
  onSelect: (e: EventRow) => void;
}) {
  const gridStart = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="rounded-lg border bg-background">
      <div className="grid grid-cols-7 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="border-r p-2 last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(6rem,1fr)]">
        {days.map((day, i) => {
          const dayEvents = events.filter((ev) => sameDay(new Date(ev.start_time), day));
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, new Date());
          return (
            <div
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropOn(day, e)}
              className={`space-y-1 border-b border-r p-1.5 last:border-r-0 ${inMonth ? "bg-background" : "bg-muted/20"} ${isToday ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <div className={`text-right text-xs ${inMonth ? "text-foreground" : "text-muted-foreground"}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div key={ev.id} className="group relative">
                    <EventChip ev={ev} onSelect={onSelect} />
                    {counts[ev.id] && (counts[ev.id].rsvps > 0 || counts[ev.id].shares > 0) && (
                      <div className="pointer-events-none absolute -top-1 -right-1 flex gap-0.5">
                        {counts[ev.id].rsvps > 0 && (
                          <span className="rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                            {counts[ev.id].rsvps}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourGrid({
  days,
  events,
  onDropOn,
  onSelect,
}: {
  days: Date[];
  events: EventRow[];
  onDropOn: (day: Date, e: React.DragEvent) => void;
  onSelect: (e: EventRow) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="grid" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((d, i) => (
          <div key={i} className="border-b border-l p-2 text-center text-sm font-semibold">
            {d.toLocaleString("en", { weekday: "short" })} <span className="text-muted-foreground">{d.getDate()}</span>
          </div>
        ))}
        {hours.map((h) => (
          <div key={`h-${h}`} className="contents">
            <div className="border-b border-r pr-2 text-right text-[10px] text-muted-foreground">
              {h === 0 ? "" : `${h}:00`}
            </div>
            {days.map((day, i) => {
              const cellDate = new Date(day);
              cellDate.setHours(h, 0, 0, 0);
              const dayEvents = events.filter((ev) => {
                const s = new Date(ev.start_time);
                return sameDay(s, day) && s.getHours() === h;
              });
              return (
                <div
                  key={`${i}-${h}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropOn(cellDate, e)}
                  className="h-12 space-y-0.5 border-b border-l p-0.5"
                >
                  {dayEvents.map((ev) => (
                    <EventChip key={ev.id} ev={ev} onSelect={onSelect} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekView(props: {
  cursor: Date;
  events: EventRow[];
  onDropOn: (day: Date, e: React.DragEvent) => void;
  onSelect: (e: EventRow) => void;
}) {
  const s = startOfWeek(props.cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
  return <HourGrid days={days} events={props.events} onDropOn={props.onDropOn} onSelect={props.onSelect} />;
}

function DayView(props: {
  cursor: Date;
  events: EventRow[];
  onSelect: (e: EventRow) => void;
}) {
  return (
    <HourGrid
      days={[startOfDay(props.cursor)]}
      events={props.events}
      onDropOn={() => {}}
      onSelect={props.onSelect}
    />
  );
}

function EventDetailPanel({
  event,
  onClose,
  counts,
}: {
  event: EventRow | null;
  onClose: () => void;
  counts?: { rsvps: number; shares: number };
}) {
  if (!event) return null;
  const c = colorForEvent(event.id);
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-background shadow-xl">
      <div className="h-16 w-full" style={{ backgroundColor: c.hex }} />
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold">{event.title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">
            {new Date(event.start_time).toLocaleString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Badge>
          {event.location && <Badge variant="outline">{event.location}</Badge>}
        </div>
        {event.description && <p className="text-sm">{event.description}</p>}
        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" /> {counts?.rsvps ?? 0} RSVPs
          </div>
          <div className="flex items-center gap-1">
            <Share2 className="h-4 w-4" /> {counts?.shares ?? 0} shares
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm">
            <Link to="/events/$id" params={{ id: event.id }}>
              Open event page
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast("Sponsorship checkout ships in Phase 1b")}>
            Sponsor this event
          </Button>
        </div>
      </div>
    </div>
  );
}