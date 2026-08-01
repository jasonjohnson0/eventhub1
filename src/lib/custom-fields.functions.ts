import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomFieldType = "text" | "dropdown" | "number" | "date" | "checkbox";

export type CustomField = {
  id: string;
  coordinator_id: string;
  field_name: string;
  field_type: CustomFieldType;
  is_required: boolean;
  options: string[];
  display_order: number;
  created_at: string;
};

const fieldInput = z.object({
  field_name: z.string().trim().min(1).max(80),
  field_type: z.enum(["text", "dropdown", "number", "date", "checkbox"]),
  is_required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  display_order: z.number().int().min(0).max(999).optional(),
});

export const listCustomFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomField[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("event_field_schemas")
      .select("*")
      .eq("coordinator_id", context.userId)
      .order("display_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as CustomField[];
  });

export const createCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => fieldInput.parse(d))
  .handler(async ({ data, context }): Promise<CustomField> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("event_field_schemas")
      .insert({
        coordinator_id: context.userId,
        field_name: data.field_name,
        field_type: data.field_type,
        is_required: data.is_required ?? false,
        options: data.options ?? [],
        display_order: data.display_order ?? 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as CustomField;
  });

export const updateCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => fieldInput.partial().extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CustomField> => {
    const { id, ...patch } = data;
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("event_field_schemas")
      .update(patch)
      .eq("id", id)
      .eq("coordinator_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as CustomField;
  });

export const deleteCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { error } = await sb
      .from("event_field_schemas")
      .delete()
      .eq("id", data.id)
      .eq("coordinator_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Save custom field values for one event. */
export const saveEventFieldValues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        values: z.array(z.object({ field_id: z.string().uuid(), value: z.string().max(2000) })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: ev } = await sb
      .from("events")
      .select("id, coordinator_id")
      .eq("id", data.event_id)
      .maybeSingle();
    if (!ev || ev.coordinator_id !== context.userId) throw new Error("Not your event");
    if (!data.values.length) return { ok: true };
    const { error } = await sb.from("event_field_values").upsert(
      data.values.map((v) => ({ event_id: data.event_id, field_id: v.field_id, value: v.value })),
      { onConflict: "event_id,field_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });