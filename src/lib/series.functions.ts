import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RRule, rrulestr } from "rrule";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const MAX_OCCURRENCES = 100;

function computeOccurrences(rrule: string, dtstart: Date, until: Date | null): Date[] {
  // Ensure RRULE has DTSTART for rrulestr
  const rule = rrulestr(
    `DTSTART:${dtstart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\nRRULE:${rrule}`,
    { forceset: false },
  ) as RRule;
  const hardCap = until ?? new Date(dtstart.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  return rule.between(dtstart, hardCap, true).slice(0, MAX_OCCURRENCES);
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
    const occurrences = computeOccurrences(data.rrule, dtstart, until);
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

    return { series_id: series.id, count: occurrences.length };
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

    const patch: Record<string, unknown> = {};
    for (const k of ["title", "description", "location", "category", "tags"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (Object.keys(patch).length === 0) return { updated: 0 };

    if (!ev.series_id || data.scope === "this") {
      const { error: uErr } = await context.supabase
        .from("events")
        .update({ ...patch, is_exception: true })
        .eq("id", ev.id);
      if (uErr) throw new Error(uErr.message);
      return { updated: 1 };
    }

    let query = context.supabase.from("events").update(patch).eq("series_id", ev.series_id).eq("is_exception", false);
    if (data.scope === "future") query = query.gte("start_time", ev.start_time);
    const { error: uErr, count } = await query.select("id", { count: "exact" });
    if (uErr) throw new Error(uErr.message);

    if (data.scope === "all") {
      await context.supabase.from("event_series").update(patch).eq("id", ev.series_id);
    }
    return { updated: count ?? 0 };
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
    const { error: dErr, count } = await query.select("id", { count: "exact" });
    if (dErr) throw new Error(dErr.message);
    if (data.scope === "all") {
      await context.supabase.from("event_series").delete().eq("id", ev.series_id);
    }
    return { deleted: count ?? 0 };
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