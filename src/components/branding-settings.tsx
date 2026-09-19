import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getCoordinatorProfile,
  saveCoordinatorProfile,
  type CoordinatorProfile,
} from "@/lib/onboarding.functions";
import {
  activateHeaderImage,
  deleteHeaderImage,
  getBrandingStorageUsage,
  BRANDING_PER_FILE_CAP_BYTES,
  BRANDING_TOTAL_QUOTA_BYTES,
  type BrandingHeaderImage,
} from "@/lib/branding-storage.functions";

const DEFAULT_PRIMARY = "#f97316";
const DEFAULT_SECONDARY = "#06b6d4";

function fmtMb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [usedBytes, setUsedBytes] = useState(0);
  const [headerImages, setHeaderImages] = useState<BrandingHeaderImage[]>([]);
  const [headerBusy, setHeaderBusy] = useState<string | null>(null); // "uploading" | a path being acted on

  const refreshUsage = () =>
    getBrandingStorageUsage().then((u) => {
      setUsedBytes(u.used_bytes);
      setHeaderImages(u.header_images);
    });

  useEffect(() => {
    getCoordinatorProfile()
      .then((p) => {
        setProfile(p);
        setPrimary(p.primary_color || DEFAULT_PRIMARY);
        setSecondary(p.secondary_color || DEFAULT_SECONDARY);
        setCustomCss(p.custom_css ?? "");
        setHeaderImageUrl(p.header_image_url ?? null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your branding"))
      .finally(() => setLoading(false));
    refreshUsage().catch(() => {
      // Non-fatal -- the rest of the page (colors, CSS) still works without
      // usage numbers; the upload button itself will surface a real error
      // if something's actually wrong when they try it.
    });
  }, []);

  async function uploadHeaderImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > BRANDING_PER_FILE_CAP_BYTES) {
      toast.error(`That file is ${fmtMb(file.size)} -- header images are capped at 2 MB each`);
      return;
    }
    if (usedBytes + file.size > BRANDING_TOTAL_QUOTA_BYTES) {
      toast.error(
        `That would put you over your 12 MB storage budget (${fmtMb(usedBytes)} already used). Delete an old image first.`,
      );
      return;
    }
    setHeaderBusy("uploading");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${uid}/header-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("branding").upload(path, file);
      if (error) throw error;
      const { url } = await activateHeaderImage({ data: { path } });
      setHeaderImageUrl(url);
      await refreshUsage();
      toast.success("Header image uploaded and set live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload that image");
    } finally {
      setHeaderBusy(null);
    }
  }

  async function activateExisting(img: BrandingHeaderImage) {
    setHeaderBusy(img.path);
    try {
      const { url } = await activateHeaderImage({ data: { path: img.path } });
      setHeaderImageUrl(url);
      toast.success("Header image updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch to that image");
    } finally {
      setHeaderBusy(null);
    }
  }

  async function removeExisting(img: BrandingHeaderImage) {
    setHeaderBusy(img.path);
    try {
      await deleteHeaderImage({ data: { path: img.path } });
      if (headerImageUrl && (headerImageUrl.includes(img.path) || img.url === headerImageUrl)) {
        setHeaderImageUrl(null);
      }
      await refreshUsage();
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that image");
    } finally {
      setHeaderBusy(null);
    }
  }

  async function clearActiveHeader() {
    setSaving(true);
    try {
      const updated = await saveCoordinatorProfile({ data: { header_image_url: "" } as never });
      setHeaderImageUrl(updated.header_image_url ?? null);
      toast.success("Back to your color gradient");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

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
          <CardTitle className="text-base">Header background image</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Shown behind your calendar's header on your public page ({`eventhub.app/c/${profile?.slug ?? "your-slug"}`}).
            Not shown in the embed widget -- that's a deliberately compact strip meant to sit
            quietly inside someone else's page, not carry a full banner photo.
            Best at 1920×480 (a wide 4:1 banner) -- anything else is cropped to fit.
            2 MB per image, 12 MB total across everything in your branding storage (logo,
            favicon, and header images together).
          </p>
          <div
            className="aspect-[4/1] w-full overflow-hidden rounded-lg border bg-cover bg-center"
            style={
              headerImageUrl
                ? { backgroundImage: `url(${headerImageUrl})` }
                : { background: `linear-gradient(135deg, ${primary}, ${secondary})` }
            }
          >
            {!headerImageUrl && (
              <div className="flex h-full items-center justify-center text-sm text-white/80">
                No header image set -- using your color gradient
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="header-upload" className="cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                {headerBusy === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload image
              </span>
            </Label>
            <input
              id="header-upload"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={headerBusy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadHeaderImage(file);
              }}
            />
            {headerImageUrl && (
              <Button variant="ghost" size="sm" onClick={clearActiveHeader} disabled={saving}>
                Remove (use color gradient instead)
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {fmtMb(usedBytes)} of {fmtMb(BRANDING_TOTAL_QUOTA_BYTES)} used
            </span>
          </div>

          {headerImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your uploaded images
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {headerImages.map((img) => {
                  const isActive = !!headerImageUrl && headerImageUrl.includes(img.path);
                  return (
                    <div key={img.path} className="flex items-center gap-2 rounded-lg border p-2">
                      <div
                        className="h-10 w-16 shrink-0 rounded bg-cover bg-center"
                        style={{ backgroundImage: `url(${img.url})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {isActive ? "Currently active" : fmtMb(img.size_bytes)}
                        </p>
                      </div>
                      {!isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => activateExisting(img)}
                          disabled={headerBusy !== null}
                        >
                          {headerBusy === img.path ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Use this"
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExisting(img)}
                        disabled={headerBusy !== null}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
