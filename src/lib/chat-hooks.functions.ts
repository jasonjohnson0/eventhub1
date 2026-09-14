import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  encryptWebhookUrlOrThrow,
  isAllowedWebhookUrl,
  maskWebhookUrl,
} from "@/lib/chat-notify.server";
import { decryptSecret } from "@/lib/platform-config.server";

export type ChatHooksSettings = {
  slack_configured: boolean;
  slack_masked: string;
  discord_configured: boolean;
  discord_masked: string;
  notify_submission: boolean;
  notify_rsvp_going: boolean;
  notify_ticket_sold: boolean;
  notify_event_cancelled: boolean;
};

const DEFAULTS: ChatHooksSettings = {
  slack_configured: false,
  slack_masked: "",
  discord_configured: false,
  discord_masked: "",
  notify_submission: true,
  notify_rsvp_going: false,
  notify_ticket_sold: true,
  notify_event_cancelled: true,
};

/** Coordinator's own Slack/Discord settings, masked -- the full webhook URL
 *  is never sent back to the client after it's been saved once (spec's own
 *  acceptance criterion). */
export const getChatHooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatHooksSettings> => {
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const { data: row } = await (context.supabase as any)
      .from("coordinator_chat_hooks")
      .select("*")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (!row) return DEFAULTS;
    return {
      slack_configured: !!row.slack_webhook_url,
      slack_masked: row.slack_webhook_url ? maskWebhookUrl(decryptSecret(row.slack_webhook_url)) : "",
      discord_configured: !!row.discord_webhook_url,
      discord_masked: row.discord_webhook_url
        ? maskWebhookUrl(decryptSecret(row.discord_webhook_url))
        : "",
      notify_submission: row.notify_submission,
      notify_rsvp_going: row.notify_rsvp_going,
      notify_ticket_sold: row.notify_ticket_sold,
      notify_event_cancelled: row.notify_event_cancelled,
    };
  });

const saveInput = z.object({
  // "" clears the field; omitted leaves it untouched; a non-empty value
  // must pass the host allowlist (enforced in encryptWebhookUrlOrThrow, not
  // just in the UI -- this is a save-time boundary, not a client nicety).
  slack_webhook_url: z.string().trim().max(2000).optional(),
  discord_webhook_url: z.string().trim().max(2000).optional(),
  notify_submission: z.boolean(),
  notify_rsvp_going: z.boolean(),
  notify_ticket_sold: z.boolean(),
  notify_event_cancelled: z.boolean(),
});

export const saveChatHooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      coordinator_id: context.userId,
      notify_submission: data.notify_submission,
      notify_rsvp_going: data.notify_rsvp_going,
      notify_ticket_sold: data.notify_ticket_sold,
      notify_event_cancelled: data.notify_event_cancelled,
    };
    if (data.slack_webhook_url !== undefined) {
      patch.slack_webhook_url = encryptWebhookUrlOrThrow(data.slack_webhook_url, "slack");
    }
    if (data.discord_webhook_url !== undefined) {
      patch.discord_webhook_url = encryptWebhookUrlOrThrow(data.discord_webhook_url, "discord");
    }
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const { error } = await (context.supabase as any)
      .from("coordinator_chat_hooks")
      .upsert(patch, { onConflict: "coordinator_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestChatNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target: z.enum(["slack", "discord"]) }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    const { data: row } = await (context.supabase as any)
      .from("coordinator_chat_hooks")
      .select("slack_webhook_url, discord_webhook_url")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    const encrypted = data.target === "slack" ? row?.slack_webhook_url : row?.discord_webhook_url;
    if (!encrypted) throw new Error(`No ${data.target} webhook URL saved yet`);
    const url = decryptSecret(encrypted);
    if (!url || !isAllowedWebhookUrl(url, data.target)) {
      throw new Error(`Saved ${data.target} webhook URL is no longer valid`);
    }
    const { data: profile } = await context.supabase
      .from("coordinator_profiles")
      .select("company_name")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    const name = profile?.company_name || "your calendar";
    const body = data.target === "slack" ? { text: `EventHub connected for ${name}.` } : { content: `EventHub connected for ${name}.` };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`${data.target} rejected the test message (HTTP ${res.status})`);
    }
    return { ok: true };
  });
