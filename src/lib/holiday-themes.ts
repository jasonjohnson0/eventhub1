/**
 * Personal, per-visitor holiday themes for the public discovery page
 * (`/events`). Anyone can switch their own look at any time via
 * `useHolidayTheme()` -- this never changes what anyone else sees, and it
 * never touches an organizer's own calendar branding (see
 * `organizer-presets.ts` for that, a separate, per-coordinator setting).
 *
 * Each entry is plain Tailwind class strings rather than CSS custom
 * properties: the page this drives (`PublicHero`) is already written with
 * hardcoded gradient/color utilities, not the semantic `bg-primary`-style
 * design tokens, so matching that convention here means zero risk of
 * fighting specificity or touching the rest of the app's token system.
 */

export type HolidayId = "autumn" | "halloween" | "thanksgiving" | "christmas";

export type HolidayTheme = {
  id: HolidayId;
  label: string;
  menuEmoji: string;
  /** Tailwind `bg-gradient-to-br` stop classes for the hero section. */
  heroGradient: string;
  /** True when the hero background is dark enough to need light text. */
  dark: boolean;
  headingGradient: string;
  badgeBg: string;
  badgeText: string;
  subtextClass: string;
  accentText: string;
  floatingEmojis: string[];
  confettiColors: string[];
};

export const HOLIDAY_THEMES: Record<HolidayId, HolidayTheme> = {
  autumn: {
    id: "autumn",
    label: "Autumn",
    menuEmoji: "🍂",
    heroGradient: "from-orange-100 via-amber-50 to-yellow-100",
    dark: false,
    headingGradient: "from-orange-600 via-amber-600 to-yellow-600",
    badgeBg: "bg-orange-100/80",
    badgeText: "text-orange-700",
    subtextClass: "text-slate-700",
    accentText: "text-orange-600",
    floatingEmojis: ["🍂", "🍁", "🌰", "☕", "🎃", "🌾"],
    confettiColors: ["#f97316", "#d97706", "#ca8a04", "#92400e", "#fde68a"],
  },
  halloween: {
    id: "halloween",
    label: "Halloween",
    menuEmoji: "🎃",
    heroGradient: "from-violet-950 via-purple-900 to-slate-900",
    dark: true,
    headingGradient: "from-orange-400 via-amber-300 to-purple-300",
    badgeBg: "bg-purple-900/60",
    badgeText: "text-orange-300",
    subtextClass: "text-purple-100/80",
    accentText: "text-orange-400",
    floatingEmojis: ["🎃", "👻", "🦇", "🕸️", "🕷️", "🌙"],
    confettiColors: ["#7c3aed", "#f97316", "#1e1b4b", "#ffffff", "#4c1d95"],
  },
  thanksgiving: {
    id: "thanksgiving",
    label: "Thanksgiving",
    menuEmoji: "🦃",
    heroGradient: "from-amber-100 via-orange-50 to-yellow-100",
    dark: false,
    headingGradient: "from-amber-700 via-orange-600 to-yellow-700",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-amber-800",
    subtextClass: "text-slate-700",
    accentText: "text-amber-700",
    floatingEmojis: ["🦃", "🍂", "🥧", "🌽", "🍁", "🕯️"],
    confettiColors: ["#b45309", "#c2410c", "#ca8a04", "#78350f", "#fde68a"],
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    menuEmoji: "🎄",
    heroGradient: "from-red-100 via-white to-emerald-100",
    dark: false,
    headingGradient: "from-red-600 via-emerald-600 to-red-600",
    badgeBg: "bg-red-100/80",
    badgeText: "text-red-700",
    subtextClass: "text-slate-700",
    accentText: "text-red-600",
    floatingEmojis: ["🎄", "🎅", "🔔", "🎁", "❄️", "⭐"],
    confettiColors: ["#dc2626", "#15803d", "#facc15", "#ffffff", "#1d4ed8"],
  },
};

export const HOLIDAY_ORDER: HolidayId[] = [
  "autumn",
  "halloween",
  "thanksgiving",
  "christmas",
];
