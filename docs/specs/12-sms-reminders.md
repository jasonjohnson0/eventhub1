# Spec 12 — SMS reminders

Phase 4. No phone collection, no provider, US TCPA is in-scope — not an afterthought.

## Verified current state (`e7f10bb`)

- No attendee phone field. `event_rsvps` is `(event_id, user_id, status, checked_in_at)`.
- `coordinator_profiles.phone` and `venues.phone` are org contact numbers, not attendee mobiles.
- `notification_preferences`: `email_reminders`, `push_reminders`, `days_before`. No SMS column.
- `marketing_consent` is email marketing (`consent_status` pending/confirmed/unsubscribed).
- No Twilio (or any SMS) dependency or env usage in `src/`.
- Reminder scheduling exists as in-app `user_notifications` (and after #7, email). 7d / 1d / 1h offsets (`communications.functions.ts:169-173`).

## 1. Scope

**In**

- Collect a mobile number on the RSVP path, optional, US numbers first.
- Explicit TCPA consent checkbox. No pre-checked box. Timestamp + copy stored.
- STOP / HELP / START keywords (Twilio inbound).
- Opt-out link in every SMS (`Reply STOP to opt out`).
- Triggers: default **1 hour before start** for `going` RSVPs with consent. Optional 1-day. Not 7-day SMS (`FLAG` F2).
- Provider: **Twilio**.
- Coordinator cannot buy a list and blast; SMS only to people who RSVP'd **this event** and consented.

**Out**

- Marketing SMS, sponsor blasts, "invite your friends via SMS."
- Internationalization beyond `+1` in v1 (`FLAG` F3).
- MMS, WhatsApp.
- Using coordinator_profiles.phone as a sender ID (Twilio number is platform-level).

## 2. User-facing flow

### Collecting (RSVP)

When a user clicks Going (including after ticket confirm from #1):

1. If we don't have a number + consent for this user: optional field **Mobile (US)** + required checkbox if a number is entered:

   > I agree EventHub may send transactional text messages about this event (reminders and schedule changes). Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of attending.

2. Empty number: RSVP proceeds, no SMS. Don't nag twice on the same event; do offer again on a later event if still missing.
3. Number without checkbox: block submit with "Check the box to receive texts, or leave the number blank."

Store consent independently of the RSVP so declining later doesn't erase the number, but **unchecking SMS in settings** or STOP does.

### Settings (attendee)

- Phone, consent on/off, "SMS reminders" toggle next to `email_reminders`.
- "Forget my number."

### Sending

- 1h before `start_time` (event TZ from #3):  
  `{title} starts at {time} {zone}. {venue or virtual}. {short link} Reply STOP to opt out`
- Optional 1d: similar, "tomorrow".
- Event cancelled: one SMS if they consented, even if they turned "reminders" off? **No** — cancelled is transactional and useful, send if consent still valid and not STOP'd (`FLAG` F4).
- Coordinator has no free-text SMS compose in v1. Too easy to abuse.

### Inbound

- STOP: set opt-out, reply "You're unsubscribed from EventHub texts. You won't get more messages."
- HELP: reply with help URL + "Reply STOP to opt out."
- START: re-enable if we still have the number; otherwise "Visit EventHub to opt back in."

### Edges

- Landline / Twilio error 21614: mark undeliverable, don't retry.
- Coordinator timezone vs attendee: send relative to **event** start, not attendee local clock. The message includes the zone.
- Quiet hours: don't send between 9pm–8am **in the event timezone** (`FLAG` F5). Slide 1h reminders to 8am if they'd land in the quiet window (e.g. 6am start → send the evening before at 8pm? actually that's also adjacent. Simpler: if the 1h reminder would land in quiet hours, skip SMS and rely on email).
- TCPA: keep `consented_at`, `consent_text` (the exact copy shown), `ip` if we have it, `user_agent` optional.

## 3. Data model

```sql
CREATE TABLE public.sms_contacts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,                 -- +1XXXXXXXXXX
  consent_sms BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMPTZ,
  consent_text TEXT,
  stopped_at TIMESTAMPTZ,
  undeliverable_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS sms_reminders BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.sms_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  to_e164 TEXT NOT NULL,
  body TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('reminder_1h','reminder_1d','event_cancelled','help','stop_ack')),
  provider_sid TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Platform env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Not `VITE_`.

Inbound webhook: `/api/twilio/inbound` validating `X-Twilio-Signature`.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Where is the number collected? | **RSVP form (and ticket confirm), plus settings.** | No EventHub "account profile" that's actually used by attendees today besides notification prefs. Don't invent a profile page just for this. |
| F2 | Same schedule as email (7d/1d/1h) or shorter? | **1h default, optional 1d. No 7d SMS.** | 7-day SMS feels marketing-y and burns TCPA goodwill. Email can do 7d. |
| F3 | US-only? | **Yes in v1** (`+1`, NANP). | TCPA is the hard part; GDPR/CASL/other-country consent is a different legal memo. |
| F4 | Cancellation SMS even if reminders off? | **Yes if consent+not STOP'd.** | That's a schedule change, not a reminder they opted out of. Keep it one message, no upsell. |
| F5 | Quiet hours? | **Skip SMS 9pm–8am event-local rather than sending.** | TCPA "reasonable hours" plus not being rude. |

## 5. Acceptance criteria

- [ ] RSVP with number and unchecked box does not save the number and does not send.
- [ ] RSVP with number + checked box stores e164, timestamp, and the exact consent copy.
- [ ] A going RSVP with consent receives one SMS ~1h before start, containing STOP language.
- [ ] STOP inbound: no further SMS except the ack; settings show opted out.
- [ ] User with `sms_reminders = false` but leftover consent: no reminder SMS (cancelled still sends per F4 — document in UI).
- [ ] Coordinator cannot send a free-text blast.
- [ ] No Twilio secrets in client bundles.
- [ ] `docs/ROADMAP.md`: Not built → Live, with "US transactional only, TCPA consent required" explicit.

## Implementation notes for Claude

- Don't send SMS from the RSVP request path except the cancelled-event path; reminders go through the same cron as #7.
- Normalize numbers with a small NANP helper; reject anything that isn't 10-digit US after stripping.
- Log every send in `sms_sends` the way #7 logs `email_sends`.
- Never use SMS for marketing. If a future spec wants it, that's a new consent checkbox with different copy.
