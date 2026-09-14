# Spec 08 — Slack / Discord coordinator notifications

Phase 3. Greenfield. Ticket-sale events depend on spec 01 being real.

## Verified current state (`e7f10bb`)

- No webhook URL column, no Slack/Discord string except bot-detection regexes in ad tracking.
- `coordinator_profiles.server_config` jsonb exists and is unused in `src/` — **don't stash URLs there** as an undocumented blob. Use real columns / a table so RLS and the UI are obvious.
- `notification_preferences` is attendee email/push, not coordinator inbound.
- `user_notifications` is in-app attendee mail.
- Submissions: `event_submissions` + `submissions.server.ts` already emails the coordinator via `sendPlatformEmail` on new submit.

## 1. Scope

**In**

- Per-coordinator Incoming Webhook URL for Slack and/or Discord (separate fields).
- Per-type toggles.
- Event types v1: `submission_received`, `rsvp_going`, `ticket_sold` (no-op until #1 confirms a charge), `event_cancelled`.
- Settings UI on `/settings` (coordinator).
- Post a small message to the webhook when the toggle is on and a URL is set. Slack: `{"text":…}` plus `blocks` optional. Discord: `{"content":…}`.

**Out**

- Slack OAuth apps, Discord bots, interactive buttons, slash commands.
- Per-event overrides (calendar-level only in v1).
- Attendee-facing Slack. This is coordinator-ops.

## 2. User-facing flow

### Settings

Section **Notifications**:

- Slack webhook URL (placeholder `https://hooks.slack.com/services/…`)
- Discord webhook URL (`https://discord.com/api/webhooks/…`)
- Checkboxes: New submissions, New going RSVPs, Ticket sales, Event cancelled.
- **Send test**. Posts "EventHub connected for {calendar name}." Validate URL host against an allowlist (`hooks.slack.com`, `discord.com` / `discordapp.com`). Reject anything else.

Help text: "Create an Incoming Webhook in Slack/Discord and paste it here. We'll never read your workspace."

### When things happen

| Event | Message (plain) |
|---|---|
| Submission received | `New event submission: "{title}" from {email}. Review: {url}` |
| RSVP going | `{n} going on "{title}" (just RSVP'd).` Don't fire on interested/declined. |
| Ticket sold | `{buyer} bought {qty}× {tier} (${amount}) for "{title}".` Only `status=confirmed`. |
| Event cancelled | `"{title}" was cancelled. {n} RSVPs, {paid} paid tickets refunded.` |

### Edges

- Missing URL + toggle on: no-op, no error to the attendee path.
- Webhook 4xx/5xx: log (console / `email_sends`-style later). Don't retry in v1 except one immediate retry on 5xx. Don't block RSVP on Slack being down — fire-and-forget after the primary write.
- Discord 204 is success.
- Never send attendee emails into Slack except the submitter email on submissions (coordinator already sees it in the review queue).

## 3. Data model

```sql
CREATE TABLE public.coordinator_chat_hooks (
  coordinator_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_webhook_url TEXT,
  discord_webhook_url TEXT,
  notify_submission BOOLEAN NOT NULL DEFAULT true,
  notify_rsvp_going BOOLEAN NOT NULL DEFAULT false,
  notify_ticket_sold BOOLEAN NOT NULL DEFAULT true,
  notify_event_cancelled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: owner all; no public read. Encrypt-at-rest is nice-to-have; HTTPS
-- URLs are secrets — don't SELECT them in any client-exposed list.
```

Store URLs encrypted with the same helper as `email_api_key` (`platform-config.server.ts` `decryptSecret`) if it's reusable; if that's platform-only, store plaintext in the table **but never return the full URL to the client after save** (show `hooks.slack.com/services/…****`).

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | One URL field vs separate Slack/Discord? | **Separate fields.** | URL shapes differ; one field invites pasting the wrong thing. |
| F2 | Notify on every RSVP going, or digest? | **Immediate, but only `going`.** Digest is nicer at scale; v1 calendars aren't there. Add a note in UI: "high-volume calendars may want this off." |
| F3 | Ticket-sale notify before #1 lands? | **Wire the hook, fire only on `confirmed`.** Until #1, it never fires. Don't fire on the current stub pending insert. |

## 5. Acceptance criteria

- [ ] Pasting a Slack webhook + enabling submissions + submitting an event posts the message within a few seconds.
- [ ] Invalid host is rejected at save.
- [ ] RSVP going with Slack down still saves the RSVP.
- [ ] Test button works for each filled URL.
- [ ] URLs are not rendered in full after save.
- [ ] `docs/ROADMAP.md`: Not built → Live.

## Implementation notes for Claude

- Helper `notifyCoordinator(coordinator_id, type, payload)` called from submissions.server, attendee upsertRsvp, ticket confirm webhook, event cancel. Don't sprinkle `fetch(slack)` in four files without a helper.
- Allowlist hosts. This is an SSRF footgun if you fetch a coordinator-supplied URL — allowlist is mandatory.
