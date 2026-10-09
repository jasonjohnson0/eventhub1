import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "@/lib/site-url";
import { listLiveCoordinators } from "@/lib/coordinator.functions";
import { fetchEvents } from "@/queries/events";

const STATIC_PATHS = [
  "/events",
  "/tour",
  "/about",
  "/organizers",
  "/submit-event",
  "/privacy",
  "/terms",
];

function urlEntry(loc: string): string {
  return `  <url><loc>${loc}</loc></url>`;
}

// Filename escapes the dot ([.]) -- see robots[.]txt.ts for why.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [coordinators, events] = await Promise.all([
          listLiveCoordinators(),
          // Only what's still relevant to list -- events already over don't
          // need a crawl budget spent on them.
          fetchEvents({ from: new Date().toISOString(), limit: 500 }).catch(() => []),
        ]);

        const urls = [
          ...STATIC_PATHS.map((p) => urlEntry(siteUrl(p))),
          ...coordinators.map((c) => urlEntry(siteUrl(`/c/${encodeURIComponent(c.slug)}`))),
          ...events.map((e) => urlEntry(siteUrl(`/events/${e.id}`))),
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
