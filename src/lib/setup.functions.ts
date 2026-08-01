import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================== TYPES ============================== */

export type EmailProviderName = "lovable" | "sendgrid" | "postmark" | "mailgun" | "none";

export type PlatformConfigView = {
  id: string;
  stripe_connected: boolean;
  stripe_connect_account_id: string | null;
  stripe_connected_at: string | null;
  /** Platform (built-in) Stripe keys present in the environment. */
  platform_stripe_ready: boolean;
  /** Buyer has supplied their own Stripe keys. */
  use_custom_stripe: boolean;
  custom_stripe_secret_masked: string | null;
  custom_stripe_publishable: string | null;
  /** True when payments can run at all (custom keys OR platform keys). */
  stripe_ready: boolean;
  email_provider: EmailProviderName;
  email_api_key_masked: string | null;
  email_from_name: string | null;
  email_from_address: string | null;
  email_extra: { mailgun_domain?: string } | null;
  email_configured: boolean;
  configured_at: string | null;
  updated_at: string;
  stripe_oauth_available: boolean;
  stripe_oauth_url: string | null;
};

async function assertAdmin(supabase: import("@supabase/supabase-js").SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

function buildStripeOAuthUrl(): { url: string | null; available: boolean } {
  // Stripe Connect OAuth is no longer used — payments run on the platform's
  // own Stripe keys, or on buyer-supplied keys stored encrypted.
  return { url: null, available: false };
}

/* ============================== READ ============================== */

export const getPlatformConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformConfigView> => {
    await assertAdmin(context.supabase, context.userId);
    const { maskApiKey, decryptSecret } = await import("@/lib/platform-config.server");
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("platform_config")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Platform config not initialized");
    let masked: string | null = null;
    if (row.email_api_key) {
      try {
        masked = maskApiKey(decryptSecret(row.email_api_key));
      } catch {
        masked = "••••";
      }
    }
    const oauth = buildStripeOAuthUrl();
    const platformReady = Boolean(process.env.STRIPE_SECRET_KEY);
    let customSecretMasked: string | null = null;
    if (row.stripe_secret_key) {
      try {
        customSecretMasked = maskApiKey(decryptSecret(row.stripe_secret_key));
      } catch {
        customSecretMasked = "••••";
      }
    }
    const useCustom = !!row.use_custom_stripe && !!row.stripe_secret_key;
    return {
      id: row.id,
      stripe_connected: !!row.stripe_connected,
      stripe_connect_account_id: row.stripe_connect_account_id,
      stripe_connected_at: row.stripe_connected_at,
      platform_stripe_ready: platformReady,
      use_custom_stripe: useCustom,
      custom_stripe_secret_masked: customSecretMasked,
      custom_stripe_publishable: row.stripe_publishable_key ?? null,
      stripe_ready: useCustom || platformReady,
      email_provider: row.email_provider,
      email_api_key_masked: masked,
      email_from_name: row.email_from_name,
      email_from_address: row.email_from_address,
      email_extra: row.email_extra ?? null,
      email_configured: !!row.email_configured,
      configured_at: row.configured_at,
      updated_at: row.updated_at,
      stripe_oauth_available: oauth.available,
      stripe_oauth_url: oauth.url,
    };
  });

/* ============================== SAVE ============================== */

const emailSaveSchema = z
  .object({
    provider: z.enum(["lovable", "sendgrid", "postmark", "mailgun", "none"]),
    api_key: z.string().max(500).optional().nullable(),
    from_name: z.string().max(120).optional().nullable(),
    from_address: z.string().email().max(254).optional().nullable(),
    mailgun_domain: z.string().max(253).optional().nullable(),
  })
  .refine(
    (v) => {
      if (v.provider === "lovable" || v.provider === "none") return true;
      if (!v.api_key || !v.from_address) return false;
      if (v.provider === "mailgun" && !v.mailgun_domain) return false;
      return true;
    },
    { message: "Missing required fields for the selected provider" },
  );

