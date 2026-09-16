import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCoordinatorProfile,
  saveCoordinatorProfile,
  type CoordinatorProfile,
} from "@/lib/onboarding.functions";

const DEFAULT_PRIMARY = "#f97316";
const DEFAULT_SECONDARY = "#06b6d4";

/**
 * Post-launch home for a coordinator's brand colors and custom CSS.
 *
 * Onboarding's Branding step only runs once, before a calendar goes live
 * (`/onboarding` redirects a live coordinator straight to `/dashboard` --
 * see its `beforeLoad`), so there was previously no way to revisit colors
 * afterward except the holiday presets. This is that page: the same
 * primary/secondary color fields onboarding sets, plus an Advanced section
 * for CSS presets can't express. Both write straight to `coordinator_profiles`
 * via `saveCoordinatorProfile`, the same call onboarding and the holiday
 * preset picker already use, so every existing render path (`/c/$slug`, the
 * embed) picks them up with no further changes.
 */
export function BrandingSettings() {
  const [profile, setProfile] = useState<CoordinatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);
  const [customCss, setCustomCss] = useState("");

  useEffect(() => {
    getCoordinatorProfile()
      .then((p) => {
        setProfile(p);
        setPrimary(p.primary_color || DEFAULT_PRIMARY);
        setSecondary(p.secondary_color || DEFAULT_SECONDARY);
        setCustomCss(p.custom_css ?? "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your branding"))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Partial<CoordinatorProfile>) {
    setSaving(true);
    try {
      const updated = await saveCoordinatorProfile({ data: patch as never });
      setProfile(updated);
      setPrimary(updated.primary_color || DEFAULT_PRIMARY);
      setSecondary(updated.secondary_color || DEFAULT_SECONDARY);
      setCustomCss(updated.custom_css ?? "");
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const useDefaultLook = () => save({ primary_color: DEFAULT_PRIMARY, secondary_color: DEFAULT_SECONDARY });
  const isDefault = primary === DEFAULT_PRIMARY && secondary === DEFAULT_SECONDARY;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your branding…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Primary color" value={primary} onChange={setPrimary} />
            <ColorField label="Secondary color" value={secondary} onChange={setSecondary} />
          </div>
          <div
            className="rounded-xl p-6 text-center text-white shadow"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
          >
            <p className="text-sm opacity-90">Preview</p>
            <p className="text-xl font-bold">{profile?.company_name || "Your community calendar"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => save({ primary_color: primary, secondary_color: secondary })}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save colors
            </Button>
            <Button variant="ghost" onClick={useDefaultLook} disabled={saving || isDefault}>
              Use default look
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advanced: Custom CSS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            For anything colors and presets can't express -- a font, a border radius, spacing.
            Applies to your public calendar and your embed, after your theme colors, so it can
            override them. Scripts, <code>@import</code>, and anything that could load external
            code are stripped automatically.
          </p>
          <Label htmlFor="custom-css">CSS</Label>
          <Textarea
            id="custom-css"
            rows={10}
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            placeholder=".ehx-bar { font-family: Georgia, serif; }"
            className="font-mono text-xs"
          />
          <Button onClick={() => save({ custom_css: customCss })} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save custom CSS
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border bg-background"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </div>
  );
}
