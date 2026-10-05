import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCampaignsOnMyCalendar,
  getMyAdSettings,
  setMyAdMode,
  type AdSettings,
} from "@/lib/sponsor-campaigns.functions";
import { STATUS_LABEL } from "@/lib/sponsor-pricing";

const MODES = [
  { value: "local", label: "Local sponsors", help: "Ads aimed at your calendar or your area." },
  { value: "network", label: "Local + network-wide", help: "Also carries network-wide sponsors." },
  { value: "ad_free", label: "Ad-free", help: "No platform sponsor ads. Paid plan only." },
] as const;

/** Coordinator's choice of which platform sponsor ads run on their calendar,
 *  plus the list of sponsorships currently aimed at it. */
export function AdPolicyCard({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<AdSettings | null | undefined>(undefined);
  const [running, setRunning] = useState<Awaited<ReturnType<typeof getCampaignsOnMyCalendar>>>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getMyAdSettings().then(setS).catch(() => setS(null));
    if (!compact) getCampaignsOnMyCalendar().then(setRunning).catch(() => setRunning([]));
  };
  useEffect(load, [compact]);

  if (!s) return null;

  async function choose(mode: (typeof MODES)[number]["value"]) {
    setBusy(true);
    try {
      await setMyAdMode({ data: { mode } });
      toast.success("Ad setting saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sponsor ads on your calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => {
            const locked = m.value === "ad_free" && !s.is_paid;
            return (
              <button
                key={m.value}
                type="button"
                disabled={busy || locked}
                onClick={() => choose(m.value)}
                className={`rounded-lg border p-3 text-left text-sm transition disabled:opacity-50 ${s.ad_mode === m.value ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/50"}`}
              >
                <div className="font-semibold">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.help}</div>
              </button>
            );
          })}
        </div>
        {s.effective_mode !== s.ad_mode && (
          <p className="text-xs text-muted-foreground">
            Your paid plan has ended, so local sponsor ads are showing until you renew.
          </p>
        )}
        {!compact && (
          <div className="space-y-1 pt-2">
            <div className="text-sm font-medium">Sponsorships aimed at your calendar</div>
            {running.length === 0 ? (
              <p className="text-xs text-muted-foreground">None right now.</p>
            ) : (
              running.map((r) => (
                <div key={r.campaign_id} className="flex justify-between text-sm">
                  <span>
                    {r.business_name} <span className="text-xs capitalize text-muted-foreground">({r.scope})</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.starts_on} to {r.ends_on} · {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
