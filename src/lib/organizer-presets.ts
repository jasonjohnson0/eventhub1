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
  emoji: string;
};

export const ORGANIZER_PRESETS: OrganizerPreset[] = [
  // #f97316 is deliberately not used by any preset: it's the schema's
  // pre-existing default primary_color, kept free so "reset to default" is
  // unambiguous and never collides with a named preset via findPresetByColor.
  { id: "autumn-golden-harvest", holiday: "autumn", label: "Golden Harvest", hex: "#f59e0b", emoji: "🍂" },
  { id: "autumn-rustic-orchard", holiday: "autumn", label: "Rustic Orchard", hex: "#dc2626", emoji: "🍎" },
  { id: "autumn-misty-woods", holiday: "autumn", label: "Misty Woods", hex: "#15803d", emoji: "🌲" },

  { id: "halloween-classic", holiday: "halloween", label: "Classic Trick-or-Treat", hex: "#ea580c", emoji: "🎃" },
  { id: "halloween-spooky-night", holiday: "halloween", label: "Spooky Night", hex: "#7c3aed", emoji: "👻" },
  { id: "halloween-playful-pumpkin", holiday: "halloween", label: "Playful Pumpkin", hex: "#eab308", emoji: "🕸️" },

  { id: "thanksgiving-warm-harvest", holiday: "thanksgiving", label: "Warm Harvest", hex: "#b45309", emoji: "🦃" },
  { id: "thanksgiving-cranberry-sage", holiday: "thanksgiving", label: "Cranberry & Sage", hex: "#be123c", emoji: "🍒" },
  { id: "thanksgiving-rustic-table", holiday: "thanksgiving", label: "Rustic Table", hex: "#92400e", emoji: "🥧" },

  { id: "christmas-classic", holiday: "christmas", label: "Classic Red & Green", hex: "#16a34a", emoji: "🎄" },
  { id: "christmas-winter-frost", holiday: "christmas", label: "Winter Frost", hex: "#0284c7", emoji: "❄️" },
  { id: "christmas-golden-elegance", holiday: "christmas", label: "Golden Elegance", hex: "#ca8a04", emoji: "✨" },
];

export function findPresetByColor(hex: string | null | undefined): OrganizerPreset | null {
  if (!hex) return null;
  const normalized = hex.trim().toLowerCase();
  return ORGANIZER_PRESETS.find((p) => p.hex.toLowerCase() === normalized) ?? null;
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
