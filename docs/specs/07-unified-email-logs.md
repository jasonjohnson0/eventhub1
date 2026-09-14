# Spec 07 — Unified email logs

Phase 2. Invitations are tracked. Announcements and reminders are not, and (verified) they don't actually send email.

## Verified current state (`e7f10bb`)

**Invitations (real email, real tracking)**

- Table `event_invitations`: `sent_at`, `opened_at`, `clicked_at`, `rsvp_status` (`20260706035923_…sql:13-26`).
- `sendEventInvitations` upserts rows then `sendPlatformEmails` (`communications.functions.ts:62-92`).
- Open/click pixels: `trackEmailOpen` / `trackEmailClick` (`:115-139`).
- Manage page lists them via `listEventInvitations`.

**Announcements + reminders (not email)**

- `sendEventAnnouncement` (`:199-231`) inserts `user_notifications` with `sent_at = now()` and **never** calls the mailer. Recipients are RSVP going/interested, identified by `user_id` only — no email lookup.
- `scheduleReminders` (`:141-197`) inserts `user_notifications` rows at 7d / 1d / 1h before start, `sent_at` null. **No worker drains them.** Index `user_notifications_pending_idx` on `scheduled_for WHERE sent_at IS NULL` is waiting for a job that does not exist (grep of `src/` + `supabase/`).
- `user_notifications`: `type` enum `reminder | announcement | update`, `scheduled_for`, `sent_at`, `read_at`, `custom_message`. In-app only (`listMyNotifications`).

**Mailer**

- Provider-agnostic: `platform_config.email_provider` in `lovable | sendgrid | postmark | mailgun | none` (`email-providers.server.ts`).
- Send path returns `{ ok }` / `{ ok: false, error }`. No message-id stored. No inbound bounce webhook anywhere (`api/` has Stripe, embed, ad pixels, public ical — no provider event webhook).
- Lovable provider `sendViaLovable` returns `{ ok: true }` without sending (`email-providers.server.ts:96-101`).

ROADMAP listed "Email reminders + announcements" as Live. That's wrong; Grok moved it to Partial.

## 1. Scope

**In**

- One coordinator UI: **Email log** on the event manage page (and a workspace-wide log at settings).
- Rows for invitations, announcements, updates, reminders — anything that goes out via `sendPlatformEmails`.
- Filters: type, status (queued / sent / failed / bounced / complained / opened / clicked), date range, search by recipient.
- Actually **send** announcement + reminder email through the existing mailer (fix the gap), logging each attempt.
- A worker (or on-request drain) that sends due `reminder` rows.
- Capture provider message-id when the API returns one (SendGrid/Postmark/Mailgun).
- Inbound bounce/complaint webhook **stubs per provider** (`FLAG` F2 — implement Postmark + SendGrid if that's what production uses; skip until provider is known).

**Out**

- Marketing campaigns beyond event-scoped mail (that's `marketing_consent`, separate).
- Rewriting invitation open/click pixels (reuse them; generalize the token).
- SMS (#12).

## 2. User-facing flow

### Sending (coordinator)

- Invitations: unchanged, but each send also writes `email_sends`.
- Announcement: existing compose box. After this spec it emails each going/interested attendee who has an email (from `auth.users` via admin client, or profiles) **and** inserts `email_sends`. In-app `user_notifications` can remain as a copy.
- Reminders: scheduling UI stays. A drain job sends when `scheduled_for <= now()` and logs the send. Skip users with `notification_preferences.email_reminders = false`.

### Log UI

1. Event manage → tab **Email**. Table: when, type, recipient, subject, status, opened, clicked.
2. Workspace settings → **Email log** across all events, filter by event.
3. Failure: status `failed` with truncated provider error (already collected in `sendPlatformEmails.errors`, currently discarded after the invitation return payload).
4. Click a row: detail (error text, provider, message-id). No resend in v1 (`FLAG` F3) except invitations which already upsert.

### Edges

- Recipient with no email: skip, count as `skipped` in the log, don't throw the whole batch.
- Provider = `none` or lovable dummy: log `failed` / `simulated` rather than lying `sent`. Don't mark Lovable `{ ok: true }` as delivered if we know it's a stub — label `simulated` (`FLAG` F1).
- Bounce later: if a webhook is configured, flip status to `bounced` / `complained`. Without a webhook, we only know send-time failures.

## 3. Data model

Don't overload `event_invitations` for announcements. New table:

```sql
CREATE TABLE public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  invitation_id UUID REFERENCES public.event_invitations(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('invitation','announcement','update','reminder')),
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','skipped','simulated','bounced','complained')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: coordinator reads own; service_role writes.
```

Open/click: reuse invitation pixels where `invitation_id` is set; for other types, mint a token on `email_sends` or reuse a generic `/api/public/email/o/$id` pixel.

Reminder drain: either a Vercel cron hitting a server route, or send-on-read from an admin function. Pick whatever this stack already uses for cron. If none, a server route `/api/cron/email-reminders` gated by a secret header, documented in `docs/DEPLOY_VERCEL.md`.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Count Lovable `{ ok: true }` as sent? | **No. Status `simulated`.** | The function comments admit it doesn't send. Logging it as sent is how ROADMAP got this wrong. |
| F2 | Bounce webhooks in v1? | **Schema-ready (`bounced`/`complained`), implement the inbound route only for the provider currently configured in `platform_config`.** If provider is `none`/`lovable`, skip the route. | Don't build three provider webhook verifiers speculatively. |
| F3 | Resend button? | **Not in v1** except the existing invitation upsert. | |

## 5. Acceptance criteria

- [ ] Announcement to N going/interested users with real emails creates N `email_sends` and actually calls `sendPlatformEmails` (or logs `simulated`/`failed` honestly).
- [ ] A reminder scheduled 1h ahead is emailed around that time (cron or equivalent), not only stored.
- [ ] Event Email tab shows invitations + announcements + reminders together, filterable.
- [ ] A forced provider error surfaces as `failed` with the error text, not as success.
- [ ] Users with `email_reminders = false` are skipped.
- [ ] `docs/ROADMAP.md`: unified logs Live; "Email reminders + announcements" can move Partial → Live only if the mailer is actually called.

## Implementation notes for Claude

- Every `sendPlatformEmails` caller should write `email_sends`. Centralize that in `platform-mailer.server.ts` so future senders can't forget.
- Don't invent a second mailer.
- Look up attendee emails with the admin client; `event_rsvps` only has `user_id`.
