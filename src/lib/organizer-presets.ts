/**
 * Curated holiday styling presets an organizer can pick for their own public
 * calendar (`/c/$slug` and the embed), one click, no CSS required.
 *
 * These deliberately don't introduce a new styling mechanism: `primary_color`
 * on `coordinator_profiles` already drives the calendar header's accent bar,
 * the logo-less badge color, and `--ehx-brand` in the embed (see
 * `src/routes/c.$slug.tsx` and `src/routes/api/embed.$slug.ts`). A preset is
 * just a named, holiday-appropriate hex value plus a small badge emoji --
 * applying one is a normal `saveCoordinatorProfile({ primary_color })` call,
 * same as picking any other color in onboarding's branding step.
 *
 * Hex values are all distinct on purpose: `findPresetByColor` reverse-looks-up
 * a coordinator's current `primary_color` to decide whether to show the badge
 * emoji next to their name, and that only works unambiguously if no two
 * presets share a color.
 */

import type { HolidayId } from "./holiday-themes";

export type OrganizerPreset = {
  id: string;
  holiday: HolidayId;
  label: string;
  hex: string;
  /** Paired with `hex` for a two-tone look -- saved as the coordinator's
   *  `secondary_color`, which already existed on the profile but had nothing
   *  reading it. Applying a preset now sets both at once. */
  secondaryHex: string;
  emoji: string;
};

export const ORGANIZER_PRESETS: OrganizerPreset[] = [
  // #f97316 is deliberately not used by any preset: it's the schema's
  // pre-existing default primary_color, kept free so "reset to default" is
  // unambiguous and never collides with a named preset via findPresetByColor.
  { id: "autumn-golden-harvest", holiday: "autumn", label: "Golden Harvest", hex: "#f59e0b", secondaryHex: "#b45309", emoji: "🍂" },
  { id: "autumn-rustic-orchard", holiday: "autumn", label: "Rustic Orchard", hex: "#dc2626", secondaryHex: "#4d7c0f", emoji: "🍎" },
  { id: "autumn-misty-woods", holiday: "autumn", label: "Misty Woods", hex: "#15803d", secondaryHex: "#78716c", emoji: "🌲" },

  { id: "halloween-classic", holiday: "halloween", label: "Classic Trick-or-Treat", hex: "#ea580c", secondaryHex: "#18181b", emoji: "🎃" },
  { id: "halloween-spooky-night", holiday: "halloween", label: "Spooky Night", hex: "#7c3aed", secondaryHex: "#111827", emoji: "👻" },
  { id: "halloween-playful-pumpkin", holiday: "halloween", label: "Playful Pumpkin", hex: "#eab308", secondaryHex: "#ea580c", emoji: "🕸️" },

  { id: "thanksgiving-warm-harvest", holiday: "thanksgiving", label: "Warm Harvest", hex: "#b45309", secondaryHex: "#facc15", emoji: "🦃" },
  { id: "thanksgiving-cranberry-sage", holiday: "thanksgiving", label: "Cranberry & Sage", hex: "#be123c", secondaryHex: "#4d7c0f", emoji: "🍒" },
  { id: "thanksgiving-rustic-table", holiday: "thanksgiving", label: "Rustic Table", hex: "#92400e", secondaryHex: "#ca8a04", emoji: "🥧" },

  { id: "christmas-classic", holiday: "christmas", label: "Classic Red & Green", hex: "#16a34a", secondaryHex: "#dc2626", emoji: "🎄" },
  { id: "christmas-winter-frost", holiday: "christmas", label: "Winter Frost", hex: "#0284c7", secondaryHex: "#bae6fd", emoji: "❄️" },
  { id: "christmas-golden-elegance", holiday: "christmas", label: "Golden Elegance", hex: "#ca8a04", secondaryHex: "#78350f", emoji: "✨" },
];

export function findPresetByColor(hex: string | null | undefined): OrganizerPreset | null {
  if (!hex) return null;
  const normalized = hex.trim().toLowerCase();
  return ORGANIZER_PRESETS.find((p) => p.hex.toLowerCase() === normalized) ?? null;
}

/**
 * A 6-digit hex plus an alpha channel, for a soft tinted wash rather than a
 * bold block of color -- the same two colors read as a "look" whether the
 * text sitting on top of them is dark or light. `alphaHex` is a 2-digit hex
 * (e.g. "14" ~ 8%, "26" ~ 15%). Falls back to the bare hex if it doesn't
 * look like a hex color, so a bad value degrades to solid rather than
 * silently vanishing.
 */
export function withAlpha(hex: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alphaHex}` : hex;
}

/** The two-tone wash `/c/$slug` and the embed both use behind a coordinator's
 *  header, from whichever primary/secondary colors are on their profile
 *  (a preset's pair, or a custom pick from onboarding's branding step). */
export function brandWash(primary: string, secondary: string): string {
  return `linear-gradient(120deg, ${withAlpha(primary, "1a")}, ${withAlpha(secondary, "1a")})`;
}

export function presetsByHoliday(): Record<HolidayId, OrganizerPreset[]> {
  const out: Record<HolidayId, OrganizerPreset[]> = {
    autumn: [],
    halloween: [],
    thanksgiving: [],
    christmas: [],
  };
  for (const p of ORGANIZER_PRESETS) out[p.holiday].push(p);
  return out;
}
