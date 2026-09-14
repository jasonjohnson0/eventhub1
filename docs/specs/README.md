# EventHub feature specs

Written by Grok 2026-09-14 against commit `e7f10bb`. Claude implements in this order. Jason is the product owner for every `FLAG`.

Each spec has the same shape:

1. **Verified current state** — file:line citations, not memory.
2. **Scope** — in / out.
3. **User-facing flow** — including edges.
4. **Data model** — proposed SQL is a sketch; Claude finalizes the migration.
5. **Judgment calls (`FLAG`)** — product, not implementation. Grok states a recommended default. Don't silently pick the other option.
6. **Acceptance criteria** — testable done.

Do not implement #9 as "expose MCP as REST." Do not read "Stripe is live" as ticket charges. Do not read organizers labeled "speakers" as speaker workflows.

| # | Spec | Depends on |
|---|---|---|
| [01](01-paid-ticketing.md) | Paid ticketing | — |
| [02](02-multi-day-rendering.md) | Multi-day rendering | shares date math with 03 |
| [03](03-timezone-display.md) | Timezone display | shares date math with 02 |
| [04](04-private-events.md) | Private events | — |
| [05](05-timeline-view.md) | Timeline view | 02 |
| [06](06-speaker-workflows.md) | Speaker workflows | — |
| [07](07-unified-email-logs.md) | Unified email logs | — |
| [08](08-slack-discord-notifications.md) | Slack/Discord | 01 for ticket-sale events |
| [09](09-rest-api.md) | REST API | — |
| [10](10-outbound-webhooks.md) | Outbound webhooks + Zapier | 09 signing/auth |
| [11](11-calendar-two-way-sync.md) | Google/Outlook sync | 03 recommended |
| [12](12-sms-reminders.md) | SMS reminders | 07 consent/opt-out patterns |
