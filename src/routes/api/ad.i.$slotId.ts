import { createFileRoute } from "@tanstack/react-router";
import { PIXEL, NO_STORE, isUuid, recordAdEvent, surfaceOf } from "@/lib/ad-tracking.server";

/**
 * The impression pixel: /api/ad/i/<slot>?s=embed
 *
 * Counting happens here rather than where the ad is rendered because the embed
 * fragment is served with s-maxage=300. A view counted at render time would
 * count once per cache fill and miss everyone the CDN served in between --
 * exactly backwards, since a popular calendar caches hardest. The browser
 * fetches this per view, so the count follows the visitor rather than the
 * cache.
 *
 * No JavaScript is involved, which keeps the fragment's no-JS promise intact
 * and means the count survives on a customer's site whatever their theme does.
 */
export const Route = createFileRoute("/api/ad/i/$slotId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slotId = String(params.slotId ?? "");
        if (isUuid(slotId)) {
          // Awaited on purpose. Firing this off and returning early would be
          // faster, but on a serverless host the function can be frozen the
          // moment the response is sent, and the write would be lost for an
          // unpredictable share of views -- the kind of quiet undercount that
          // is only discovered when an advertiser disputes the numbers. The
          // cost is one round trip on a request that carries no layout.
          await recordAdEvent(
            slotId,
            "impression",
            surfaceOf(new URL(request.url)),
            request.headers,
          );
        }
        // Always a valid image, even for a bad slot id or a crawler we declined
        // to count. A broken-image icon in the middle of a customer's page is a
        // support ticket; a 1x1 that quietly counted nothing is not.
        return new Response(PIXEL, {
          status: 200,
          headers: {
            "content-type": "image/gif",
            "content-length": String(PIXEL.byteLength),
            ...NO_STORE,
            "x-robots-tag": "noindex, noimageindex",
            "access-control-allow-origin": "*",
            // Nothing here is worth a referrer, and the referrer would name the
            // customer's page.
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
