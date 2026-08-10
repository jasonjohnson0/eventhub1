import { useMemo, useState, useCallback } from "react";
import { addDays, startOfWeek, startOfDay, sameDay } from "@/queries/events";

export const WEEK_START_HOUR = 8;
export const WEEK_END_HOUR = 22;

/** Week boundary + date math helpers for 7-day grid views. */
export function useWeekView(initial?: Date) {
  const [cursor, setCursor] = useState<Date>(() => initial ?? new Date());

  const start = useMemo(() => startOfWeek(cursor), [cursor]);
  const end = useMemo(() => addDays(start, 6), [start]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const hours = useMemo(
    () => Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR + 1 }, (_, i) => WEEK_START_HOUR + i),
    [],
  );

  const next = useCallback(() => setCursor((c) => addDays(c, 7)), []);
  const prev = useCallback(() => setCursor((c) => addDays(c, -7)), []);
  const today = useCallback(() => setCursor(startOfDay(new Date())), []);

  const label = useMemo(
    () =>
      `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(
        undefined,
        { month: "short", day: "numeric", year: "numeric" },
      )}`,
    [start, end],
  );

  const isToday = useCallback((d: Date) => sameDay(d, new Date()), []);
  const inWeek = useCallback(
    (iso: string | Date) => {
      const t = new Date(iso).getTime();
      return t >= start.getTime() && t < addDays(start, 7).getTime();
    },
    [start],
  );

  return { cursor, setCursor, start, end, days, hours, next, prev, today, label, isToday, inWeek };
}