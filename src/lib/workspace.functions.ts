import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ email: z.string().email(), role: z.enum(["coordinator", "staff"]).default("staff") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const token = randomToken();
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("workspace_staff")
      .upsert(
        {
          coordinator_id: context.userId,
          invited_email: data.email.toLowerCase(),
          role: data.role,
          invitation_token: token,
          invitation_expires_at: expires,
          accepted_at: null,
          staff_user_id: null,
        },
        { onConflict: "coordinator_id,invited_email" },
      )
      .select("id, invitation_token, invitation_expires_at, invited_email, role")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, invite_url: `/invite/${row.invitation_token}` };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspace_staff")
      .select("id, invited_email, role, invited_at, accepted_at, staff_user_id")
      .eq("coordinator_id", context.userId)
      .order("invited_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const revokeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_staff")
      .delete()
      .eq("id", data.id)
      .eq("coordinator_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptStaffInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ token: z.string().min(16) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: findErr } = await supabaseAdmin
      .from("workspace_staff")
      .select("id, coordinator_id, invited_email, invitation_expires_at, accepted_at, role")
      .eq("invitation_token", data.token)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!invite) throw new Error("Invitation not found");
    if (invite.accepted_at) throw new Error("Invitation already accepted");
    if (invite.invitation_expires_at && new Date(invite.invitation_expires_at) < new Date()) {
      throw new Error("Invitation expired");
    }

    const userEmail = (context.claims.email as string | undefined)?.toLowerCase();
    if (!userEmail || userEmail !== invite.invited_email.toLowerCase()) {
      throw new Error("This invitation was issued to a different email address");
    }

    const { error: updErr } = await supabaseAdmin
      .from("workspace_staff")
      .update({
        staff_user_id: context.userId,
        accepted_at: new Date().toISOString(),
        invitation_token: null,
      })
      .eq("id", invite.id);
    if (updErr) throw new Error(updErr.message);

    // Ensure staff has 'staff' role for RBAC helpers
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "staff" }, { onConflict: "user_id,role" });

    return { ok: true, coordinator_id: invite.coordinator_id };
  });