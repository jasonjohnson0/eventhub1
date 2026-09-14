import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** A profile's default -- what it says on the coordinator's directory list.
 *  Per-event assignment (`event_organizers.role`) can differ: someone
 *  organizes event A and speaks at event B (spec 06). */
export type PersonKind = "organizer" | "speaker" | "both";
const personKind = z.enum(["organizer", "speaker", "both"]);

export type Organizer = {
  id: string;
  coordinator_id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  title: string | null;
  credentials: string | null;
  social_links: Record<string, string>;
  kind: PersonKind;
  created_at: string;
};

// Raised from 5 (spec 06, F3): speakers now share this cap with organizers,
// and 5 was already tight for organizers alone.
export const MAX_ORGANIZERS_PER_EVENT = 12;

const organizerInput = z.object({
  name: z.string().trim().min(2).max(160),
  bio: z.string().trim().max(2000).optional().nullable(),
  photo_url: z.string().trim().max(1000).optional().nullable(),
  title: z.string().trim().max(160).optional().nullable(),
  credentials: z.string().trim().max(300).optional().nullable(),
  social_links: z.record(z.string(), z.string().trim().max(300)).optional(),
  kind: personKind.default("organizer"),
});

/** Public (unauthenticated) reads of organizer / event_organizers data --
 *  both tables are fully public-readable (`USING (true)` RLS), same pattern
 *  getEventOrganizers already used below, factored out so the speakers
 *  directory and person page (spec 06) don't each re-inline the
 *  service-role-bypass client construction. */
async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
  }) as any;
}

export const listOrganizers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Organizer[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("organizers")
      .select("*")
      .eq("coordinator_id", context.userId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Organizer[];
  });

export const createOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => organizerInput.parse(d))
  .handler(async ({ data, context }): Promise<Organizer> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("organizers")
      .insert({ ...data, social_links: data.social_links ?? {}, coordinator_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Organizer;
  });

export const updateOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => organizerInput.partial().extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Organizer> => {
    const { id, ...patch } = data;
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("organizers")
      .update(patch)
      .eq("id", id)
      .eq("coordinator_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Organizer;
  });

export const deleteOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { error } = await sb
      .from("organizers")
      .delete()
      .eq("id", data.id)
      .eq("coordinator_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Replace the organizer/speaker lineup for an event (max
 *  MAX_ORGANIZERS_PER_EVENT). Each assignment carries its own role for this
 *  event -- the picker UI defaults it from the profile's own `kind`, but a
 *  coordinator can override per event (spec 06: "organizes event A, speaks
 *  at event B"). */
export const assignToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        assignments: z
          .array(z.object({ organizer_id: z.string().uuid(), role: personKind }))
          .max(MAX_ORGANIZERS_PER_EVENT),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: ev, error: evErr } = await sb
      .from("events")
      .select("id, coordinator_id")
      .eq("id", data.event_id)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev || ev.coordinator_id !== context.userId) throw new Error("Not your event");

    const { error: delErr } = await sb
      .from("event_organizers")
      .delete()
      .eq("event_id", data.event_id);
    if (delErr) throw new Error(delErr.message);

    if (data.assignments.length) {
      const rows = data.assignments.map((a, i) => ({
        event_id: data.event_id,
        organizer_id: a.organizer_id,
        role: a.role,
        display_order: i,
      }));
      const { error } = await sb.from("event_organizers").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.assignments.length };
  });

/** Public: organizers/speakers shown on an event detail page, with the
 *  per-event role that decides which block (Organized by / Speakers) each
 *  one lands in. */
export const getEventOrganizers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<(Organizer & { role: PersonKind })[]> => {
    const sb = await anonClient();
    const { data: rows, error } = await sb
      .from("event_organizers")
      .select("display_order, role, organizers(*)")
      .eq("event_id", data.event_id)
      .order("display_order");
    if (error) throw new Error(error.message);
    // biome-ignore lint/suspicious/noExplicitAny: nested select shape
    return ((rows ?? []) as any[])
      .filter((r) => r.organizers)
      .map((r) => ({ ...r.organizers, role: r.role as PersonKind }));
  });

/** Public: one person's profile plus their upcoming public events for a
 *  coordinator (spec 06's `/c/$slug/p/$id` person page). Unlisted events
 *  are excluded -- same `visibility = 'public'` filter as every other
 *  listing surface (spec 04). */
export const getPublicPerson = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await anonClient();
    const { data: person, error } = await sb
      .from("organizers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!person) return null;

    const nowIso = new Date().toISOString();
    const { data: rows } = await sb
      .from("event_organizers")
      .select("role, events!inner(id, title, start_time, end_time, category, status, visibility)")
      .eq("organizer_id", data.id)
      .eq("events.status", "approved")
      .eq("events.visibility", "public")
      .gte("events.end_time", nowIso)
      .order("events.start_time");

    // biome-ignore lint/suspicious/noExplicitAny: nested select shape
    const events = ((rows ?? []) as any[])
      .filter((r) => r.events)
      .map((r) => ({ ...r.events, role: r.role as PersonKind }));

    return { person: person as Organizer, events };
  });

/** Public: directory of speakers (kind speaker/both) or organizers (kind
 *  organizer/both) for one coordinator (spec 06's `/c/$slug/speakers`). */
export const listPublicPeople = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        coordinator_id: z.string().uuid(),
        kind: z.enum(["speaker", "organizer"]).default("speaker"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Organizer[]> => {
    const sb = await anonClient();
    const kinds = data.kind === "speaker" ? ["speaker", "both"] : ["organizer", "both"];
    const { data: rows, error } = await sb
      .from("organizers")
      .select("*")
      .eq("coordinator_id", data.coordinator_id)
      .in("kind", kinds)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Organizer[];
  });
