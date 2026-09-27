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
 * (They also have to stay complete literal strings in this file -- Tailwind
 * only generates CSS for class names it can see verbatim in the source.)
 *
 * When each one falls in the year lives in `holiday-dates.ts`.
 */

export type HolidayId =
  // The original four ids -- kept verbatim so saved visitor choices
  // (localStorage) and saved organizer presets keep resolving.
  | "autumn"
  | "halloween"
  | "thanksgiving"
  | "christmas"
  // Christian holidays
  | "epiphany"
  | "ash-wednesday"
  | "palm-sunday"
  | "good-friday"
  | "easter"
  | "pentecost"
  | "all-saints"
  | "advent"
  // National & widely observed holidays
  | "new-year"
  | "mlk-day"
  | "valentines"
  | "presidents-day"
  | "st-patricks"
  | "mothers-day"
  | "memorial-day"
  | "fathers-day"
  | "juneteenth"
  | "independence-day"
  | "labor-day"
  | "columbus-indigenous-day"
  | "veterans-day"
  // Monthly observances, one per month
  | "month-january"
  | "month-february"
  | "month-march"
  | "month-april"
  | "month-may"
  | "month-june"
  | "month-july"
  | "month-august"
  | "month-september"
  | "month-october"
  | "month-november"
  | "month-december";

export type HolidayGroup = "christian" | "national" | "monthly" | "seasonal";

export type HolidayTheme = {
  id: HolidayId;
  label: string;
  group: HolidayGroup;
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
  /** Omitted = the normal celebratory burst. Solemn days get a short, slow,
   *  sparse burst ("muted") or none at all ("none") -- Good Friday and Ash
   *  Wednesday are days of mourning and penitence, not parties. */
  confettiStyle?: "muted" | "none";
  /** Monthly observances only: the observance the month's theme is built
   *  around, spelled out in full. */
  observance?: string;
};

type ThemeInput = Omit<HolidayTheme, "id">;

// What most light heroes share; each entry spells out everything else.
const LIGHT = { dark: false, subtextClass: "text-slate-700" } as const;

