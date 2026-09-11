import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Megaphone, ExternalLink } from "lucide-react";
import {
  listEventSponsors,
  upsertSponsorCreative,
  type SponsorSlotRow,
} from "@/lib/sponsors.functions";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function CreativeForm({ slot, onSaved }: { slot: SponsorSlotRow; onSaved: () => void }) {
  const c = slot.creative;
  // external_name is what was recorded at sale time, so it is the most likely
  // business name and saves the coordinator retyping it.
  const [businessName, setBusinessName] = useState(c?.business_name ?? slot.external_name ?? "");
  const [logoUrl, setLogoUrl] = useState(c?.logo_url ?? "");
  const [linkUrl, setLinkUrl] = useState(c?.link_url ?? "");
  const [headline, setHeadline] = useState(c?.headline ?? "");
  const [body, setBody] = useState(c?.body ?? "");
  const [saving, setSaving] = useState(false);

  const badUrl = (v: string) => v.trim() !== "" && !/^https:\/\//i.test(v.trim());
  const logoBad = badUrl(logoUrl);
  const linkBad = badUrl(linkUrl);
  const canSave = businessName.trim().length > 0 && !logoBad && !linkBad && !saving;

  async function save() {
    if (!slot.sponsor_id) return;
    setSaving(true);
    try {
      await upsertSponsorCreative({
        data: {
          sponsor_id: slot.sponsor_id,
          business_name: businessName.trim(),
          logo_url: logoUrl.trim(),
          link_url: linkUrl.trim(),
          headline: headline.trim(),
          body: body.trim(),
        },
      });
      toast.success("Ad saved — it is live on the event page");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the ad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <Field label="Business name">
        <Input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          maxLength={120}
          placeholder="Riverside Auto"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Logo URL" hint="https:// only">
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
            aria-invalid={logoBad}
            className={logoBad ? "border-destructive" : undefined}
          />
        </Field>
        <Field label="Click-through URL" hint="https:// only">
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://advertiser.example"
            aria-invalid={linkBad}
            className={linkBad ? "border-destructive" : undefined}
          />
        </Field>
      </div>

      {(logoBad || linkBad) && (
        <p className="text-xs text-destructive">
          URLs must start with https://. This ad renders on other people's websites, so
          insecure and script URLs are rejected.
        </p>
      )}

      <Field label="Headline">
        <Input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={120}
          placeholder="Free brake check this month"
        />
      </Field>

      <Field label="Body">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={400}
          rows={2}
          placeholder="Mention the festival and save 20% on any service."
        />
      </Field>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{body.length}/400</span>
        <Button size="sm" onClick={save} disabled={!canSave}>
          {saving ? "Saving…" : slot.creative ? "Update ad" : "Publish ad"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Lets the coordinator (or the advertiser who bought the slot) enter what a
 * paid sponsorship actually shows. Without this, sponsor_creatives can only be
 * populated by hand in SQL, so an advertiser can pay and still display the
 * generic placeholder.
 */
export function SponsorCreativeEditor({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<SponsorSlotRow[] | null>(null);
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  const load = () => {
    listEventSponsors({ data: { eventId } })
      .then(setRows)
      .catch(() => setRows([]));
  };
  useEffect(load, [eventId]);

  if (rows === null) return <p className="text-sm text-muted-foreground">Loading slots…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No slots configured for this event.</p>;

  return (
    <div className="space-y-3">
      {rows.map((slot) => {
        const sold = slot.status === "paid";
        const open = openSlot === slot.slot_id;
        return (
          <div key={slot.slot_id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <Megaphone className="h-4 w-4 text-amber-500" />
                  Ad #{slot.position}
                  <Badge variant="outline" className="capitalize">
                    {slot.slot_type}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {sold ? (
                    slot.creative ? (
                      <span className="inline-flex items-center gap-1">
                        Running as “{slot.creative.business_name}”
                        {slot.creative.link_url && <ExternalLink className="h-3 w-3" />}
                      </span>
                    ) : (
                      // The state that matters: money taken, nothing to show.
                      <span className="font-semibold text-amber-700">
                        Paid — but no ad entered yet, so it shows a placeholder
                      </span>
                    )
                  ) : (
                    <span className="capitalize">{slot.status}</span>
                  )}
                </div>
              </div>

              {sold && (
                <Button
                  size="sm"
                  variant={slot.creative ? "outline" : "default"}
                  onClick={() => setOpenSlot(open ? null : slot.slot_id)}
                >
                  {open ? "Close" : slot.creative ? "Edit ad" : "Add the ad"}
                </Button>
              )}
            </div>

            {sold && open && (
              <div className="mt-3">
                <CreativeForm
                  slot={slot}
                  onSaved={() => {
                    setOpenSlot(null);
                    load();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
