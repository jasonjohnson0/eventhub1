// Server-only: loads the platform email configuration and dispatches messages
// through the provider chosen in /admin/setup.
import { sendEmail, type EmailCredentials, type EmailMessage, type SendResult } from "./email-providers.server";
import { decryptSecret } from "./platform-config.server";

export async function loadEmailCredentials(): Promise<EmailCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
  const sb = supabaseAdmin as any;
  const { data } = await sb
    .from("platform_config")
    .select("email_provider, email_api_key, email_from_name, email_from_address, email_extra, email_configured")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data || !data.email_configured || data.email_provider === "none") return null;
  let apiKey = "";
  if (data.email_api_key) {
    try {
      apiKey = decryptSecret(data.email_api_key);
    } catch {
      apiKey = "";
    }
  }
  return {
    provider: data.email_provider,
    apiKey,
    fromName: data.email_from_name ?? "EventHub",
    fromAddress: data.email_from_address ?? "",
    extra: data.email_extra ?? null,
  };
}

/** Send one message using the platform's configured provider. */
export async function sendPlatformEmail(message: EmailMessage): Promise<SendResult> {
  const creds = await loadEmailCredentials();
  if (!creds) return { ok: false, error: "No email provider configured" };
  return sendEmail(creds, message);
}

/** Send many messages sequentially; returns per-recipient outcomes. */
export async function sendPlatformEmails(
  messages: EmailMessage[],
): Promise<{ sent: number; failed: number; errors: string[]; provider: string | null }> {
  const creds = await loadEmailCredentials();
  if (!creds) return { sent: 0, failed: messages.length, errors: ["No email provider configured"], provider: null };
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const m of messages) {
    const res = await sendEmail(creds, m);
    if (res.ok) sent += 1;
    else {
      failed += 1;
      if (errors.length < 5) errors.push(res.error);
    }
  }
  return { sent, failed, errors, provider: creds.provider };
}