const THEMES = {
  autumn: {
    label: "Autumn",
    group: "seasonal",
    menuEmoji: "🍂",
    heroGradient: "from-orange-100 via-amber-50 to-yellow-100",
    ...LIGHT,
    headingGradient: "from-orange-600 via-amber-600 to-yellow-600",
    badgeBg: "bg-orange-100/80",
    badgeText: "text-orange-700",
    accentText: "text-orange-600",
    floatingEmojis: ["🍂", "🍁", "🌰", "☕", "🎃", "🌾"],
    confettiColors: ["#f97316", "#d97706", "#ca8a04", "#92400e", "#fde68a"],
  },
  halloween: {
    label: "Halloween",
    group: "national",
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
    label: "Thanksgiving",
    group: "national",
    menuEmoji: "🦃",
    heroGradient: "from-amber-100 via-orange-50 to-yellow-100",
    ...LIGHT,
    headingGradient: "from-amber-700 via-orange-600 to-yellow-700",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-amber-800",
    accentText: "text-amber-700",
    floatingEmojis: ["🦃", "🍂", "🥧", "🌽", "🍁", "🕯️"],
    confettiColors: ["#b45309", "#c2410c", "#ca8a04", "#78350f", "#fde68a"],
  },
  christmas: {
    label: "Christmas",
    group: "christian",
    menuEmoji: "🎄",
    heroGradient: "from-red-100 via-white to-emerald-100",
    ...LIGHT,
    headingGradient: "from-red-600 via-emerald-600 to-red-600",
    badgeBg: "bg-red-100/80",
    badgeText: "text-red-700",
    accentText: "text-red-600",
    floatingEmojis: ["🎄", "🎅", "🔔", "🎁", "❄️", "⭐"],
    confettiColors: ["#dc2626", "#15803d", "#facc15", "#ffffff", "#1d4ed8"],
  },

  // ---- Christian holidays ---------------------------------------------------
  epiphany: {
    label: "Epiphany",
    group: "christian",
    menuEmoji: "⭐",
    heroGradient: "from-indigo-100 via-amber-50 to-yellow-100",
    ...LIGHT,
    headingGradient: "from-indigo-700 via-violet-600 to-amber-600",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-indigo-800",
    accentText: "text-indigo-600",
    floatingEmojis: ["⭐", "👑", "🎁", "🐪", "✨", "🌟"],
    confettiColors: ["#4338ca", "#facc15", "#ca8a04", "#ffffff", "#312e81"],
  },
  "ash-wednesday": {
    label: "Ash Wednesday & Lent",
    group: "christian",
    menuEmoji: "🙏",
    heroGradient: "from-stone-200 via-stone-100 to-violet-100",
    ...LIGHT,
    headingGradient: "from-stone-700 via-violet-800 to-stone-700",
    badgeBg: "bg-stone-200/80",
    badgeText: "text-violet-900",
    accentText: "text-violet-800",
    floatingEmojis: ["✝️", "🕯️", "🙏", "📖", "🌾", "🕊️"],
    confettiColors: ["#57534e", "#5b21b6"],
    confettiStyle: "none",
  },
  "palm-sunday": {
    label: "Palm Sunday",
    group: "christian",
    menuEmoji: "🌿",
    heroGradient: "from-lime-100 via-emerald-50 to-amber-50",
    ...LIGHT,
    headingGradient: "from-emerald-700 via-green-600 to-lime-700",
    badgeBg: "bg-emerald-100/80",
    badgeText: "text-emerald-800",
    accentText: "text-emerald-700",
    floatingEmojis: ["🌿", "✝️", "🍃", "🙌", "🕊️", "🌱"],
    confettiColors: ["#166534", "#4d7c0f", "#a3e635", "#fde68a"],
    confettiStyle: "muted",
  },
  "good-friday": {
    label: "Good Friday",
    group: "christian",
    menuEmoji: "✝️",
    heroGradient: "from-slate-900 via-zinc-900 to-stone-900",
    dark: true,
    headingGradient: "from-stone-200 via-slate-300 to-stone-400",
    badgeBg: "bg-white/10",
    badgeText: "text-stone-200",
    subtextClass: "text-stone-300/80",
    accentText: "text-stone-400",
    floatingEmojis: ["✝️", "🕯️", "🙏", "📖", "🕊️", "🕯️"],
    confettiColors: ["#1c1917", "#7f1d1d"],
    confettiStyle: "none",
  },
  easter: {
    label: "Easter",
    group: "christian",
    menuEmoji: "🌷",
    heroGradient: "from-yellow-50 via-white to-violet-100",
    ...LIGHT,
    headingGradient: "from-violet-600 via-fuchsia-500 to-amber-500",
    badgeBg: "bg-violet-100/80",
    badgeText: "text-violet-700",
    accentText: "text-violet-600",
    floatingEmojis: ["✝️", "🕊️", "🌷", "🌅", "💐", "🥚"],
    confettiColors: ["#c4b5fd", "#fde68a", "#f9a8d4", "#ffffff", "#86efac"],
  },
  pentecost: {
    label: "Pentecost",
    group: "christian",
    menuEmoji: "🔥",
    heroGradient: "from-red-100 via-orange-50 to-amber-100",
    ...LIGHT,
    headingGradient: "from-red-700 via-orange-600 to-amber-600",
    badgeBg: "bg-red-100/80",
    badgeText: "text-red-800",
    accentText: "text-red-700",
    floatingEmojis: ["🕊️", "🔥", "💨", "✨", "🙌", "🔥"],
    confettiColors: ["#b91c1c", "#ea580c", "#f59e0b", "#fde68a", "#ffffff"],
  },
  "all-saints": {
    label: "All Saints' Day",
    group: "christian",
    menuEmoji: "😇",
    heroGradient: "from-amber-50 via-white to-yellow-100",
    ...LIGHT,
    headingGradient: "from-amber-700 via-yellow-600 to-amber-700",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-amber-800",
    accentText: "text-amber-700",
    floatingEmojis: ["🕯️", "😇", "✨", "⛪", "🙏", "🌟"],
    confettiColors: ["#fbbf24", "#ffffff", "#fde68a", "#a16207"],
    confettiStyle: "muted",
  },
  advent: {
    label: "Advent",
    group: "christian",
    menuEmoji: "🕯️",
    heroGradient: "from-violet-200 via-purple-100 to-pink-100",
    ...LIGHT,
    headingGradient: "from-violet-800 via-purple-700 to-pink-600",
    badgeBg: "bg-violet-100/80",
    badgeText: "text-violet-800",
    accentText: "text-violet-700",
    floatingEmojis: ["🕯️", "⭐", "🌲", "✨", "📖", "🕯️"],
    confettiColors: ["#6b21a8", "#db2777", "#facc15", "#ffffff"],
    confettiStyle: "muted",
  },

  // ---- National & widely observed holidays ---------------------------------
  "new-year": {
    label: "New Year's Day",
    group: "national",
    menuEmoji: "🥂",
    heroGradient: "from-slate-950 via-indigo-950 to-slate-900",
    dark: true,
    headingGradient: "from-amber-300 via-yellow-200 to-amber-400",
    badgeBg: "bg-white/10",
    badgeText: "text-amber-200",
    subtextClass: "text-indigo-100/80",
    accentText: "text-amber-400",
    floatingEmojis: ["🥂", "🎆", "✨", "🎉", "🕛", "🎊"],
    confettiColors: ["#facc15", "#e5e7eb", "#fbbf24", "#ffffff", "#a5b4fc"],
  },
  "mlk-day": {
    label: "Martin Luther King Jr. Day",
    group: "national",
    menuEmoji: "🕊️",
    heroGradient: "from-sky-100 via-white to-amber-50",
    ...LIGHT,
    headingGradient: "from-sky-800 via-indigo-700 to-amber-700",
    badgeBg: "bg-sky-100/80",
    badgeText: "text-sky-800",
    accentText: "text-sky-700",
    floatingEmojis: ["🕊️", "✊🏾", "🤝", "📜", "⭐", "💬"],
    confettiColors: ["#1d4ed8", "#f59e0b", "#ffffff", "#0369a1"],
    confettiStyle: "muted",
  },
  valentines: {
    label: "Valentine's Day",
    group: "national",
    menuEmoji: "💝",
    heroGradient: "from-pink-100 via-rose-50 to-red-100",
    ...LIGHT,
    headingGradient: "from-rose-600 via-pink-500 to-red-500",
    badgeBg: "bg-pink-100/80",
    badgeText: "text-rose-700",
    accentText: "text-rose-600",
    floatingEmojis: ["💝", "💕", "🌹", "💌", "🍫", "💖"],
    confettiColors: ["#e11d48", "#f472b6", "#fda4af", "#ffffff", "#be123c"],
  },
  "presidents-day": {
    label: "Presidents' Day",
    group: "national",
    menuEmoji: "🎩",
    heroGradient: "from-slate-100 via-blue-50 to-indigo-100",
    ...LIGHT,
    headingGradient: "from-indigo-800 via-blue-700 to-slate-700",
    badgeBg: "bg-blue-100/80",
    badgeText: "text-blue-800",
    accentText: "text-blue-700",
    floatingEmojis: ["🎩", "🇺🇸", "🏛️", "🦅", "⭐", "📜"],
    confettiColors: ["#1e40af", "#b91c1c", "#ffffff", "#334155"],
  },
  "st-patricks": {
    label: "St. Patrick's Day",
    group: "national",
    menuEmoji: "☘️",
    heroGradient: "from-emerald-100 via-green-50 to-lime-100",
    ...LIGHT,
    headingGradient: "from-emerald-700 via-green-600 to-lime-600",
    badgeBg: "bg-emerald-100/80",
    badgeText: "text-emerald-800",
    accentText: "text-emerald-700",
    floatingEmojis: ["☘️", "🍀", "🌈", "🎩", "💚", "✨"],
    confettiColors: ["#15803d", "#22c55e", "#84cc16", "#facc15", "#ffffff"],
  },
  "mothers-day": {
    label: "Mother's Day",
    group: "national",
    menuEmoji: "💐",
    heroGradient: "from-rose-100 via-pink-50 to-fuchsia-100",
    ...LIGHT,
    headingGradient: "from-rose-600 via-pink-600 to-fuchsia-600",
    badgeBg: "bg-rose-100/80",
    badgeText: "text-rose-700",
    accentText: "text-pink-600",
    floatingEmojis: ["💐", "🌸", "💗", "🌷", "☕", "🎀"],
    confettiColors: ["#f472b6", "#f9a8d4", "#c026d3", "#ffffff", "#86efac"],
  },
  "memorial-day": {
    label: "Memorial Day",
    group: "national",
    menuEmoji: "🇺🇸",
    heroGradient: "from-slate-200 via-white to-blue-100",
    ...LIGHT,
    headingGradient: "from-blue-900 via-slate-700 to-red-800",
    badgeBg: "bg-slate-200/80",
    badgeText: "text-blue-900",
    accentText: "text-blue-800",
    floatingEmojis: ["🇺🇸", "🎖️", "🌺", "🕯️", "⭐", "🙏"],
    confettiColors: ["#1e3a8a", "#991b1b", "#ffffff"],
    confettiStyle: "muted",
  },
  "fathers-day": {
    label: "Father's Day",
    group: "national",
    menuEmoji: "👔",
    heroGradient: "from-sky-100 via-slate-50 to-blue-100",
    ...LIGHT,
    headingGradient: "from-sky-700 via-blue-700 to-slate-700",
    badgeBg: "bg-sky-100/80",
    badgeText: "text-sky-800",
    accentText: "text-blue-700",
    floatingEmojis: ["👔", "🧰", "🎣", "🍔", "⛳", "💙"],
    confettiColors: ["#0369a1", "#1d4ed8", "#94a3b8", "#ffffff", "#65a30d"],
  },
  juneteenth: {
    label: "Juneteenth",
    group: "national",
    menuEmoji: "✊🏿",
    heroGradient: "from-red-100 via-amber-50 to-emerald-100",
    ...LIGHT,
    headingGradient: "from-red-700 via-amber-600 to-emerald-700",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-red-800",
    accentText: "text-red-700",
    floatingEmojis: ["✊🏿", "⭐", "🎉", "📜", "🎶", "❤️"],
    confettiColors: ["#c8102e", "#1d4ed8", "#ffffff", "#065f46", "#facc15"],
  },
  "independence-day": {
    label: "Independence Day",
    group: "national",
    menuEmoji: "🎆",
    heroGradient: "from-red-100 via-white to-blue-200",
    ...LIGHT,
    headingGradient: "from-red-600 via-blue-700 to-red-600",
    badgeBg: "bg-blue-100/80",
    badgeText: "text-blue-800",
    accentText: "text-red-600",
    floatingEmojis: ["🎆", "🇺🇸", "🎇", "🗽", "⭐", "🎉"],
    confettiColors: ["#b22234", "#3c3b6e", "#ffffff", "#dc2626", "#2563eb"],
  },
  "labor-day": {
    label: "Labor Day",
    group: "national",
    menuEmoji: "👷",
    heroGradient: "from-amber-100 via-sky-50 to-blue-100",
    ...LIGHT,
    headingGradient: "from-blue-800 via-sky-700 to-amber-600",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-blue-800",
    accentText: "text-blue-700",
    floatingEmojis: ["👷", "🛠️", "🏗️", "🌭", "🇺🇸", "🌻"],
    confettiColors: ["#1e40af", "#f59e0b", "#ffffff", "#0284c7"],
  },
  "columbus-indigenous-day": {
    label: "Columbus Day / Indigenous Peoples' Day",
    group: "national",
    menuEmoji: "🧭",
    heroGradient: "from-sky-100 via-amber-50 to-orange-100",
    ...LIGHT,
    headingGradient: "from-sky-800 via-cyan-700 to-orange-700",
    badgeBg: "bg-sky-100/80",
    badgeText: "text-sky-800",
    accentText: "text-cyan-700",
    floatingEmojis: ["🧭", "🌎", "🌽", "🍂", "🏞️", "🌾"],
    confettiColors: ["#0e7490", "#c2410c", "#fde68a", "#ffffff"],
  },
  "veterans-day": {
    label: "Veterans Day",
    group: "national",
    menuEmoji: "🎖️",
    heroGradient: "from-blue-100 via-white to-slate-200",
    ...LIGHT,
    headingGradient: "from-blue-900 via-red-700 to-blue-900",
    badgeBg: "bg-blue-100/80",
    badgeText: "text-blue-900",
    accentText: "text-blue-800",
    floatingEmojis: ["🎖️", "🇺🇸", "⭐", "🦅", "🏅", "🙏"],
    confettiColors: ["#1e3a8a", "#b91c1c", "#ffffff"],
    confettiStyle: "muted",
  },

  // ---- Monthly observances -------------------------------------------------
  "month-january": {
    label: "January: Blood Donor Month",
    observance: "National Blood Donor Month",
    group: "monthly",
    menuEmoji: "🩸",
    heroGradient: "from-rose-100 via-white to-red-100",
    ...LIGHT,
    headingGradient: "from-red-700 via-rose-600 to-red-700",
    badgeBg: "bg-rose-100/80",
    badgeText: "text-red-800",
    accentText: "text-red-700",
    floatingEmojis: ["🩸", "❤️", "🤝", "💪", "🏥", "❄️"],
    confettiColors: ["#b91c1c", "#fecaca", "#ffffff", "#e11d48"],
  },
  "month-february": {
    label: "February: American Heart Month",
    observance: "American Heart Month",
    group: "monthly",
    menuEmoji: "❤️",
    heroGradient: "from-red-50 via-white to-rose-100",
    ...LIGHT,
    headingGradient: "from-red-600 via-red-500 to-rose-600",
    badgeBg: "bg-red-100/80",
    badgeText: "text-red-700",
    accentText: "text-red-600",
    floatingEmojis: ["❤️", "🏃", "🥗", "🚴", "💓", "🍎"],
    confettiColors: ["#dc2626", "#fda4af", "#ffffff", "#16a34a"],
  },
  "month-march": {
    label: "March: Women's History Month",
    observance: "Women's History Month",
    group: "monthly",
    menuEmoji: "💜",
    heroGradient: "from-violet-100 via-white to-amber-100",
    ...LIGHT,
    headingGradient: "from-violet-700 via-purple-600 to-amber-600",
    badgeBg: "bg-violet-100/80",
    badgeText: "text-violet-800",
    accentText: "text-violet-700",
    floatingEmojis: ["💜", "📚", "✊", "🌟", "📜", "👩‍🔬"],
    confettiColors: ["#6b2c91", "#d4a017", "#ffffff", "#a78bfa"],
  },
  "month-april": {
    label: "April: Earth Month",
    observance: "Earth Month (Earth Day, April 22)",
    group: "monthly",
    menuEmoji: "🌍",
    heroGradient: "from-sky-100 via-emerald-50 to-green-100",
    ...LIGHT,
    headingGradient: "from-sky-700 via-teal-600 to-green-700",
    badgeBg: "bg-emerald-100/80",
    badgeText: "text-emerald-800",
    accentText: "text-teal-700",
    floatingEmojis: ["🌍", "🌱", "♻️", "🌳", "💧", "🐝"],
    confettiColors: ["#0e7490", "#15803d", "#86efac", "#7dd3fc", "#ffffff"],
  },
  "month-may": {
    label: "May: Mental Health Awareness Month",
    observance: "Mental Health Awareness Month",
    group: "monthly",
    menuEmoji: "💚",
    heroGradient: "from-emerald-50 via-teal-50 to-lime-100",
    ...LIGHT,
    headingGradient: "from-emerald-700 via-teal-600 to-lime-700",
    badgeBg: "bg-emerald-100/80",
    badgeText: "text-emerald-800",
    accentText: "text-emerald-700",
    floatingEmojis: ["💚", "🧠", "🌿", "☀️", "🤗", "🧘"],
    confettiColors: ["#2f855a", "#99f6e4", "#d9f99d", "#ffffff"],
    confettiStyle: "muted",
  },
  "month-june": {
    label: "June: Country Cooking & Iced Tea Month",
    observance: "National Country Cooking Month and National Iced Tea Month",
    group: "monthly",
    menuEmoji: "🍑",
    heroGradient: "from-yellow-50 via-amber-100 to-orange-200",
    ...LIGHT,
    headingGradient: "from-amber-800 via-orange-700 to-yellow-700",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-amber-900",
    accentText: "text-amber-700",
    floatingEmojis: ["🍑", "🧊", "🍋", "🥧", "🌽", "🍗"],
    confettiColors: ["#8b4513", "#d97706", "#fbbf24", "#fef3c7", "#fdba74"],
  },
  "month-july": {
    label: "July: Park & Recreation Month",
    observance: "Park and Recreation Month",
    group: "monthly",
    menuEmoji: "🏞️",
    heroGradient: "from-green-100 via-sky-50 to-sky-100",
    ...LIGHT,
    headingGradient: "from-green-700 via-emerald-600 to-sky-700",
    badgeBg: "bg-green-100/80",
    badgeText: "text-green-800",
    accentText: "text-green-700",
    floatingEmojis: ["🏞️", "🌲", "🚲", "⛺", "🥾", "🦋"],
    confettiColors: ["#15803d", "#0ea5e9", "#a3e635", "#fde68a", "#ffffff"],
  },
  "month-august": {
    label: "August: Back to School Month",
    observance: "National Back to School Month",
    group: "monthly",
    menuEmoji: "🎒",
    heroGradient: "from-yellow-100 via-white to-red-100",
    ...LIGHT,
    headingGradient: "from-red-600 via-orange-500 to-yellow-600",
    badgeBg: "bg-yellow-100/80",
    badgeText: "text-red-700",
    accentText: "text-red-600",
    floatingEmojis: ["🎒", "✏️", "📚", "🍎", "🚌", "📐"],
    confettiColors: ["#facc15", "#dc2626", "#2563eb", "#16a34a", "#ffffff"],
  },
  "month-september": {
    label: "September: Hispanic Heritage Month",
    observance: "National Hispanic Heritage Month (Sept 15 – Oct 15)",
    group: "monthly",
    menuEmoji: "🌺",
    heroGradient: "from-orange-100 via-rose-50 to-teal-100",
    ...LIGHT,
    headingGradient: "from-rose-600 via-orange-600 to-teal-600",
    badgeBg: "bg-orange-100/80",
    badgeText: "text-rose-700",
    accentText: "text-teal-700",
    floatingEmojis: ["🌺", "🎶", "🎨", "📚", "💃", "🌎"],
    confettiColors: ["#e11d48", "#f97316", "#facc15", "#0d9488", "#ffffff"],
  },
  "month-october": {
    label: "October: Breast Cancer Awareness Month",
    observance: "National Breast Cancer Awareness Month",
    group: "monthly",
    menuEmoji: "🎗️",
    heroGradient: "from-pink-100 via-rose-50 to-pink-200",
    ...LIGHT,
    headingGradient: "from-pink-700 via-rose-600 to-pink-600",
    badgeBg: "bg-pink-100/80",
    badgeText: "text-pink-800",
    accentText: "text-pink-600",
    floatingEmojis: ["🎗️", "💗", "🌸", "💪", "🤝", "💖"],
    confettiColors: ["#ec4899", "#f9a8d4", "#fbcfe8", "#ffffff", "#be185d"],
    confettiStyle: "muted",
  },
  "month-november": {
    label: "November: Native American Heritage Month",
    observance: "National Native American Heritage Month",
    group: "monthly",
    menuEmoji: "🌽",
    heroGradient: "from-amber-100 via-orange-50 to-teal-100",
    ...LIGHT,
    headingGradient: "from-amber-800 via-orange-700 to-teal-700",
    badgeBg: "bg-amber-100/80",
    badgeText: "text-amber-900",
    accentText: "text-teal-700",
    floatingEmojis: ["🌽", "🦅", "🏞️", "📖", "🎶", "🌾"],
    confettiColors: ["#7c2d12", "#0f766e", "#f59e0b", "#fde68a"],
  },
  "month-december": {
    label: "December: Human Rights Month",
    observance: "Universal Human Rights Month (Human Rights Day, Dec 10)",
    group: "monthly",
    menuEmoji: "🤝",
    heroGradient: "from-sky-100 via-white to-blue-100",
    ...LIGHT,
    headingGradient: "from-blue-700 via-sky-600 to-blue-800",
    badgeBg: "bg-sky-100/80",
    badgeText: "text-blue-800",
    accentText: "text-blue-700",
    floatingEmojis: ["🤝", "🕊️", "🌍", "📜", "💙", "✋"],
    confettiColors: ["#1e4d8c", "#93c5fd", "#ffffff", "#facc15"],
    confettiStyle: "muted",
  },
} satisfies Record<HolidayId, ThemeInput>;

