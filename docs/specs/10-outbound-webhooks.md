# Spec 10 — Outbound webhooks + Zapier

Phase 3. **Depends on #9's signing/auth decisions.** If you implement this first, use the HMAC scheme below anyway — #9 API keys authenticate inbound callers; this HMAC authenticates EventHub as the sender. Different directions. Don't reuse API keys as webhook secrets.

## Verified current state (`e7f10bb`)

- Only inbound Stripe webhook (`api/stripe.webhook.ts`), verified with `stripe-signature`.
- No coordinator outbound webhook config, no delivery log, no HMAC helper.

## 1. Scope

**In**

- Coordinator registers HTTPS endpoints, picks event types, gets a signing secret (shown once).
- Subscribable types v1: `event.created`, `event.updated`, `event.cancelled`, `rsvp.created`, `rsvp.updated`, `ticket.purchased` (after #1), `submission.created`.
- POST JSON payload + `X-EventHub-Signature` (`sha256=<hex>`) and `X-EventHub-Timestamp`.
- Retry: 3 attempts, backoff 1m / 10m / 1h. Then mark `dead`. No infinite retry.
- Delivery log (last 50 / endpoint).
- Zapier: **generic Catch Hook** against this system. **Not** a Zapier marketplace app (`FLAG` F1).

**Out**

- Zapier branded app, OAuth into Zapier.
- Transform/filter UI (Zapier filters exist).
- Slack/Discord: keep those on spec 08 incoming webhooks; don't dual-send unless the coordinator pastes a Slack URL here (will fail HMAC on Slack's side — UI should warn if host is `hooks.slack.com`).

## 2. User-facing flow

Settings → **Webhooks**:

1. Add endpoint: URL, types (checkboxes), optional description.
2. Show signing secret once (`whsec_…`).
3. Test: send `ping` type.
4. List deliveries: timestamp, type, status code, attempt, "redeliver" button.

Payload:

```json
{
  "id": "evt_…",
  "type": "rsvp.created",
  "created_at": "2026-09-14T04:00:00Z",
  "data": { /* resource snapshot */ }
}
```

Signature (Stripe-shaped, on purpose):

```
signed_payload = `${timestamp}.${rawBody}`
X-EventHub-Signature: sha256=${hmac_sha256(secret, signed_payload)}
X-EventHub-Timestamp: ${unix_seconds}
```

Receivers reject |now - timestamp| > 5 minutes.

### Edges

- Non-2xx: retry schedule. 410 Gone: disable endpoint, stop retrying.
- URL must be HTTPS. Localhost rejected in production.
- Disable toggle without deleting.
- Payload size: snapshots of one event/RSVP, not lists.

## 3. Data model

```sql
CREATE TABLE public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  secret_hash TEXT NOT NULL,          -- store hash; keep display secret only at create
  secret_prefix TEXT NOT NULL,
  event_types TEXT[] NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt INT NOT NULL DEFAULT 0,
  status_code INT,
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  dead_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Problem:** we must HMAC with the raw secret later, so we **cannot** only store a hash. Store the secret encrypted (same `encryptSecret` as email API keys), not plaintext, and never send it back after create.

Delivery worker: same cron question as #7. `/api/cron/webhooks` gated by secret header.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Zapier marketplace app vs generic webhooks? | **Generic webhooks.** Zapier "Catch Hook" + our HMAC is enough. A marketplace app is a vendor relationship and a second auth stack. Revisit if Jason wants listed-on-Zapier marketing. |
| F2 | Sign with API key from #9? | **No. Separate `whsec_`.** Inbound auth ≠ outbound authenticity. Stripe doesn't either. |

## 5. Acceptance criteria

- [ ] Registering an endpoint + triggering `event.created` POSTs a signed JSON body within a few seconds.
- [ ] Tampered body fails HMAC (document a sample verifier snippet in the spec PR / README).
- [ ] 500 from receiver retries; 200 stops; 410 disables.
- [ ] Slack host warning if they paste a Slack incoming URL.
- [ ] Secret shown once.
- [ ] `docs/ROADMAP.md`: Not built → Live, with "Zapier = Catch Hook, not marketplace app" explicit.

## Implementation notes for Claude

- SSRF: HTTPS, deny private/link-local IPs, deny `hooks.slack.com` unless we add a dedicated path. Allowlist is harder here than spec 08 (receivers are arbitrary). At minimum: no loopback, no metadata IPs (`169.254.169.254`), timeout 10s.
- Don't block the request that spawned the event; enqueue `webhook_deliveries` and return.
