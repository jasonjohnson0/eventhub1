# Deploying EventHub to Vercel

The app is TanStack Start on Nitro. Nitro emits Vercel's Build Output API v3
(`.vercel/output`), so Vercel serves it directly with no adapter.

`vercel.json` pins two things that Vercel would otherwise guess wrong:

- `"framework": null` — `vite` is in the dependency list, so Vercel would
  auto-detect a plain Vite SPA and look for `dist/`. There is a server; that
  detection would ship a broken static build.
- `"installCommand": "npm install"` — the repo carries both `bun.lock` and
  `package-lock.json`, and which one Vercel picks is not something to leave to
  chance.

The build command sets `NITRO_PRESET=vercel` explicitly. Nitro would also detect
Vercel from the `VERCEL` environment variable, but naming the preset means the
build does the same thing whether it runs on Vercel, locally, or in CI.

## This does not affect Lovable

`vite.config.ts` is untouched. The Lovable sandbox forces the Cloudflare preset
regardless of configuration, so Lovable keeps building and deploying as before.
The two targets coexist; `NITRO_PRESET` is what separates them.

## Environment variables

Set these in Vercel under **Settings → Environment Variables**, for Production
and Preview.

### Build time — baked into the browser bundle

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | `https://fopxmuaogwchohwhrclk.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key. Public by design. |
| `VITE_SUPABASE_PROJECT_ID` | `fopxmuaogwchohwhrclk`. Present in `.env` but not read anywhere in `src/`; set it for parity. |

These are compiled into JavaScript the browser downloads. Never put a secret
behind a `VITE_` prefix.

### Runtime — server only

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Same URL as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret.** Bypasses every RLS policy. Mark it sensitive in Vercel. |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Server-side fallback used by `client.ts`. |
| `PUBLIC_SITE_URL` | yes | Your Vercel URL or custom domain, no trailing slash. |
| `PLATFORM_CONFIG_ENC_KEY` | yes | **Secret. Copy the existing value — do not generate a new one.** See below. |
| `STRIPE_SECRET_KEY` | optional | **Secret.** Only gates Stripe Connect setup; the app runs without it. |

Only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are in the committed `.env`.
`SUPABASE_SERVICE_ROLE_KEY` comes from the Supabase dashboard under
**Project Settings → API**. `PLATFORM_CONFIG_ENC_KEY` and `STRIPE_SECRET_KEY`
live in the Lovable environment and have to be copied from there.

### Two variables that fail quietly

**`PLATFORM_CONFIG_ENC_KEY` must match the value Lovable already uses.**
`platform-config.server.ts` derives an AES-256-GCM key from it and uses that to
encrypt secrets stored in the `platform_config` table — the email provider API
key among them. Vercel and Lovable point at the same database, so a different
key here does not start fresh; it fails to decrypt rows that are already there,
and admin setup pages break with "Malformed encrypted value" or an
authentication-tag error. Copy the existing value.

**`PUBLIC_SITE_URL` is easy to forget.** `communications.functions.ts` falls
back to `https://sparkle-calendar-co.lovable.app`, so without it your outbound
emails and invite links keep pointing at the Lovable domain while the site
itself runs on Vercel. Nothing errors; the links are just wrong.

## Deploying

From the repository root:

```bash
vercel link          # once, to attach the directory to a Vercel project
vercel               # preview deployment
vercel --prod        # production
```

`vercel` builds on Vercel's infrastructure. To build locally and upload the
result instead:

```bash
NITRO_PRESET=vercel npm run build
vercel deploy --prebuilt
```

`.vercel/` is gitignored — it holds both the build output and the local
project link Vercel CLI writes.

## After the first deploy

**Add the new origin to Supabase Auth.** Under **Authentication → URL
Configuration**, add the Vercel domain to Site URL and Redirect URLs. The
`/auth/callback` route will fail on the new domain until you do, so sign-in
breaks even though the rest of the site works.

**Check `PUBLIC_SITE_URL` took effect** by triggering anything that sends a link
and confirming the domain in it.

## Verified

- `NITRO_PRESET=vercel npm run build` produces `.vercel/output` with Build
  Output API v3, `nodejs22.x`, immutable caching on `/assets/*`, filesystem
  handling, and an SSR fallback to `/__server`.
- The generated server bundle imports cleanly under Node with only the Supabase
  variables set.
