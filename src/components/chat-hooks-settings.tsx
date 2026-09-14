import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getChatHooks,
  saveChatHooks,
  sendTestChatNotification,
  type ChatHooksSettings as Settings,
} from "@/lib/chat-hooks.functions";

const EMPTY: Settings = {
  slack_configured: false,
  slack_masked: "",
  discord_configured: false,
  discord_masked: "",
  notify_submission: true,
  notify_rsvp_going: false,
  notify_ticket_sold: true,
  notify_event_cancelled: true,
};

/** Spec 08: per-coordinator Slack/Discord incoming-webhook settings. A saved
 *  URL is never shown again in full (`slack_masked`/`discord_masked` come
 *  back pre-masked from the server) -- typing in either box only replaces
 *  the stored value on Save, it never round-trips the real one back out. */
export function ChatHooksSettings() {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [slackInput, setSlackInput] = useState("");
  const [discordInput, setDiscordInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState<"slack" | "discord" | null>(null);

  useEffect(() => {
    void getChatHooks()
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    try {
      await saveChatHooks({
        data: {
          // Only send a field if the coordinator actually typed something --
          // an untouched, already-masked box must never overwrite the saved
          // URL with its own mask string.
          ...(slackInput.trim() ? { slack_webhook_url: slackInput.trim() } : {}),
          ...(discordInput.trim() ? { discord_webhook_url: discordInput.trim() } : {}),
          notify_submission: settings.notify_submission,
          notify_rsvp_going: settings.notify_rsvp_going,
          notify_ticket_sold: settings.notify_ticket_sold,
          notify_event_cancelled: settings.notify_event_cancelled,
        },
      });
      toast.success("Notification settings saved");
      setSlackInput("");
      setDiscordInput("");
      const fresh = await getChatHooks();
      setSettings(fresh);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(target: "slack" | "discord") {
    setTestBusy(target);
    try {
      await sendTestChatNotification({ data: { target } });
      toast.success(`Test message sent to ${target === "slack" ? "Slack" : "Discord"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create an Incoming Webhook in Slack/Discord and paste it here. We'll never read your
        workspace.
      </p>

      <div className="space-y-1.5">
        <Label>Slack webhook URL</Label>
        <div className="flex gap-2">
          <Input
            value={slackInput}
            onChange={(e) => setSlackInput(e.target.value)}
            placeholder={settings.slack_configured ? settings.slack_masked : "https://hooks.slack.com/services/…"}
          />
          {settings.slack_configured && (
            <Button
              size="sm"
              variant="outline"
              disabled={testBusy !== null}
              onClick={() => sendTest("slack")}
            >
              {testBusy === "slack" ? "Sending…" : "Send test"}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Discord webhook URL</Label>
        <div className="flex gap-2">
          <Input
            value={discordInput}
            onChange={(e) => setDiscordInput(e.target.value)}
            placeholder={settings.discord_configured ? settings.discord_masked : "https://discord.com/api/webhooks/…"}
          />
          {settings.discord_configured && (
            <Button
              size="sm"
              variant="outline"
              disabled={testBusy !== null}
              onClick={() => sendTest("discord")}
            >
              {testBusy === "discord" ? "Sending…" : "Send test"}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={settings.notify_submission}
            onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_submission: Boolean(v) }))}
          />
          New submissions
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={settings.notify_rsvp_going}
            onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_rsvp_going: Boolean(v) }))}
          />
          New going RSVPs
          <span className="text-xs text-muted-foreground">
            (high-volume calendars may want this off)
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={settings.notify_ticket_sold}
            onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_ticket_sold: Boolean(v) }))}
          />
          Ticket sales
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={settings.notify_event_cancelled}
            onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_event_cancelled: Boolean(v) }))}
          />
          Event cancelled
        </label>
      </div>

      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save notification settings"}
      </Button>
    </div>
  );
}
