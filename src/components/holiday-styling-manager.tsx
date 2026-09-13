import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCoordinatorProfile,
  saveCoordinatorProfile,
  type CoordinatorProfile,
} from "@/lib/onboarding.functions";
import { HOLIDAY_ORDER, HOLIDAY_THEMES } from "@/lib/holiday-themes";
import { findPresetByColor, presetsByHoliday, type OrganizerPreset } from "@/lib/organizer-presets";

/**
 * Lets a coordinator pick a holiday look for their own public calendar
 * (`/c/$slug` and the embed) without writing any CSS. Under the hood this is
 * just `primary_color` + `secondary_color` -- fields onboarding's branding
 * step already sets -- so every existing render path (the calendar header's
 * accent bar and two-tone wash, the logo-less badge, `--ehx-brand` /
 * `--ehx-brand2` in the embed) picks it up with no further changes, and the
 * embed ends up looking like the real calendar because they read the same
 * two colors.
 */
export function HolidayStylingManager() {
  const [profile, setProfile] = useState<CoordinatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    getCoordinatorProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  const activePreset = findPresetByColor(profile?.primary_color);
  const grouped = presetsByHoliday();

  async function apply(preset: OrganizerPreset) {
    setSavingId(preset.id);
    try {
      const updated = await saveCoordinatorProfile({
        data: { primary_color: preset.hex, secondary_color: preset.secondaryHex },
      });
      setProfile(updated);
      toast.success(`Calendar styled: ${preset.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingId(null);
    }
  }

  async function clear() {
    setSavingId("__default");
    try {
      const updated = await saveCoordinatorProfile({
        data: { primary_color: "#f97316", secondary_color: "#06b6d4" },
      });
      setProfile(updated);
      toast.success("Back to the default look");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your calendar's styling…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {HOLIDAY_ORDER.map((holiday) => {
        const theme = HOLIDAY_THEMES[holiday];
        const presets = grouped[holiday];
        return (
          <div key={holiday}>
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <span>{theme.menuEmoji}</span> {theme.label}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {presets.map((preset) => {
                const isActive = activePreset?.id === preset.id;
                const isSaving = savingId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isSaving}
                    onClick={() => apply(preset)}
                    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-colors disabled:opacity-60 ${
                      isActive ? "border-foreground" : "border-border hover:border-foreground/40"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full text-xl text-white shadow-inner"
                      style={{
                        background: `linear-gradient(135deg, ${preset.hex}, ${preset.secondaryHex})`,
                      }}
                    >
                      {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : preset.emoji}
                    </span>
                    <span className="text-sm font-medium">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="border-t pt-6">
        <button
          type="button"
          disabled={savingId === "__default"}
          onClick={clear}
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
        >
          {activePreset ? "Reset to the default look" : "Currently using the default look"}
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          Want a specific color instead? Set it directly in{" "}
          <a href="/onboarding" className="underline underline-offset-2">
            your branding settings
          </a>
          .
        </p>
      </div>
    </div>
  );
}
