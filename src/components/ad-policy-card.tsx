import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getCampaignsOnMyCalendar,
  getMyAdSettings,
  setMyAdFlags,
  type AdSettings,
} from "@/lib/sponsor-campaigns.functions";
import { STATUS_LABEL } from "@/lib/sponsor-pricing";

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

  const [local, setLocal] = useState(true);
  const [network, setNetwork] = useState(false);
  useEffect(() => {
    if (s) {
      setLocal(s.ads_local);
      setNetwork(s.ads_network);
    }
  }, [s]);

  if (!s) return null;

  const neither = !local && !network;
  const invalid = neither && !s.is_paid;
  const dirty = local !== s.ads_local || network !== s.ads_network;

  async function save() {
    if (invalid) return;
    setBusy(true);
    try {
      await setMyAdFlags({ data: { local, network } });
      toast.success("Ad setting saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const lapsed = !s.ads_local && !s.ads_network && (s.effective_local || s.effective_network);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sponsor ads on your calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={local} onCheckedChange={(v) => setLocal(v === true)} disabled={busy} />
          <span>
            <span className="font-medium">Local sponsors</span>
            <span className="block text-xs text-muted-foreground">Businesses sponsoring your area by ZIP code.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={network} onCheckedChange={(v) => setNetwork(v === true)} disabled={busy} />
          <span>
            <span className="font-medium">Network-wide sponsors</span>
            <span className="block text-xs text-muted-foreground">Sponsors running across every calendar.</span>
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          Sponsors who pick your calendar by name always show.
          {s.is_paid ? " On the paid plan you can untick both to go ad-free." : " Untick both to go ad-free on the paid plan."}
        </p>
        {invalid && (
          <p className="text-xs text-destructive">Free calendars need at least one of these ticked.</p>
        )}
        {neither && s.is_paid && <p className="text-xs">Ad-free: no local or network-wide ads will show.</p>}
        {lapsed && (
          <p className="text-xs text-muted-foreground">
            Your paid plan has ended, so your last ad setting is showing until you renew.
          </p>
        )}
        <Button size="sm" onClick={save} disabled={busy || invalid || !dirty}>
          Save ad setting
        </Button>
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
