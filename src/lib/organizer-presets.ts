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
 * presets share a color. For the same reason an existing preset's `hex` must
 * never change -- coordinators who already picked it would silently lose it.
 *
 * Contrast: the embed prints dates in the brand color on a near-white card,
 * and `/c/$slug` draws a white icon on it. Every preset added from the
 * 2026-09 holiday/monthly expansion on has a `hex` that meets WCAG AA
 * (4.5:1) against white on its own. The original twelve predate that rule and
 * some are brighter (e.g. Golden Harvest's amber); rather than change their
 * hex (see above), the embed runs every brand color through
 * `readableTextColor()` before using it as text. tests/unit/holiday-presets.mjs
 * checks both.
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

/** The original presets, from before `hex` had to pass AA on its own. */
export const LEGACY_PRESET_IDS = new Set([
  "autumn-golden-harvest",
  "autumn-rustic-orchard",
  "autumn-misty-woods",
  "halloween-classic",
  "halloween-spooky-night",
  "halloween-playful-pumpkin",
  "thanksgiving-warm-harvest",
  "thanksgiving-cranberry-sage",
  "thanksgiving-rustic-table",
  "christmas-classic",
  "christmas-winter-frost",
  "christmas-golden-elegance",
]);

export const ORGANIZER_PRESETS: OrganizerPreset[] = [
  // #f97316 is deliberately not used by any preset: it's the schema's
  // pre-existing default primary_color, kept free so "reset to default" is
  // unambiguous and never collides with a named preset via findPresetByColor.
  // #0f766e likewise: it's the embed's fallback brand color.
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

  // ---- Christian holidays ---------------------------------------------------
  { id: "epiphany-star", holiday: "epiphany", label: "Star of Bethlehem", hex: "#4338ca", secondaryHex: "#eab308", emoji: "⭐" },
  { id: "epiphany-magi-gold", holiday: "epiphany", label: "Magi Gold", hex: "#a16207", secondaryHex: "#312e81", emoji: "👑" },

  { id: "lent-violet", holiday: "ash-wednesday", label: "Lenten Violet", hex: "#5b21b6", secondaryHex: "#a8a29e", emoji: "🙏" },
  { id: "lent-ash-stone", holiday: "ash-wednesday", label: "Ash & Stone", hex: "#57534e", secondaryHex: "#6d28d9", emoji: "✝️" },

  { id: "palm-sunday-fronds", holiday: "palm-sunday", label: "Palm Fronds", hex: "#166534", secondaryHex: "#a3e635", emoji: "🌿" },
  { id: "palm-sunday-olive", holiday: "palm-sunday", label: "Olive Branch", hex: "#4d7c0f", secondaryHex: "#fde68a", emoji: "🍃" },

  { id: "good-friday-solemn", holiday: "good-friday", label: "Solemn Black", hex: "#1c1917", secondaryHex: "#7f1d1d", emoji: "✝️" },
  { id: "good-friday-crimson", holiday: "good-friday", label: "Passion Crimson", hex: "#7f1d1d", secondaryHex: "#44403c", emoji: "🕯️" },

  { id: "easter-lily", holiday: "easter", label: "Easter Lily", hex: "#6d28d9", secondaryHex: "#fde68a", emoji: "🌷" },
  { id: "easter-sunrise", holiday: "easter", label: "Sunrise Service", hex: "#c2410c", secondaryHex: "#fcd34d", emoji: "🌅" },

  { id: "pentecost-fire", holiday: "pentecost", label: "Tongues of Fire", hex: "#b91c1c", secondaryHex: "#f97316", emoji: "🔥" },
  { id: "pentecost-dove", holiday: "pentecost", label: "Holy Spirit Dove", hex: "#9a3412", secondaryHex: "#fde68a", emoji: "🕊️" },

  { id: "all-saints-gold", holiday: "all-saints", label: "Saints' Gold", hex: "#854d0e", secondaryHex: "#fef3c7", emoji: "😇" },
  { id: "all-saints-candlelight", holiday: "all-saints", label: "Candlelight", hex: "#44403c", secondaryHex: "#fbbf24", emoji: "🕯️" },

  { id: "advent-purple", holiday: "advent", label: "Advent Purple", hex: "#6b21a8", secondaryHex: "#db2777", emoji: "🕯️" },
  { id: "advent-rose", holiday: "advent", label: "Rose Sunday", hex: "#9d174d", secondaryHex: "#7e22ce", emoji: "🌸" },

  // ---- National & widely observed holidays ---------------------------------
  { id: "new-year-midnight", holiday: "new-year", label: "Midnight Sparkle", hex: "#312e81", secondaryHex: "#facc15", emoji: "🥂" },
  { id: "new-year-silver", holiday: "new-year", label: "Silver & Gold", hex: "#475569", secondaryHex: "#eab308", emoji: "✨" },

  { id: "mlk-dream", holiday: "mlk-day", label: "I Have a Dream", hex: "#1d4ed8", secondaryHex: "#f59e0b", emoji: "🕊️" },
  { id: "mlk-service", holiday: "mlk-day", label: "Day of Service", hex: "#115e59", secondaryHex: "#fbbf24", emoji: "🤝" },

  { id: "valentines-be-mine", holiday: "valentines", label: "Be Mine", hex: "#e11d48", secondaryHex: "#f9a8d4", emoji: "💝" },
  { id: "valentines-roses", holiday: "valentines", label: "Red Roses", hex: "#9f1239", secondaryHex: "#fb7185", emoji: "🌹" },

  { id: "presidents-stars-stripes", holiday: "presidents-day", label: "Stars & Stripes", hex: "#1e40af", secondaryHex: "#b91c1c", emoji: "🎩" },
  { id: "presidents-capitol", holiday: "presidents-day", label: "Capitol Marble", hex: "#334155", secondaryHex: "#93c5fd", emoji: "🏛️" },

  { id: "st-patricks-shamrock", holiday: "st-patricks", label: "Shamrock", hex: "#14532d", secondaryHex: "#84cc16", emoji: "☘️" },
  { id: "st-patricks-lucky", holiday: "st-patricks", label: "Pot of Gold", hex: "#047857", secondaryHex: "#eab308", emoji: "🍀" },

  { id: "mothers-day-carnation", holiday: "mothers-day", label: "Pink Carnation", hex: "#a21caf", secondaryHex: "#f9a8d4", emoji: "💐" },
  { id: "mothers-day-garden", holiday: "mothers-day", label: "Garden Bouquet", hex: "#86198f", secondaryHex: "#86efac", emoji: "🌸" },

  { id: "memorial-honor", holiday: "memorial-day", label: "Honor & Remember", hex: "#1e3a8a", secondaryHex: "#991b1b", emoji: "🇺🇸" },
  { id: "memorial-poppy", holiday: "memorial-day", label: "Remembrance Poppy", hex: "#991b1b", secondaryHex: "#1e3a8a", emoji: "🌺" },

  { id: "fathers-day-navy", holiday: "fathers-day", label: "Classic Navy", hex: "#0c4a6e", secondaryHex: "#94a3b8", emoji: "👔" },
  { id: "fathers-day-workshop", holiday: "fathers-day", label: "Workshop", hex: "#3f6212", secondaryHex: "#78350f", emoji: "🧰" },

  { id: "juneteenth-flag", holiday: "juneteenth", label: "Freedom Flag", hex: "#c8102e", secondaryHex: "#1d4ed8", emoji: "⭐" },
  { id: "juneteenth-jubilee", holiday: "juneteenth", label: "Jubilee", hex: "#065f46", secondaryHex: "#b91c1c", emoji: "✊🏿" },

  { id: "independence-old-glory", holiday: "independence-day", label: "Old Glory", hex: "#b22234", secondaryHex: "#3c3b6e", emoji: "🎆" },
  { id: "independence-liberty", holiday: "independence-day", label: "Liberty Blue", hex: "#3c3b6e", secondaryHex: "#b22234", emoji: "🗽" },

  { id: "labor-day-hard-hat", holiday: "labor-day", label: "Hard Hat", hex: "#1e3a5f", secondaryHex: "#f59e0b", emoji: "👷" },
  { id: "labor-day-cookout", holiday: "labor-day", label: "Last Cookout of Summer", hex: "#a13d0d", secondaryHex: "#0369a1", emoji: "🌭" },

  { id: "columbus-indigenous-compass", holiday: "columbus-indigenous-day", label: "Compass & Coast", hex: "#155e75", secondaryHex: "#c2410c", emoji: "🧭" },
  { id: "columbus-indigenous-land", holiday: "columbus-indigenous-day", label: "Land & Harvest", hex: "#7c2d12", secondaryHex: "#0e7490", emoji: "🌽" },

  { id: "veterans-salute", holiday: "veterans-day", label: "Salute to Service", hex: "#172554", secondaryHex: "#b91c1c", emoji: "🎖️" },
  { id: "veterans-olive-drab", holiday: "veterans-day", label: "Olive Drab", hex: "#4b5320", secondaryHex: "#a8a29e", emoji: "🏅" },

  // ---- Monthly observances (one per month) ---------------------------------
  { id: "month-january-blood-donor", holiday: "month-january", label: "Blood Donor Red", hex: "#a50e1f", secondaryHex: "#fecaca", emoji: "🩸" },
  { id: "month-february-heart", holiday: "month-february", label: "Heart Health", hex: "#c81e1e", secondaryHex: "#fda4af", emoji: "❤️" },
  { id: "month-march-womens-history", holiday: "month-march", label: "Suffrage Purple & Gold", hex: "#6b2c91", secondaryHex: "#d4a017", emoji: "💜" },
  { id: "month-april-earth", holiday: "month-april", label: "Earth Month", hex: "#0e7490", secondaryHex: "#22c55e", emoji: "🌍" },
  { id: "month-may-mental-health", holiday: "month-may", label: "Green Ribbon", hex: "#2f6b3a", secondaryHex: "#99f6e4", emoji: "💚" },
  { id: "month-june-sweet-tea", holiday: "month-june", label: "Sweet Tea & Biscuits", hex: "#8b4513", secondaryHex: "#e0a526", emoji: "🍑" },
  { id: "month-july-parks", holiday: "month-july", label: "Great Outdoors", hex: "#2d5a27", secondaryHex: "#38bdf8", emoji: "🏞️" },
  { id: "month-august-school", holiday: "month-august", label: "School Bus & Apple", hex: "#b3261e", secondaryHex: "#facc15", emoji: "🎒" },
  { id: "month-september-hispanic-heritage", holiday: "month-september", label: "Fiesta Colors", hex: "#be3455", secondaryHex: "#0d9488", emoji: "🌺" },
  { id: "month-october-pink-ribbon", holiday: "month-october", label: "Pink Ribbon", hex: "#be185d", secondaryHex: "#f9a8d4", emoji: "🎗️" },
  { id: "month-november-native-heritage", holiday: "month-november", label: "Earth & Sky", hex: "#8a3b12", secondaryHex: "#0f766e", emoji: "🌽" },
  { id: "month-december-human-rights", holiday: "month-december", label: "Human Rights Blue", hex: "#1e4d8c", secondaryHex: "#93c5fd", emoji: "🤝" },
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

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio between two hex colors (1-21), or 1 if either
 *  isn't a 3/6-digit hex. */
export function contrastRatio(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return 1;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `hex` itself if it already reads as text on white at WCAG AA (4.5:1),
 * otherwise the same hue darkened just enough to get there. Used wherever a
 * brand color is printed as text, so a bright pick (a legacy preset's amber,
 * or any custom color) stays legible without changing the color the
 * coordinator actually saved. Non-hex input comes back unchanged.
 */
export function readableTextColor(hex: string, background = "#ffffff", target = 4.5): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const toHex = (c: [number, number, number]) =>
    `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  if (contrastRatio(toHex(rgb), background) >= target) return hex;
  for (let f = 0.95; f > 0; f -= 0.05) {
    const candidate = toHex(rgb.map((v) => v * f) as [number, number, number]);
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  return "#000000";
}

export function presetsByHoliday(): Partial<Record<HolidayId, OrganizerPreset[]>> {
  const out: Partial<Record<HolidayId, OrganizerPreset[]>> = {};
  for (const p of ORGANIZER_PRESETS) (out[p.holiday] ??= []).push(p);
  return out;
}