export const savePlatformConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => emailSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { encryptSecret } = await import("@/lib/platform-config.server");
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: existing } = await sb
      .from("platform_config")
      .select("id, email_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Platform config missing");

    const now = new Date().toISOString();
    const encryptedKey =
      data.provider === "lovable" || data.provider === "none"
        ? null
        : data.api_key
        ? encryptSecret(data.api_key)
        : existing.email_api_key;
    const extra =
      data.provider === "mailgun" && data.mailgun_domain
        ? { mailgun_domain: data.mailgun_domain }
        : null;
    const configured = data.provider !== "none";
    const { error } = await sb
      .from("platform_config")
      .update({
        email_provider: data.provider,
        email_api_key: encryptedKey,
        email_from_name: data.from_name ?? null,
        email_from_address: data.from_address ?? null,
        email_extra: extra,
        email_configured: configured,
        configured_at: configured ? now : null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================== TEST EMAIL ============================== */

const testSchema = z.object({
  provider: z.enum(["lovable", "sendgrid", "postmark", "mailgun"]),
  api_key: z.string().max(500).optional().nullable(),
  from_name: z.string().max(120).optional().nullable(),
  from_address: z.string().email().max(254).optional().nullable(),
  mailgun_domain: z.string().max(253).optional().nullable(),
  to_email: z.string().email().max(254),
});

export const testEmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => testSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { sendEmail } = await import("@/lib/email-providers.server");
    const res = await sendEmail(
      {
        provider: data.provider,
        apiKey: data.api_key ?? "",
        fromName: data.from_name ?? "EventHub",
        fromAddress: data.from_address ?? "",
        extra: data.mailgun_domain ? { mailgun_domain: data.mailgun_domain } : null,
      },
      {
        to: data.to_email,
        subject: "EventHub test email",
        html: `<p>This is a test message from your EventHub setup.</p><p>Provider: <strong>${data.provider}</strong></p>`,
        text: `EventHub test email — provider: ${data.provider}`,
      },
    );
    return res;
  });

/* ============================== STRIPE OAUTH ============================== */

/* ---------------------- CUSTOM STRIPE KEYS (optional) ---------------------- */

const stripeKeysSchema = z.object({
  secret_key: z.string().min(10).max(500).optional().nullable(),
  publishable_key: z.string().min(6).max(500),
});

// Buyers may override the platform's built-in Stripe account with their own keys.
// Secret key is encrypted at rest; publishable key is safe in plaintext.
export const saveCustomStripeKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => stripeKeysSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { encryptSecret } = await import("@/lib/platform-config.server");
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: existing } = await sb
      .from("platform_config")
      .select("id, stripe_secret_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Platform config missing");
    const secret = data.secret_key
      ? encryptSecret(data.secret_key)
      : existing.stripe_secret_key;
    if (!secret) throw new Error("Secret key is required");
    const { error } = await sb
      .from("platform_config")
      .update({
        use_custom_stripe: true,
        stripe_secret_key: secret,
        stripe_publishable_key: data.publishable_key,
        stripe_connected: true,
        stripe_connected_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Revert to the platform's built-in Stripe account.
export const clearCustomStripeKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: existing } = await sb
      .from("platform_config")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Platform config missing");
    const { error } = await sb
      .from("platform_config")
      .update({
        use_custom_stripe: false,
        stripe_secret_key: null,
        stripe_publishable_key: null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Exchange the authorization code returned by Stripe Connect for a connected
// account id. Requires STRIPE_SECRET_KEY (platform account) and
// STRIPE_CONNECT_CLIENT_ID. Fails cleanly with a message the callback route
// can surface if credentials are missing.
export const exchangeStripeAuthCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(10).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", data.code);

    const res = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as {
      stripe_user_id?: string;
      error_description?: string;
      error?: string;
    };
    if (!res.ok || !json.stripe_user_id) {
      throw new Error(json.error_description || json.error || `Stripe returned ${res.status}`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: existing } = await sb
      .from("platform_config")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Platform config missing");
    const { error } = await sb
      .from("platform_config")
      .update({
        stripe_connect_account_id: json.stripe_user_id,
        stripe_connected: true,
        stripe_connected_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true, stripe_user_id: json.stripe_user_id };
  });

export const disconnectStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: existing } = await sb
      .from("platform_config")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!existing) throw new Error("Platform config missing");
    const { error } = await sb
      .from("platform_config")
      .update({
        stripe_connect_account_id: null,
        stripe_connected: false,
        stripe_connected_at: null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================== PUBLIC STATUS ============================== */

// Lightweight status check used by non-admin flows (purchaseTicket, etc.)
// so we don't 403 non-admins. Uses supabaseAdmin to bypass RLS but only
// returns the two safe booleans.
export const getPublicPlatformStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
  const sb = supabaseAdmin as any;
  const { data } = await sb
    .from("platform_config")
    .select("stripe_connected, email_configured, email_provider")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    stripe_connected: !!data?.stripe_connected,
    email_configured: !!data?.email_configured,
    email_provider: (data?.email_provider ?? "lovable") as EmailProviderName,
  };
});