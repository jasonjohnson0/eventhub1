import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RRule, rrulestr } from "rrule";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
type SeriesUpdate = Database["public"]["Tables"]["event_series"]["Update"];

const isoDate = z.string().datetime({ offset: true });
const categoryEnum = z.enum([
  "sports",
  "networking",
  "education",
  "social",
  "fundraiser",
  "workshop",
  "other",
]);

// A year of daily events is 365 occurrences, and coordinators schedule a year
// ahead, so 100 cut those series off after about fourteen weeks. The cap still
// exists to bound a runaway rule like FREQ=HOURLY, which would otherwise try to
// insert tens of thousands of rows.
const MAX_OCCURRENCES = 400;

/** Offset (ms) to ADD to a real instant to get a Date whose UTC getters read
 *  as that instant's wall-clock time in `timeZone`. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const get = (t: string) => Number(dtf.formatToParts(instant).find((p) => p.type === t)?.value ?? "0");
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - instant.getTime();
}

/** A real instant -> a "floating" Date whose UTC getters read as that
 *  instant's wall-clock time in `timeZone`. rrule only understands calendar
 *  arithmetic on UTC getters, so recurrence is computed entirely in this
 *  floating representation and converted back to a real instant per
 *  occurrence below -- otherwise "every day at 11pm" is really "every 24
 *  hours" and silently drifts an hour across a DST change, which is most
 *  visible for exactly the late-night events that sit near a day boundary. */
function toFloating(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + tzOffsetMs(instant, timeZone));
}

/** The inverse of toFloating: a floating wall-clock Date -> the real instant
 *  in `timeZone`. Re-derives the offset from the candidate instant itself,
 *  not the floating guess, since the two can disagree right at a DST
 *  boundary. */
function fromFloating(floating: Date, timeZone: string): Date {
  const guessOffset = tzOffsetMs(floating, timeZone);
  const candidate = floating.getTime() - guessOffset;
  const offset = tzOffsetMs(new Date(candidate), timeZone);
  return new Date(floating.getTime() - offset);
}

function computeOccurrences(
  rrule: string,
  dtstart: Date,
  until: Date | null,
  timezone: string,
): { dates: Date[]; truncated: boolean } {
  const floatingStart = toFloating(dtstart, timezone);
  // Ensure RRULE has DTSTART for rrulestr
  const rule = rrulestr(
    `DTSTART:${floatingStart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\nRRULE:${rrule}`,
    { forceset: false },
  ) as RRule;
  const floatingHardCap = until
    ? toFloating(until, timezone)
    : new Date(floatingStart.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const all = rule.between(floatingStart, floatingHardCap, true);
  return {
    dates: all.slice(0, MAX_OCCURRENCES).map((f) => fromFloating(f, timezone)),
    truncated: all.length > MAX_OCCURRENCES,
  };
}

export const createSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(4000).nullable().optional(),
        location: z.string().max(300).nullable().optional(),
        category: categoryEnum.default("other"),
        tags: z.array(z.string().min(1).max(40)).max(20).default([]),
        dtstart: isoDate,
        duration_minutes: z.number().int().positive().max(60 * 24 * 30),
        rrule: z.string().min(3).max(500),
        until: isoDate.nullable().optional(),
        timezone: z.string().default("UTC"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const dtstart = new Date(data.dtstart);
    const until = data.until ? new Date(data.until) : null;
    const { dates: occurrences, truncated } = computeOccurrences(data.rrule, dtstart, until, data.timezone);
    if (occurrences.length === 0) throw new Error("RRULE produced no occurrences");

    const { data: series, error: sErr } = await context.supabase
      .from("event_series")
      .insert({
        coordinator_id: context.userId,
        title: data.title,
        description: data.description ?? null,
        location: data.location ?? null,
        category: data.category,
        tags: data.tags,
        dtstart: data.dtstart,
        duration_minutes: data.duration_minutes,
        rrule: data.rrule,
        until: data.until ?? null,
        timezone: data.timezone,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    const durationMs = data.duration_minutes * 60_000;
    const rows = occurrences.map((start) => ({
      coordinator_id: context.userId,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + durationMs).toISOString(),
      status: "approved" as const,
      category: data.category,
      tags: data.tags,
      series_id: series.id,
      series_original_start: start.toISOString(),
      is_exception: false,
    }));
    const { error: eErr } = await context.supabase.from("events").insert(rows);
    if (eErr) throw new Error(eErr.message);

    // truncated is surfaced so the coordinator is told the series was capped
    // rather than being shown a count that looks like the whole thing.
    return { series_id: series.id, count: occurrences.length, truncated };
  });

export const updateSeriesInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        scope: z.enum(["this", "future", "all"]),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(4000).nullable().optional(),
        location: z.string().max(300).nullable().optional(),
        category: categoryEnum.optional(),
        tags: z.array(z.string().min(1).max(40)).max(20).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: ev, error } = await context.supabase
      .from("events")
      .select("id, series_id, start_time, coordinator_id")
      .eq("id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ev) throw new Error("Event not found");
    if (ev.coordinator_id !== context.userId) throw new Error("Not the coordinator");

    const patch: EventUpdate = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.location !== undefined) patch.location = data.location;
    if (data.category !== undefined) patch.category = data.category;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (Object.keys(patch).length === 0) return { updated: 0 };

    if (!ev.series_id || data.scope === "this") {
      const { error: uErr } = await context.supabase
        .from("events")
        .update({ ...patch, is_exception: true })
        .eq("id", ev.id);
      if (uErr) throw new Error(uErr.message);
      return { updated: 1 };
    }

    let query = context.supabase
      .from("events")
      .update(patch)
      .eq("series_id", ev.series_id)
      .eq("is_exception", false);
    if (data.scope === "future") query = query.gte("start_time", ev.start_time);
    const { data: updated, error: uErr } = await query.select("id");
    if (uErr) throw new Error(uErr.message);

    if (data.scope === "all") {
      const seriesPatch: SeriesUpdate = { ...patch };
      await context.supabase.from("event_series").update(seriesPatch).eq("id", ev.series_id);
    }
    return { updated: updated?.length ?? 0 };
  });

export const deleteSeriesInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ event_id: z.string().uuid(), scope: z.enum(["this", "future", "all"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: ev, error } = await context.supabase
      .from("events")
      .select("id, series_id, start_time, coordinator_id")
      .eq("id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ev) throw new Error("Event not found");
    if (ev.coordinator_id !== context.userId) throw new Error("Not the coordinator");

    if (!ev.series_id || data.scope === "this") {
      const { error: dErr } = await context.supabase.from("events").delete().eq("id", ev.id);
      if (dErr) throw new Error(dErr.message);
      return { deleted: 1 };
    }
    let query = context.supabase.from("events").delete().eq("series_id", ev.series_id);
    if (data.scope === "future") query = query.gte("start_time", ev.start_time);
    const { data: deleted, error: dErr } = await query.select("id");
    if (dErr) throw new Error(dErr.message);
    if (data.scope === "all") {
      await context.supabase.from("event_series").delete().eq("id", ev.series_id);
    }
    return { deleted: deleted?.length ?? 0 };
  });

export const listMySeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("event_series")
      .select("id, title, rrule, dtstart, until, category, timezone")
      .eq("coordinator_id", context.userId)
      .order("dtstart", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });