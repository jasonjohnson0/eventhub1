# Spec 09 — General REST API

Phase 3. **Not** "expose MCP as REST." MCP (`/mcp`, 5 OAuth tools, user-scoped) stays. This is server-to-server for coordinators' own automations.

## Verified current state (`e7f10bb`)

- MCP: `src/routes/mcp.ts` + `src/lib/mcp/index.ts`. Tools: `list_events`, `get_event`, `create_event`, `update_event`, `list_venues`. Auth: Supabase OAuth (`auth.oauth.issuer`). RLS via `supabaseForUser(ctx)`.
- No `/api/v1`. `src/routes/api/` is embed, Stripe inbound webhook, ad pixels, public ical.
- No API-key table, no hashed secrets, no rate-limit middleware.
- Events, venues, tickets, RSVPs already RLS-scoped by `coordinator_id`.

## 1. Scope

**In**

- `/api/v1` JSON REST, versioned from day one.
- Auth: **coordinator API keys** (Bearer). One coordinator, many keys, hashed at rest, shown once on create.
- Resources v1 (coordinator-scoped automatically):
  - `GET/POST /events`, `GET/PATCH/DELETE /events/:id`
  - `GET/POST /venues`, `GET/PATCH/DELETE /venues/:id`
  - `GET /events/:id/tickets`, `POST` tier, `DELETE` tier
  - `GET /events/:id/rsvps` (no public write)
  - `GET /me` — calendar slug, timezone, currency
- Rate limit: 60 req/min/key, 429 + `Retry-After`.
- Errors: `{ "error": { "code": "sold_out", "message": "…" } }` with HTTP status.
- HTTPS only. CORS: deny browser origins by default (no `*`). This is a server API.

**Out**

- OAuth for third-party apps (`FLAG` F1).
- Attendee-facing endpoints (public calendar is already `/c/$slug` + embed).
- Creating other coordinators' events.
- Webhooks (that's #10; mention `Link` / docs, don't implement here).
- GraphQL.
- Exposing `/mcp` at a REST path.

## 2. User-facing flow

### Coordinator

Settings → **API keys**:

- List: name, prefix `eh_live_…`, last used, created, revoke.
- Create: name → show secret **once** (`eh_live_` + 32 bytes hex). Copy. Cannot retrieve later.
- Revoke: immediate 401 on that key.

Docs: `GET /api/v1` (unauthenticated) returns a short index + link to `docs/` or a markdown page at `/docs/api` later. For v1, README section is enough.

### Caller

```
Authorization: Bearer eh_live_…
```

Key maps to `coordinator_id`. All queries add that scope. A key must never see another calendar.

### Edges

- Wrong key / revoked: 401.
- Valid key, other coordinator's UUID: 404 (not 403 — don't leak existence).
- Validation errors: 422 with field names.
- Write rate: same 60/min. No separate burst for now.

## 3. Data model

```sql
CREATE TABLE public.coordinator_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,             -- eh_live_abcd1234
  secret_hash TEXT NOT NULL,        -- sha256
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: owner SELECT (never secret_hash to client — strip in the server fn);
-- insert/revoke via server functions using admin client.
```

Hash with SHA-256 (or scrypt). Compare hash only. Prefix is for UI lookup.

Rate limit: in-memory per instance is not enough on Vercel. Use a table `api_rate_buckets(key_id, window_start, count)` or Upstash if already present — grep before adding Redis. If nothing, Postgres upsert is fine at this volume.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | API keys vs OAuth? | **API keys in v1.** | Coordinators want Zapier/Make/curl. OAuth is for third-party apps in a marketplace we don't have. MCP already covers user-OAuth agents. |
| F2 | Versioning now? | **Yes, `/api/v1`.** | Zero extra cost. Avoids painting `/api/events` into a corner. |
| F3 | Ticket purchase via API? | **No in v1.** Read tiers, don't charge. Charging belongs in Checkout (#1), not a secret-key API. |

Don't reuse MCP session tokens as REST keys.

## 5. Acceptance criteria

- [ ] A coordinator can create a key, `curl -H "Authorization: Bearer …" /api/v1/events`, and see only their events.
- [ ] Revoke → 401.
- [ ] Creating an event via POST shows up on `/c/$slug`.
- [ ] 61st request in a minute → 429.
- [ ] MCP tools still work independently.
- [ ] `docs/ROADMAP.md`: REST API Not built → Live. Keep the "MCP ≠ REST" line.

## Implementation notes for Claude

- TanStack Start server routes under `src/routes/api/v1/`. Don't drop this into `server/` (that's platform chrome in some environments; here `src/routes/api` is the pattern).
- Auth middleware: look up hash, set coordinator_id, **do not** use `requireSupabaseAuth` (that's a cookie session).
- Never log the Bearer token.
