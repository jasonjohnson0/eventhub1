import { createFileRoute } from "@tanstack/react-router";
import {
  NO_STORE,
  adDestination,
  isUuid,
  recordAdEvent,
  surfaceOf,
} from "@/lib/ad-tracking.server";
import { siteOrigin } from "@/lib/site-url";

/**
 * The click redirect: /api/ad/c/<slot>?s=embed
 *
 * The destination is looked up from the slot, never read from the query string.
 * A /api/ad/c/<slot>?to=<url> design would be an open redirect wearing our
 * domain, which is precisely what makes it valuable to a phisher -- the link
 * passes a glance because the first half is ours.
 *
 * A click that cannot be counted is still forwarded. The advertiser bought
 * traffic, not telemetry.
 */
export const Route = createFileRoute("/api/ad/c/$slotId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slotId = String(params.slotId ?? "");
        const url = new URL(request.url);

        const fallback = `${siteOrigin() || url.origin}/events`;
        if (!isUuid(slotId)) {
          return Response.redirect(fallback, 302);
        }

        const [destination] = await Promise.all([
          adDestination(slotId),
          recordAdEvent(slotId, "click", surfaceOf(url), request.headers),
        ]);

        // No destination means the campaign ended, the slot was never paid, or
        // the advertiser left the link blank. Someone clicking a stale ad in a
        // cached fragment gets the events listing rather than an error page --
        // they were looking for something to do, and we have a page full of it.
        return new Response(null, {
          status: 302,
          headers: {
            location: destination ?? fallback,
            ...NO_STORE,
            // Do not tell the advertiser which customer's page the click came
            // from; that is the coordinator's commercial relationship to
            // disclose, not ours to leak in a header.
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
