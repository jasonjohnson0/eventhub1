import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const banUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        reason: z.string().min(1).max(500),
        expires_at: z.string().datetime({ offset: true }).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("bans")
      .insert({
        scope: "user",
        target_user_id: data.user_id,
        reason: data.reason,
        banned_by: context.userId,
        expires_at: data.expires_at ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "ban_user",
      table_name: "bans",
      record_id: row.id,
      change_details: {
        target_user_id: data.user_id,
        reason: data.reason,
        expires_at: data.expires_at ?? null,
      },
    });
    return { ok: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("bans")
      .update({ expires_at: now })
      .eq("scope", "user")
      .eq("target_user_id", data.user_id)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "unban_user",
      table_name: "bans",
      record_id: data.user_id,
      change_details: { target_user_id: data.user_id },
    });
    return { ok: true };
  });