import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCoordinatorProfile,
  saveCoordinatorProfile,
  type CoordinatorProfile,
} from "@/lib/onboarding.functions";
import {
  HOLIDAY_GROUP_ORDER,
  HOLIDAY_GROUPS,
  HOLIDAY_ORDER,
  HOLIDAY_THEMES,
  type HolidayGroup,
  type HolidayId,
} from "@/lib/holiday-themes";
import {
  HOLIDAY_DATE_RULES,
  formatOccurrence,
  upcomingHolidays,
  type Upcoming,
} from "@/lib/holiday-dates";
import { findPresetByColor, presetsByHoliday, type OrganizerPreset } from "@/lib/organizer-presets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** How many holidays the "Coming up" tab shows. */
const UPCOMING_COUNT = 4;

/**
 * Lets a coordinator pick a holiday look for their own public calendar
 * (`/c/$slug` and the embed) without writing any CSS. Under the hood this is
 * just `primary_color` + `secondary_color` -- fields onboarding's branding
 * step already sets -- so every existing render path (the calendar header's
 * accent bar and two-tone wash, the logo-less badge, `--ehx-brand` /
 * `--ehx-brand2` in the embed) picks it up with no further changes, and the
 * embed ends up looking like the real calendar because they read the same
 * two colors.
 *
 * With a few dozen holidays and a theme per month, the list is split into
 * tabs by group, each holiday shows when it next falls, and a "Coming up" tab
 * (the default) puts the next few by date first.
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

  // Only computed once the profile has loaded (i.e. on the client), so
  // "today" is the coordinator's own day, never the server's.
  const upcoming = useMemo(
    () => (loading ? [] : upcomingHolidays(new Date(), HOLIDAY_ORDER.filter((id) => id !== "autumn"))),
    [loading],
  );
  const upcomingById = useMemo(() => new Map(upcoming.map((u) => [u.id, u])), [upcoming]);
  // The soonest holiday in each group, flagged "Next up" in that group's tab.
  const nextInGroup = useMemo(() => {
    const out: Partial<Record<HolidayGroup, HolidayId>> = {};
    for (const u of upcoming) out[HOLIDAY_THEMES[u.id].group] ??= u.id;
    return out;
  }, [upcoming]);

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

  function whenBadge(u: Upcoming | undefined) {
    if (!u) return null;
    const text = u.active ? "Now" : u.daysAway === 1 ? "Tomorrow" : `In ${u.daysAway} days`;
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          u.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
        }`}
      >
        {text}
      </span>
    );
  }

  function section(holiday: HolidayId, opts: { nextUp?: boolean } = {}) {
    const theme = HOLIDAY_THEMES[holiday];
    const presets = grouped[holiday] ?? [];
    const u = upcomingById.get(holiday);
    const rule = HOLIDAY_DATE_RULES[holiday].rule;
    return (
      <section key={holiday} data-holiday={holiday} className="rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden>{theme.menuEmoji}</span> {theme.label}
              {opts.nextUp && (
                <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                  Next up
                </span>
              )}
            </h3>
            {theme.observance && theme.observance !== theme.label && (
              <p className="mt-0.5 text-xs text-muted-foreground">{theme.observance}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-right">
            <div>
              <p className="text-sm font-medium">{u ? formatOccurrence(u) : rule}</p>
              {u && <p className="text-xs text-muted-foreground">{rule}</p>}
            </div>
            {whenBadge(u)}
          </div>
        </div>
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
                aria-pressed={isActive}
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
      </section>
    );
  }

  const activeTheme = activePreset ? HOLIDAY_THEMES[activePreset.holiday] : null;

  return (
    <div className="space-y-6">
      {activePreset && activeTheme && (
        <p className="text-sm text-muted-foreground">
          Currently using{" "}
          <span className="font-medium text-foreground">
            {activePreset.emoji} {activePreset.label}
          </span>{" "}
          ({activeTheme.label}).
        </p>
      )}

      <Tabs defaultValue="upcoming">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="upcoming">Coming up</TabsTrigger>
          {HOLIDAY_GROUPS.map((g) => (
            <TabsTrigger key={g.id} value={g.id} className="gap-1.5">
              {g.label}
              {activeTheme?.group === g.id && (
                <Check className="h-3.5 w-3.5" aria-label="(current look is in here)" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="upcoming" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            The next few holidays and observances by date. Every one is also listed under its group.
          </p>
          {upcoming.slice(0, UPCOMING_COUNT).map((u) => section(u.id))}
        </TabsContent>

        {HOLIDAY_GROUPS.map((g) => (
          <TabsContent key={g.id} value={g.id} className="mt-4 space-y-4">
            {g.id === "monthly" && (
              <p className="text-sm text-muted-foreground">
                One look per month, each built around a nationally recognized observance for that
                month.
              </p>
            )}
            {HOLIDAY_GROUP_ORDER[g.id].map((id) => section(id, { nextUp: nextInGroup[g.id] === id }))}
          </TabsContent>
        ))}
      </Tabs>

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
          Want a specific color, or your own CSS, instead? Set it directly in{" "}
          <a href="/coordinator/settings/branding" className="underline underline-offset-2">
            Branding
          </a>
          .
        </p>
      </div>
    </div>
  );
}
