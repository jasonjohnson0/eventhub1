# Spec 01 — Paid ticketing (charge execution)

Phase 1. Finish what's stubbed. Highest value in the list.

## Verified current state (`e7f10bb`)

Schema (`supabase/migrations/20260706081427_9adcd7eb-6840-4c97-b9ff-3162650feb77.sql`):

- `event_tickets`: `name`, `price_cents`, `quantity_available`, `quantity_sold`, `early_bird`, `early_bird_price_cents`, `valid_from`, `valid_until`.
- `ticket_purchases`: `quantity`, `amount_cents`, `stripe_charge_id` (nullable, never written), `status` in `pending|confirmed|refunded|cancelled`, `qr_token`, `check_in_count`. Default status is `'confirmed'`.
- RLS: public can SELECT approved-event tiers; buyers INSERT their own purchase; coordinators SELECT/UPDATE purchases on their events.
- `check_in_ticket(qr_token)` (`:112-137`) does **not** check `status = 'confirmed'`.

Purchase path (`src/lib/monetization.functions.ts:86-157`):

- Requires sign-in (`requireSupabaseAuth`).
- Computes early-bird vs regular.
- Reads `platform_config.use_custom_stripe` + `stripe_secret_key` (admin/platform, not Connect).
- If `amount > 0` and no Stripe key: throws.
- Inserts purchase as `pending` if a key exists, else `confirmed` ("demo").
- Increments `quantity_sold` immediately (`:146-149`).
- Returns `"Purchase pending — Stripe charge would happen here"`. **Never constructs a Stripe client.**

UI:

- Coordinator manage page: `ticket-manager.tsx:84-91` calls `purchaseTicket` and toasts the stub message.
- Public event page: `events.$id.tsx:706` "Buy ticket" calls `handleRsvpClick` (`:311`), which upserts RSVP going/declined. **It does not purchase.**

Working Stripe elsewhere (do not confuse):

- Coordinator **annual-plan subscriptions** via Checkout Session (`annual-plan.functions.ts:38-70`) + webhook (`api/stripe.webhook.ts`) handling `checkout.session.completed` only when `session.mode === "subscription"`. Copy this pattern; do not overload it without a `kind` discriminator in metadata.
- `getStripe()` in `stripe.server.ts` uses `STRIPE_SECRET_KEY` only.
- Currency default lives on `coordinator_profiles.currency` (`USD`).

Free path (`price_cents === 0`) is Live: auto-confirm, QR via `qrserver.com`, desk + mobile check-in.

## 1. Scope

**In**

- Charge execution for `price_cents > 0` via Stripe Checkout Session.
- Public event-page Buy button actually starts checkout.
- Inventory that is safe with async payment (hold → confirm or release).
- Confirm → QR + email receipt (existing mailer).
- Coordinator-initiated refund of a confirmed purchase.
- Auto-refund of confirmed paid purchases when the coordinator cancels/removes the event.
- Check-in refuses non-confirmed tickets.
- Webhook branch for `mode === "payment"` ticket checkouts, distinct from annual-plan subscriptions.

**Out (v1)**

- Stripe Connect / destination charges / per-coordinator payouts (`FLAG` below).
- Guest (signed-out) checkout.
- PayPal, Square, tax, invoices, promo codes, cart of mixed events.
- Buyer self-service refunds (`FLAG`).
- Partial refunds, quantity splits after purchase.
- Changing the free-ticket path.

## 2. User-facing flow

### Coordinator (already mostly exists)

1. On `/events/$id/manage`, create tiers (name, price, quantity, optional early-bird window). Unchanged.
2. After this ships: a "Payments" hint on the ticket card if Stripe isn't configured (same `STRIPE_SECRET_KEY` / platform custom key already required for annual plan). Don't build a second Stripe setup UI.

### Buyer — paid tier