export const HOLIDAY_THEMES = Object.fromEntries(
  Object.entries(THEMES).map(([id, t]) => [id, { id, ...t }]),
) as Record<HolidayId, HolidayTheme>;

export const HOLIDAY_GROUPS: { id: HolidayGroup; label: string }[] = [
  { id: "christian", label: "Christian holidays" },
  { id: "national", label: "National holidays" },
  { id: "monthly", label: "Monthly observances" },
  { id: "seasonal", label: "Seasonal" },
];

/** Calendar order within each group. */
export const HOLIDAY_GROUP_ORDER: Record<HolidayGroup, HolidayId[]> = {
  christian: [
    "epiphany",
    "ash-wednesday",
    "palm-sunday",
    "good-friday",
    "easter",
    "pentecost",
    "all-saints",
    "advent",
    "christmas",
  ],
  national: [
    "new-year",
    "mlk-day",
    "valentines",
    "presidents-day",
    "st-patricks",
    "mothers-day",
    "memorial-day",
    "fathers-day",
    "juneteenth",
    "independence-day",
    "labor-day",
    "columbus-indigenous-day",
    "halloween",
    "veterans-day",
    "thanksgiving",
  ],
  monthly: [
    "month-january",
    "month-february",
    "month-march",
    "month-april",
    "month-may",
    "month-june",
    "month-july",
    "month-august",
    "month-september",
    "month-october",
    "month-november",
    "month-december",
  ],
  seasonal: ["autumn"],
};

