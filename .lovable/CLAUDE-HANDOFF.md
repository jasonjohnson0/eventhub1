# EventHub — Handoff Brief for Claude (or any external assistant)

**Source of truth:** the Lovable workspace. The live app is edited and previewed
in Lovable. Lovable ↔ GitHub is a two-way sync; do not treat a local clone or a
GitHub branch as the primary working copy. If you (Claude) edit code in a clone,
push it to GitHub, and Lovable pulls it — fine. But never let two editors
diverge: pick Lovable as canonical, and when in doubt, ask before editing code
outside Lovable.

---

## 1. What the MCP agent integration can and cannot do

The EventHub MCP server (`eventhub`, v0.1.0) is served from the published app
and is OAuth-protected. It exposes **exactly five tools**, all running as the
signed-in user under Supabase RLS:

- `list_events` — search/filter events (title, category, status, date, limit)
- `get_event` — full event lookup by id
- `create_event` — create an event owned by the signed-in user
- `update_event` — partial update of an event the user owns (RLS-enforced)
- `list_venues` — search/list venues

**These tools only touch event/venue DATA in the shared Supabase database.**
They cannot edit code, migrations, routes, or config. So work done through the
MCP connection creates database rows — it does **not** fork the codebase and
cannot cause codebase drift. Codebase inconsistency is only a risk if Claude is
also given direct code-editing access (a cloned repo, uploaded files, etc.). If
that's the case, the rules below apply.

---

## 2. Tech stack — do not swap frameworks

- **TanStack Start v1** (React 19) + Vite 7, file-based routing in `src/routes/`.
- **Tailwind CSS v4** via `src/styles.css` (`@import "tailwindcss"`, `@theme`
  with oklch tokens). No `tailwind.config.js`.
- **Supabase** (Lovable Cloud) for DB, auth, storage. RLS on every public table.
- `@lovable.dev/mcp-js` for the MCP server; `@lovable.dev/vite-tanstack-config`
  supplies the Vite/TanStack plugin stack — do not re-add tanstackStart,
  viteReact, tailwindcss, tsConfigPaths, nitro, or componentTagger manually.
- Never introduce React Router DOM, Next/Remix patterns, Vue/Svelte/Angular,
  `src/pages`, `entry-client.tsx`/`entry-server.tsx`, or an `App.tsx` switcher.

## 3. Code conventions

- **Server logic:** `createServerFn` from `@tanstack/react-start` in
  `src/lib/*.functions.ts`. Protected functions use
  `.middleware([requireSupabaseAuth])` and read `context.supabase`,
  `context.userId`, `context.claims`. RLS applies as the user.
  `process.env.*` is server-only — read it inside the `.handler()`, never at
  module scope.
- **Public HTTP endpoints / webhooks:** TanStack server routes under
  `src/routes/api/public/*` (this prefix bypasses site auth — verify the caller
  inside the handler).
- **Client Supabase:** `import { supabase } from "@/integrations/supabase/client"`.
- **Privileged/admin work only:** `supabaseAdmin` from
  `@/integrations/supabase/client.server`, imported inside the handler after
  verifying the caller. Never use it for ordinary reads or role checks.
- **Auth middleware:** `src/start.ts` registers `functionMiddleware:
  [attachSupabaseAuth]` (bearer token attach) and an error `requestMiddleware`.
  Preserve both; append, don't replace.
- **Routing:** every parent/layout route renders `<Outlet />`. Create the route
  file for any path a `Link`/`navigate`/`redirect` references, in the same batch.
  Never edit `src/routeTree.gen.ts` — it regenerates automatically.
- **Data loading:** route loader + `context.queryClient.ensureQueryData(...)`
  + `useSuspenseQuery`. No `useEffect` fetching, no `useQuery`+`isLoading`.
- **Components:** shadcn/ui in `src/components/ui`. Design tokens are semantic
  (oklch in `src/styles.css`); **never hardcode** `text-white`, `bg-black`,
  `bg-[#...]` — use `bg-background`, `text-foreground`, etc. Support dark mode.
- **SSR:** module imports run on the server. Browser-only libs (Leaflet,
  html5-qrcode) load behind `<ClientOnly>` / `React.lazy`. Read browser storage
  in `useEffect`/`useHydrated()`, not in `useState` initializers.
- **Worker runtime:** no `child_process`, `sharp`, `canvas`, `puppeteer`,
  `fs.watch`, `os.cpus()`. Safe: `fs`, `path`, `crypto`, `Buffer`, `stream`,
  `http(s)`, `zlib`. Don't set `ssr.external`/`resolve.external` in vite config.

## 4. Database & security — non-negotiable

- Every new `public.*` table migration includes, in order: `CREATE TABLE`,
  `GRANT` (to `authenticated`/`service_role` as appropriate; `anon` only for
  truly public tables), `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY`. No grants = Data API permission errors.
- Roles live in `public.user_roles` (enum `app_role`), checked via the
  `public.has_role(_user_id, _role)` SECURITY DEFINER function. Never store
  roles on profiles/users; never check admin status client-side.
- Migrations live in `supabase/migrations/` (timestamped SQL files).
- **Never** touch schemas: `auth`, `storage`, `realtime`, `supabase_functions`,
  `vault`. No triggers on them.
- **Never** edit auto-generated files: `src/integrations/supabase/client.ts`,
  `previewAuthStorage.ts`, `client.server.ts`, `auth-middleware.ts`,
  `auth-attacher.ts`, `types.ts`, `.env`, `supabase/config.toml`.
- **Never** log/echo/return `SUPABASE_SERVICE_ROLE_KEY` or the DB password
  (unavailable on Lovable Cloud anyway).
- `check_in_ticket` is service-role-only (not PUBLIC/anon/authenticated-executable).
  `has_role` and `is_workspace_member` must stay authenticated-executable because
  RLS policies depend on them.

## 5. What's already built — don't rebuild

- Phases 2a–2f: PostGIS/location search, categories+tags, nearby-events RPC,
  recurring RRULE series, attendee capacity/waitlist/check-in, CSV export,
  invitations + reminders + announcements, iCal feed (`/api/public/ical/$token.ics`),
  virtual/hybrid formats, paid tickets + Stripe stub, QR check-in, photo gallery,
  analytics.
- Phase 3a: venue management, organizer profiles, custom event fields,
  public submission (`/submit-event`), coordinator submission review,
  email delivery (SendGrid/Postmark/Mailgun via `platform-mailer.server.ts`).
- Public calendar: `/events` (Month/Week/Day/List/Agenda/Photo/Summary views),
  `/events/$id` public detail, geo-filter (address/ZIP + radius), Leaflet map.
- Admin: `/admin` (moderation, users, setup, sponsorship, audit),
  `/admin/setup` (Stripe + email provider config, AES-256-GCM encrypted in
  `platform_config`), `/onboarding` (7-step coordinator wizard).
- Marketing: `/tour` (16 product screenshots + thumbnail).
- MCP server: 5 tools (above), OAuth consent at `/.lovable/oauth/consent`.

## 6. When Claude should NOT make a change

- Do not edit code if the same outcome is achievable through an MCP tool
  (e.g., creating an event → use `create_event`, not a code change).
- Do not regenerate or "clean up" `src/routeTree.gen.ts`,
  `src/integrations/supabase/types.ts`, or any auto-gen file.
- Do not add a competing auth flow, router, styling system, or state library.
- Do not widen RLS, drop policies, or make per-user data public to satisfy a
  convenience. If a tool returns empty under RLS, that's correct fail-closed
  behavior — escalate, don't bypass.
- If unsure whether something exists, search `src/` before creating it.