1. On `/events/$id`, signed-out user clicks **Buy ticket** → existing sign-in dialog (not RSVP). After auth, return to the event page with `?buy=<tierId>` so they don't lose the intent.
2. Signed-in user clicks **Buy ticket** → server creates a Stripe Checkout Session (`mode: "payment"`) and redirects to `session.url`. No charge on EventHub's page.
3. Checkout shows: event title, tier name, quantity (v1: 1 from the public button; manage-page "Buy" can keep qty=1 too, or pass through the existing 1–10 validator — public button is qty 1).
4. Success → ` /events/$id?purchase=success&session_id=cs_… ` → EventHub retrieves the session (or trusts the webhook; UI should poll/read the purchase) → shows QR + "You're confirmed." Also upsert RSVP `going` for that user.
5. Cancel / close Checkout → `?purchase=canceled` → no charge, hold released (see data model). Toast: "Purchase canceled. No charge."
6. Sold out (confirmed + unexpired holds) → button disabled, "Sold out".
7. Early-bird window elapsed mid-session: Checkout amount is whatever was computed when the session was created; don't reprice after redirect.

### Buyer — free tier

Unchanged: `purchaseTicket` confirms immediately, QR shown, no Checkout.

### Check-in

Scan QR. If status isn't `confirmed`, error "Ticket is not valid" (pending/cancelled/refunded). Existing quantity vs `check_in_count` cap stays.

### Refunds

- Coordinator on manage page, per confirmed purchase: **Refund**. Confirm dialog ("Stripe will refund $X.XX. QR stops working."). Calls Stripe Refund on the PaymentIntent, sets status `refunded`, decrements `quantity_sold`, records `refund_stripe_id`.
- Buyer has no self-service refund button in v1 (`FLAG`).
- Event cancel/remove (`events.functions.ts` delete/update to removed): for each `confirmed` paid purchase on that event, refund automatically, email the buyer using `sendPlatformEmails`. Free tickets just cancel.

### Failure / edges

- Stripe not configured + paid tier → Buy shows "Payments aren't set up" rather than inserting a demo confirmed row. Kill the `"Stripe not configured. Purchase recorded as demo."` branch for `amount > 0`.
- Webhook delayed: success page may briefly say "Confirming payment…" and poll `listMyPurchases` until `confirmed` or 15s timeout with "Refresh this page — your ticket will appear once payment lands."
- Duplicate click: Checkout Session creation is idempotent per `(user_id, ticket_id)` while a non-expired pending hold exists — reuse that session URL rather than double-holding.
- `quantity_sold + holds + qty > quantity_available` → 409 "Sold out".
- Expired hold (30 min): status `cancelled`, does not count as sold, QR never valid.

## 3. Data model

Existing columns to keep: `stripe_charge_id` (store PaymentIntent id `pi_…`), `status`, `qr_token`, `quantity_sold`.

Add to `ticket_purchases`:

```sql
ALTER TABLE public.ticket_purchases
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_stripe_id TEXT;

CREATE INDEX IF NOT EXISTS ticket_purchases_hold_idx
  ON public.ticket_purchases (ticket_id)
  WHERE status = 'pending' AND reserved_until IS NOT NULL;
```

Inventory (do **not** increment `quantity_sold` at insert for paid):

```
available = quantity_available
          - quantity_sold                          -- confirmed only
          - SUM(quantity) FROM ticket_purchases
              WHERE ticket_id = :id
                AND status = 'pending'
                AND reserved_until > now()
```

On webhook confirm: `status = 'confirmed'`, `stripe_charge_id = payment_intent`, `quantity_sold += quantity`, `reserved_until = null`.

On expire/cancel: `status = 'cancelled'`. Never decrement `quantity_sold` because it was never incremented.

Wrap hold-create in a SQL function `reserve_ticket(...)` with `FOR UPDATE` on the tier row so two concurrent checkouts can't oversell. Don't do the check-then-insert in JS.

