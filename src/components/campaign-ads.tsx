import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CampaignAd = {
  ad_key: string;
  business_name: string;
  logo_url: string | null;
  link_url: string | null;
  headline: string | null;
  body: string | null;
};

const safeHttps = (v: string | null) => (v && /^https:\/\//i.test(v) ? v : null);

/**
 * Platform sponsor campaigns (Phase 1b) for an event or a whole calendar.
 * What shows is decided in the database (scope, area, dates, the calendar's
 * ad policy, private/unlisted rules); this only renders it. Views and clicks
 * go through the same /api/ad endpoints as slot ads.
 */
export function CampaignAds(
  props: { eventId: string; coordinatorId?: never } | { coordinatorId: string; eventId?: never },
) {
  const [ads, setAds] = useState<CampaignAd[]>([]);
  const { eventId, coordinatorId } = props;

  useEffect(() => {
    let alive = true;
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const sb = supabase as any;
    const call = eventId
      ? sb.rpc("get_campaign_sponsors_for_event", { p_event_id: eventId, p_limit: 3 })
      : sb.rpc("get_campaign_sponsors_for_calendar", { p_coordinator_id: coordinatorId, p_limit: 3 });
    call.then(({ data }: { data: CampaignAd[] | null }) => {
      if (alive) setAds((data ?? []).slice(0, 3));
    });
    return () => {
      alive = false;
    };
  }, [eventId, coordinatorId]);

  if (ads.length === 0) return null;

  return (
    <section aria-label="Sponsors" className="mt-8 rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Megaphone className="h-4 w-4" /> Sponsored
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {ads.map((ad) => {
          const key = encodeURIComponent(ad.ad_key);
          const logo = safeHttps(ad.logo_url);
          const inner = (
            <div className="flex items-start gap-3">
              {logo && (
                <img
                  src={logo}
                  alt={`${ad.business_name} logo`}
                  className="h-12 w-12 rounded-md object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="min-w-0">
                <div className="font-semibold">{ad.business_name}</div>
                {ad.headline && <div className="text-sm">{ad.headline}</div>}
                {ad.body && <p className="mt-1 text-xs text-muted-foreground">{ad.body}</p>}
              </div>
            </div>
          );
          return (
            <div key={ad.ad_key} className="rounded-xl border bg-background p-3">
              {safeHttps(ad.link_url) ? (
                <a
                  href={`/api/ad/c/${key}?s=site`}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="block hover:opacity-90"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
              <img
                src={`/api/ad/i/${key}?s=site`}
                alt=""
                width={1}
                height={1}
                loading="lazy"
                aria-hidden="true"
                className="h-px w-px opacity-0"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
