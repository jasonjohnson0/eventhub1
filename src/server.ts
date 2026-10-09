import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Nothing in this app set X-Frame-Options or a frame-ancestors CSP anywhere,
// on any route, before this -- which meant a signed-in coordinator's own
// dashboard, settings or event-management pages could be framed by any site
// on the internet, the classic setup for a clickjacking attack (an invisible
// iframe of an authenticated page under a fake "click here" overlay).
//
// The embed feature needs the opposite for exactly two path prefixes --
// /c/$slug and /api/embed/$slug are the whole point of being frameable by a
// customer's own site -- so this is applied per-request rather than as one
// blanket header.
function isEmbeddablePath(pathname: string): boolean {
  return pathname.startsWith("/c/") || pathname.startsWith("/api/embed/");
}

// frame-ancestors has no effect from a <meta> tag -- CSP requires it as a
// real response header -- so it has to be applied here, the one place every
// response already passes through. Lovable's own editor renders this app's
// live preview inside an iframe on its own domain, which has to stay allowed
// everywhere or the in-editor preview breaks; X-Frame-Options is included
// alongside CSP for older browsers that don't honor frame-ancestors.
function applyFrameProtection(request: Request, response: Response): Response {
  const { pathname } = new URL(request.url);
  const embeddable = isEmbeddablePath(pathname);
  // Not an in-place response.headers.set(): a Response.redirect() response
  // (used by the ad-click endpoint's fallback path) has immutable headers in
  // this runtime, and mutating it threw -- silently turning a redirect into
  // a generic 500 for exactly the malformed-input case that redirect exists
  // to handle safely. Building a fresh Response sidesteps that regardless of
  // how the original one was constructed.
  const headers = new Headers(response.headers);
  // HTTPS-only is already true in production (Vercel); this just tells the
  // browser to enforce it itself, including on the very first request, so a
  // stale http:// link or bookmark can't be downgraded to plaintext. Applies
  // everywhere, including embeddable paths -- it has nothing to do with
  // framing.
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  if (embeddable) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  headers.set("x-frame-options", "SAMEORIGIN");
  // script-src/style-src need 'unsafe-inline': TanStack Start's own SSR
  // streaming/hydration markup ships as inline <script> tags with no nonce
  // wired up, and plenty of components set inline style="" (brand colors,
  // custom CSS). Everything else here is a real restriction that wasn't
  // there before -- no third-party script host, no plugins/objects, no
  // cross-origin form posts, no framing beyond the one editor-preview
  // exception this app already depends on.
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // The public calendar spins up a blob: worker (verified against a
      // real browser load of /events) -- script-src's fallback for
      // worker-src blocked it until this was split out explicitly.
      "worker-src 'self' blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://lovable.dev https://*.lovable.dev",
      "frame-src 'self' https://lovable.dev https://*.lovable.dev",
      "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applyFrameProtection(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return applyFrameProtection(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
