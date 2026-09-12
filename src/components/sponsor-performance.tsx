import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSponsorAdStats, type AdStatRow } from "@/lib/ad-stats.functions";
import { BarChart3, Globe } from "lucide-react";

const nf = new Intl.NumberFormat();

/** Clicks per unique viewer, as a percentage. Uniques rather than raw views,
 *  because a rate computed over inflated views reads suspiciously low and
 *  invites exactly the argument a coordinator does not want at renewal. */
function ctr(row: AdStatRow): string {
  if (row.unique_viewers === 0) return "—";
  return `${((row.unique_clickers / row.unique_viewers) * 100).toFixed(1)}%`;
}

/**
 * What a coordinator shows an advertiser when the sponsorship comes up for
 * renewal. Totals and unique counts sit side by side on purpose: the honest
 * number is the one that keeps the renewal, so it is not buried.
 */
export function SponsorPerformance({ days = 30 }: { days?: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sponsor-ad-stats", days],
    queryFn: () => getSponsorAdStats({ data: { days } }),
    staleTime: 5 * 60 * 1000,
  });

  const rows = data ?? [];
  const totals = rows.reduce(
    (a, r) => ({
      views: a.views + r.views,
      uniques: a.uniques + r.unique_viewers,
      clicks: a.clicks + r.clicks,
      embeds: a.embeds + r.views_on_embeds,
    }),
    { views: 0, uniques: 0, clicks: 0, embeds: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5" />
          Sponsor performance
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            last {days} days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Could not load sponsor statistics. {(error as Error).message}
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">No sponsorships sold yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once a sponsor buys a slot on one of your events, their views and clicks are counted
              here — including on calendars embedded on other websites.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="People reached" value={nf.format(totals.uniques)} emphasis />
              <Stat label="Total views" value={nf.format(totals.views)} />
              <Stat label="Clicks" value={nf.format(totals.clicks)} />
              <Stat
                label="Views on embeds"
                value={nf.format(totals.embeds)}
                hint="Seen on websites that embed your calendar"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Sponsor</th>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 text-right font-medium">Reached</th>
                    <th className="py-2 pr-3 text-right font-medium">Views</th>
                    <th className="py-2 pr-3 text-right font-medium">Clicks</th>
                    <th className="py-2 text-right font-medium">Click rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.slot_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.business_name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.event_title}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {nf.format(r.unique_viewers)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {nf.format(r.views)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{nf.format(r.clicks)}</td>
                      <td className="py-2 text-right tabular-nums">{ctr(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                “Reached” counts each person once a day; “views” counts every time an ad was shown.
                A view is only counted when the ad actually reaches the visitor's screen, and
                crawlers and link previews are excluded — so these are numbers an advertiser can
                check against their own analytics.
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className={`tabular-nums ${emphasis ? "text-2xl font-bold" : "text-xl font-semibold"}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}
