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
  if (isEmbeddablePath(pathname)) return response;
  // Not an in-place response.headers.set(): a Response.redirect() response
  // (used by the ad-click endpoint's fallback path) has immutable headers in
  // this runtime, and mutating it threw -- silently turning a redirect into
  // a generic 500 for exactly the malformed-input case that redirect exists
  // to handle safely. Building a fresh Response sidesteps that regardless of
  // how the original one was constructed.
  const headers = new Headers(response.headers);
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set(
    "content-security-policy",
    "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev",
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