/** Every theme: grouped, then in calendar order within each group. */
export const HOLIDAY_ORDER: HolidayId[] = HOLIDAY_GROUPS.flatMap((g) => HOLIDAY_GROUP_ORDER[g.id]);

/**
 * Christmas is the one holiday with a picker sub-choice: a richer, dedicated
 * hero (dark background, a foreground pile of illustrated foil gifts, snow)
 * rendered by `ChristmasHero` instead of the generic gradient-and-emoji
 * treatment every other holiday uses. `HOLIDAY_THEMES.christmas` above stays
 * as a plain fallback (kept for type completeness / in case ChristmasHero
 * ever fails to resolve a variant) but isn't what a visitor actually sees.
 */
export type ChristmasVariantId = "emerald" | "ruby";
/** What's actually stored: a fixed variant, or "alternate" to let it change
 *  from one visit to the next rather than settle on one color. */
export type ChristmasVariantChoice = ChristmasVariantId | "alternate";

export type ChristmasVariant = {
  id: ChristmasVariantId;
  label: string;
  menuEmoji: string;
  background: string;
};

export const CHRISTMAS_VARIANTS: Record<ChristmasVariantId, ChristmasVariant> = {
  emerald: {
    id: "emerald",
    label: "Emerald Night",
    menuEmoji: "🟢",
    background: "radial-gradient(120% 90% at 50% 0%, #0f3d2c 0%, #0a2b1f 55%, #071d15 100%)",
  },
  ruby: {
    id: "ruby",
    label: "Midnight Ruby",
    menuEmoji: "🔴",
    background: "radial-gradient(120% 90% at 50% 0%, #5c1220 0%, #420b17 55%, #2c0710 100%)",
  },
};

export const CHRISTMAS_VARIANT_ORDER: ChristmasVariantId[] = ["emerald", "ruby"];