Webhook metadata (required, so the subscription handler doesn't touch these):

```
metadata.kind = "ticket_purchase"
metadata.purchase_id = <uuid>
metadata.event_id = <uuid>
metadata.coordinator_id = <uuid>
```

`checkout.session.completed` + `checkout.session.expired` + `charge.refunded` must be handled. Ignore events with `kind != ticket_purchase` in the new branch; ignore `kind == ticket_purchase` in the subscription branch.

Currency: `coordinator_profiles.currency` (already on the event's coordinator). Lowercase it for Stripe (`usd`). v1: no per-event currency column.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Checkout Session vs Payment Element? | **Checkout Session (hosted)** | Already used for annual plan; no PCI UI; webhook already exists. Payment Element is a later conversion optimization. |
| F2 | Platform Stripe vs Connect per coordinator? | **Platform account in v1** (`getStripe()` / `STRIPE_SECRET_KEY`). Money lands in EventHub's Stripe. | There is no per-coordinator Connect account today. `platform_config.stripe_connect_account_id` is the *platform* Connect flag, not a coordinator's. Connect + destination charges is a separate product (payouts, tax, ToS). Don't pretend v1 is Connect. |
| F3 | Guest checkout? | **No. Sign-in required.** | `user_id` is `NOT NULL` on `ticket_purchases`. Guest means schema + QR-email-only identity. Out of v1. |
| F4 | Buyer self-service refunds? | **No.** Coordinator (or auto on event cancel) only. | Chargebacks exist; self-service refunds need a policy window (24h / before start / never). Add later. |
| F5 | Auto-refund on event cancel? | **Yes**, confirmed paid purchases, via Stripe Refund, plus email. | Otherwise EventHub holds money for an event that isn't happening. Free tickets: status `cancelled`, no Stripe. |
| F6 | Hold duration? | **30 minutes** (`reserved_until`). | Stripe Checkout sessions expire in 24h by default; we should expire ours sooner so inventory isn't trapped. Set Checkout `expires_at` to match (~30 min). |

If Claude or Jason overrides F2 (Connect), stop and write the payout model before coding charges. Don't ship platform-charges and call it Connect.

## 5. Acceptance criteria

- [ ] Paying for a `price_cents > 0` tier with a test card in Stripe test mode creates a `confirmed` purchase, writes `stripe_charge_id`, shows a QR, and the charge appears in the Stripe dashboard.
- [ ] Closing Checkout without paying leaves no `confirmed` row and restores availability within 30 minutes (or immediately on `checkout.session.expired`).
- [ ] Two concurrent buyers cannot push `confirmed + pending-holds` above `quantity_available`.
- [ ] Public `/events/$id` "Buy ticket" starts Checkout for signed-in users and sign-in for signed-out users. It does **not** toggle RSVP.
- [ ] Free tiers still confirm without Stripe.
- [ ] `check_in_ticket` rejects `pending` / `cancelled` / `refunded`.
- [ ] Coordinator refund sets status `refunded`, Stripe refunds, QR dies, inventory returns.
- [ ] Cancelling/removing an event auto-refunds confirmed paid purchases and emails buyers.
- [ ] Annual-plan subscription webhook still works. A ticket Checkout completion does not upsert `coordinator_subscriptions`.
- [ ] `docs/ROADMAP.md`: Paid ticketing moves from Partial → Live, with the Connect-is-not-this caveat remaining in writing. Stub string is gone from the repo.

## Implementation notes for Claude

- Copy `createAnnualCheckout` shape: `getStripe().checkout.sessions.create`, `success_url`/`cancel_url` via `siteOrigin()`, metadata, then redirect.
- Extend `api/stripe.webhook.ts` with an explicit `kind` switch. Do not handle ticket payments inside the subscription `checkout.session.completed` branch.
- Replace the demo branch in `purchaseTicket` (`:154-155`) for `amount > 0`.
- Wire `events.$id.tsx` Buy to a new `createTicketCheckout` server function, not `handleRsvpClick`.
- After confirm, upsert RSVP `going` (today buying a ticket does not RSVP you).
- Receipt email through `sendPlatformEmails` / existing templates. Don't invent a mailer.
- No new npm dependency — `stripe` is already used.
