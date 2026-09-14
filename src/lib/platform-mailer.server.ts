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

export type EmailSendType = "invitation" | "announcement" | "update" | "reminder";

export type EmailLogContext = {
  coordinator_id: string;
  event_id?: string | null;
  invitation_id?: string | null;
  type: EmailSendType;
  recipient_user_id?: string | null;
};

type EmailSendRow = {
  coordinator_id: string;
  event_id: string | null;
  invitation_id: string | null;
  type: EmailSendType;
  recipient_email: string;
  recipient_user_id: string | null;
  subject: string | null;
  provider: string | null;
  provider_message_id: string | null;
  status: "sent" | "failed" | "skipped" | "simulated";
  error: string | null;
  sent_at: string | null;
};

/** Writes finished email_sends rows (spec 07). The one place any sender is
 *  allowed to touch this table, so a future caller can't forget to log --
 *  centralize new send paths through this or `sendAndLogEmails` below rather
 *  than inserting into email_sends directly. */
export async function logEmailSends(rows: EmailSendRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
  const { error } = await (supabaseAdmin as any).from("email_sends").insert(rows);
  if (error) console.error("[platform-mailer] failed to log email_sends", error.message);
}

/** Send + log in one call, the path every real sender (invitations,
 *  announcements, the reminder drain) should go through. A recipient with no
 *  provider configured, or on the `lovable` stub provider, is logged
 *  honestly (`failed` / `simulated`, spec 07 F1) rather than as `sent` --
 *  that mislabeling is exactly how ROADMAP previously called this feature
 *  "Live" when it wasn't. */
export async function sendAndLogEmails(
  entries: { message: EmailMessage; log: EmailLogContext }[],
): Promise<{ sent: number; simulated: number; failed: number; errors: string[]; provider: string | null }> {
  const creds = await loadEmailCredentials();
  const rows: EmailSendRow[] = [];
  let sent = 0;
  let simulated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const { message, log } of entries) {
    const base = {
      coordinator_id: log.coordinator_id,
      event_id: log.event_id ?? null,
      invitation_id: log.invitation_id ?? null,
      type: log.type,
      recipient_email: message.to,
      recipient_user_id: log.recipient_user_id ?? null,
      subject: message.subject,
      provider: creds?.provider ?? null,
    };
    if (!creds) {
      failed += 1;
      const error = "No email provider configured";
      if (errors.length < 5) errors.push(error);
      rows.push({ ...base, provider_message_id: null, status: "failed", error, sent_at: null });
      continue;
    }
    const res = await sendEmail(creds, message);
    const now = new Date().toISOString();
    if (!res.ok) {
      failed += 1;
      if (errors.length < 5) errors.push(res.error);
      rows.push({ ...base, provider_message_id: null, status: "failed", error: res.error, sent_at: null });
      continue;
    }
    if (creds.provider === "lovable") {
      simulated += 1;
      rows.push({ ...base, provider_message_id: null, status: "simulated", error: null, sent_at: now });
      continue;
    }
    sent += 1;
    rows.push({
      ...base,
      provider_message_id: res.messageId ?? null,
      status: "sent",
      error: null,
      sent_at: now,
    });
  }

  await logEmailSends(rows);
  return { sent, simulated, failed, errors, provider: creds?.provider ?? null };
}