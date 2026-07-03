import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const subscribeToMarketing = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email().max(320).transform((s) => s.trim().toLowerCase()),
        source: z.string().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = randomToken();

    const { data: existing } = await supabaseAdmin
      .from("marketing_consent")
      .select("id, status, confirmed_at")
      .eq("email", data.email)
      .maybeSingle();

    if (existing?.status === "confirmed" && existing.confirmed_at) {
      return { ok: true, alreadyConfirmed: true, token: null };
    }

    if (existing) {
      const { error } = await supabaseAdmin
        .from("marketing_consent")
        .update({
          status: "pending",
          confirmation_token: token,
          opted_in_at: new Date().toISOString(),
          unsubscribed_at: null,
          source: data.source ?? "website",
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("marketing_consent").insert({
        email: data.email,
        status: "pending",
        confirmation_token: token,
        source: data.source ?? "website",
      });
      if (error) throw new Error(error.message);
    }
    // In Phase 1b, the confirmation email will be sent here.
    return { ok: true, alreadyConfirmed: false, token };
  });

export const confirmMarketingSubscription = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().min(10).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: findErr } = await supabaseAdmin
      .from("marketing_consent")
      .select("id, email, status")
      .eq("confirmation_token", data.token)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!row) throw new Error("Invalid or expired confirmation link");
    if (row.status === "unsubscribed") throw new Error("This subscription has been unsubscribed");

    const { error } = await supabaseAdmin
      .from("marketing_consent")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true, email: row.email };
  });

export const unsubscribeFromMarketing = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email().transform((s) => s.trim().toLowerCase()),
        token: z.string().min(10).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: findErr } = await supabaseAdmin
      .from("marketing_consent")
      .select("id")
      .eq("email", data.email)
      .eq("confirmation_token", data.token)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!row) throw new Error("Invalid unsubscribe link");

    const { error } = await supabaseAdmin
      .from("marketing_consent")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true, email: data.email };
  });