// Server-only: fires coordinator Slack/Discord incoming-webhook
// notifications (spec 08). Every real send goes through notifyCoordinator()
// or sendTestChatNotification() below -- the one place a webhook URL is
// ever decrypted and POSTed to, so a caller can't roll its own fetch(url)
// and skip the host allowlist (this is an SSRF footgun otherwise: the URL
// is coordinator-supplied).
import { encryptSecret, decryptSecret } from "@/lib/platform-config.server";

export type ChatNotifyType =
  | "submission_received"
  | "rsvp_going"
  | "ticket_sold"
  | "event_cancelled";

const ALLOWED_HOSTS: Record<"slack" | "discord", ReadonlySet<string>> = {
  slack: new Set(["hooks.slack.com"]),
  discord: new Set(["discord.com", "discordapp.com"]),
};

const TOGGLE_COLUMN: Record<ChatNotifyType, string> = {
  submission_received: "notify_submission",
  rsvp_going: "notify_rsvp_going",
  ticket_sold: "notify_ticket_sold",
  event_cancelled: "notify_event_cancelled",
};

/** https-only, host-allowlisted. A coordinator-supplied URL that fetch() is
 *  about to POST to is exactly the shape of an SSRF footgun the spec calls
 *  out explicitly -- this is the one gate every save and every send goes
 *  through. */
export function isAllowedWebhookUrl(url: string, kind: "slack" | "discord"): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS[kind].has(u.hostname);
  } catch {
    return false;
  }
}

/** "hooks.slack.com/services/…" -- host plus a truncation marker, never the
 *  token segment of the path. Shown in the settings UI once a URL is saved;
 *  the full value is never sent back to the client. */
export function maskWebhookUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const firstSegment = u.pathname.split("/").filter(Boolean)[0];
    return `${u.hostname}${firstSegment ? `/${firstSegment}` : ""}/…`;
  } catch {
    return "••••";
  }
}

async function postOnce(url: string, body: unknown): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Discord's success response is 204 (no body); everything else's is 2xx.
  return { ok: res.ok || res.status === 204, status: res.status };
}

/** One immediate retry on a 5xx (spec's Edges section), never more -- this
 *  fires after the primary write it's reporting on and must never become
 *  the slow part of that request. */
async function postWithRetry(url: string, body: unknown): Promise<void> {
  try {
    const first = await postOnce(url, body);
    if (first.ok) return;
    if (first.status >= 500) {
      const retry = await postOnce(url, body);
      if (!retry.ok) console.error(`[chat-notify] webhook failed after retry: ${retry.status}`);
      return;
    }
    console.error(`[chat-notify] webhook failed: ${first.status}`);
  } catch (err) {
    console.error("[chat-notify] webhook POST threw:", err);
  }
}

type HookRow = {
  slack_webhook_url: string | null;
  discord_webhook_url: string | null;
  notify_submission: boolean;
  notify_rsvp_going: boolean;
  notify_ticket_sold: boolean;
  notify_event_cancelled: boolean;
};

/** Fire-and-forget coordinator Slack/Discord notification. Never throws --
 *  a webhook being unset, disabled, or down must never block (or slow down,
 *  beyond one retry) the primary write it's reporting on. Uses the
 *  service-role client deliberately: most callers (an attendee RSVPing, a
 *  Stripe webhook, an anonymous event submission) are not acting as the
 *  coordinator whose hooks these are, so RLS would block a plain
 *  authenticated read even though the notification is legitimate. */
export async function notifyCoordinator(
  coordinatorId: string,
  type: ChatNotifyType,
  message: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const { data: hooks } = await (supabaseAdmin as any)
      .from("coordinator_chat_hooks")
      .select(
        "slack_webhook_url, discord_webhook_url, notify_submission, notify_rsvp_going, notify_ticket_sold, notify_event_cancelled",
      )
      .eq("coordinator_id", coordinatorId)
      .maybeSingle();
    const row = hooks as HookRow | null;
    if (!row || !row[TOGGLE_COLUMN[type] as keyof HookRow]) return;

    const sends: Promise<void>[] = [];
    if (row.slack_webhook_url) {
      const url = decryptSecret(row.slack_webhook_url);
      if (url && isAllowedWebhookUrl(url, "slack")) sends.push(postWithRetry(url, { text: message }));
    }
    if (row.discord_webhook_url) {
      const url = decryptSecret(row.discord_webhook_url);
      if (url && isAllowedWebhookUrl(url, "discord")) sends.push(postWithRetry(url, { content: message }));
    }
    await Promise.all(sends);
  } catch (err) {
    // Genuinely fire-and-forget: a coordinator's Slack being unreachable, or
    // even this table failing to read, must never surface to whatever
    // attendee-facing action triggered it.
    console.error("[chat-notify] notifyCoordinator failed:", err);
  }
}

/** Encrypts a webhook URL the same way `email_api_key` already is
 *  (`platform-config.server.ts`'s generic AES-256-GCM helper, not something
 *  platform-config-specific) -- validated against the host allowlist first,
 *  so nothing unvalidated is ever stored. Returns null for an empty string
 *  (clearing the field), throws for a non-empty value that fails the
 *  allowlist. */
export function encryptWebhookUrlOrThrow(
  url: string,
  kind: "slack" | "discord",
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!isAllowedWebhookUrl(trimmed, kind)) {
    throw new Error(
      kind === "slack"
        ? "Slack webhook URL must be an https://hooks.slack.com/... URL"
        : "Discord webhook URL must be an https://discord.com/... or https://discordapp.com/... URL",
    );
  }
  return encryptSecret(trimmed);
}
