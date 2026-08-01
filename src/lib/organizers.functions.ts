import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Organizer = {
  id: string;
  coordinator_id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  title: string | null;
  credentials: string | null;
  social_links: Record<string, string>;
  created_at: string;
};

export const MAX_ORGANIZERS_PER_EVENT = 5;

const organizerInput = z.object({
  name: z.string().trim().min(2).max(160),
  bio: z.string().trim().max(2000).optional().nullable(),
  photo_url: z.string().trim().max(1000).optional().nullable(),
  title: z.string().trim().max(160).optional().nullable(),
  credentials: z.string().trim().max(300).optional().nullable(),
  social_links: z.record(z.string(), z.string().trim().max(300)).optional(),
});

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

/** Replace the organizer lineup for an event (max 5). */
export const assignToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        organizer_ids: z.array(z.string().uuid()).max(MAX_ORGANIZERS_PER_EVENT),
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

    if (data.organizer_ids.length) {
      const rows = data.organizer_ids.map((organizer_id, i) => ({
        event_id: data.event_id,
        organizer_id,
        display_order: i,
      }));
      const { error } = await sb.from("event_organizers").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.organizer_ids.length };
  });

/** Public: organizers shown on an event detail page. */
export const getEventOrganizers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Organizer[]> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    }) as any;
    const { data: rows, error } = await sb
      .from("event_organizers")
      .select("display_order, organizers(*)")
      .eq("event_id", data.event_id)
      .order("display_order");
    if (error) throw new Error(error.message);
    // biome-ignore lint/suspicious/noExplicitAny: nested select shape
    return ((rows ?? []) as any[]).map((r) => r.organizers).filter(Boolean) as Organizer[];
  });