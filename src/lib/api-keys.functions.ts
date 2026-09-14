import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateApiKey } from "@/lib/api-auth.server";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

/** Coordinator's own keys -- secret_hash never leaves the server, this
 *  select list is exactly what the settings UI is allowed to show. */
export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiKeyRow[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const { data, error } = await (context.supabase as any)
      .from("coordinator_api_keys")
      .select("id, name, prefix, last_used_at, revoked_at, created_at")
      .eq("coordinator_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Returns the raw secret exactly once -- there is no way to retrieve it
 *  again after this call returns, by design (only the hash is stored). */
// Insert/revoke go through the admin client, per the spec's own note --
// authenticated only ever gets a SELECT grant on this table (see the
// migration), so a coordinator's own RLS-scoped client has no write path to
// it at all. That's deliberate: a client-side insert could otherwise forge
// whatever secret_hash it liked.
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; secret: string; prefix: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const admin = supabaseAdmin as any;
    const { data: existing } = await admin
      .from("coordinator_api_keys")
      .select("id")
      .eq("coordinator_id", context.userId)
      .is("revoked_at", null);
    if ((existing?.length ?? 0) >= 20) {
      throw new Error("Maximum of 20 active API keys per calendar. Revoke one first.");
    }
    const { secret, prefix, hash } = generateApiKey();
    const { data: row, error } = await admin
      .from("coordinator_api_keys")
      .insert({
        coordinator_id: context.userId,
        name: data.name,
        prefix,
        secret_hash: hash,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, secret, prefix };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const { error } = await (supabaseAdmin as any)
      .from("coordinator_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("coordinator_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
