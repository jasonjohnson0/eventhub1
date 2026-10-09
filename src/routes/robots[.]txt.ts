import { createFileRoute } from "@tanstack/react-router";
import { siteOrigin } from "@/lib/site-url";

// Filename escapes the dot ([.]) so the router treats "robots.txt" as one
// literal path segment instead of splitting it into /robots/txt -- same
// convention already used by [.]lovable.oauth.consent.tsx in this repo.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = siteOrigin();
        const body = [
          "User-agent: *",
          "Allow: /",
          // Nothing behind /auth, onboarding, or the authenticated app shell
          // is meant to be indexed -- it's either a dead end for a crawler
          // (a login wall) or per-coordinator admin tooling.
          "Disallow: /auth",
          "Disallow: /onboarding",
          "Disallow: /setup",
          "Disallow: /dashboard",
          "Disallow: /admin",
          ...(origin ? [`Sitemap: ${origin}/sitemap.xml`] : []),
          "",
        ].join("\n");
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
