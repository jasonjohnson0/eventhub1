import { createFileRoute } from "@tanstack/react-router";
import { jsonOk } from "@/lib/api-auth.server";

/** Unauthenticated index -- spec 09's "docs: GET /api/v1 returns a short
 *  index". No API key needed to see what's here; every listed resource
 *  needs one to actually call. */
export const Route = createFileRoute("/api/v1/")({
  // trailing slash on the path string marks this as the index route for the
  // /api/v1 directory (matches the same convention already used by
  // _authenticated/admin.index.tsx -> "/_authenticated/admin/").
  server: {
    handlers: {
      GET: async () =>
        jsonOk({
          name: "EventHub REST API",
          version: "v1",
          note: "Server-to-server API for a coordinator's own automations (Zapier/Make/curl). Not the same thing as /mcp, which is OAuth-scoped agent tooling for signed-in users.",
          auth: "Authorization: Bearer eh_live_<key> -- create a key under Settings -> API keys.",
          rate_limit: "60 requests/minute/key. A 429 includes a Retry-After header.",
          resources: [
            "GET/POST /api/v1/events",
            "GET/PATCH/DELETE /api/v1/events/:id",
            "GET/POST /api/v1/events/:id/tickets",
            "DELETE /api/v1/events/:id/tickets/:ticketId",
            "GET /api/v1/events/:id/rsvps",
            "GET/POST /api/v1/venues",
            "GET/PATCH/DELETE /api/v1/venues/:id",
            "GET /api/v1/me",
          ],
        }),
    },
  },
});
