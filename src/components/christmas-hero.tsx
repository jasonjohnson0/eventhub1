import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import thumbnail from "@/assets/gumroad-thumbnail.jpg";
import {
  CHRISTMAS_VARIANTS,
  type ChristmasVariantChoice,
  type ChristmasVariantId,
} from "@/lib/holiday-themes";

type Props = {
  query: string;
  onQuery: (q: string) => void;
  category: string | null;
  onCategory: (c: string | null) => void;
  /** A fixed variant, or "alternate" to pick one at random for this visit. */
  variant: ChristmasVariantChoice;
};

const PILL_COLORS: Record<string, string> = {
  sports: "from-emerald-400 to-teal-500",
  networking: "from-sky-400 to-indigo-500",
  education: "from-amber-400 to-orange-500",
  social: "from-fuchsia-400 to-pink-500",
  fundraiser: "from-rose-400 to-red-500",
  workshop: "from-violet-400 to-purple-500",
  other: "from-slate-400 to-slate-500",
};

const CONFETTI_COLORS = ["#dc2626", "#15803d", "#facc15", "#ffffff", "#1d4ed8"];

/** Dark base -> saturated -> a bright band -> saturated -> dark base, so the
 *  diagonal gradient reads as a highlight catching foil wrapping paper. */
const GIFT_PALETTES = {
  red: ["#5b0f1a", "#c8202f", "#ffb3ba", "#c8202f", "#5b0f1a"],
  green: ["#0b3a26", "#12854f", "#a9f5cf", "#12854f", "#0b3a26"],
  gold: ["#7a5a08", "#e0a916", "#fff3c2", "#e0a916", "#7a5a08"],
  cream: ["#b8ada0", "#efe7d8", "#ffffff", "#efe7d8", "#b8ada0"],
  silver: ["#6b7280", "#cbd5e1", "#ffffff", "#cbd5e1", "#6b7280"],
  plum: ["#3b0a4a", "#8b2fae", "#e9c6ff", "#8b2fae", "#3b0a4a"],
} as const;
type PaletteId = keyof typeof GIFT_PALETTES;

const STOP_OFFSETS = [0, 32, 50, 68, 100];

function GiftIcon({
  box,
  ribbon,
  className,
  style,
}: {
  box: PaletteId;
  ribbon: PaletteId;
  className?: string;
  style?: React.CSSProperties;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const boxId = `giftbox-${rawId}`;
  const ribbonId = `giftribbon-${rawId}`;
  return (
    <div
      className={`pointer-events-none absolute drop-shadow-[0_14px_18px_rgba(0,0,0,0.45)] ${className ?? ""}`}
      style={style}
    >
      <svg viewBox="0 0 64 64" className="block h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={boxId} x1="0%" y1="0%" x2="100%" y2="100%">
            {GIFT_PALETTES[box].map((c, i) => (
              <stop key={i} offset={`${STOP_OFFSETS[i]}%`} stopColor={c} />
            ))}
          </linearGradient>
          <linearGradient id={ribbonId} x1="0%" y1="0%" x2="100%" y2="100%">
            {GIFT_PALETTES[ribbon].map((c, i) => (
              <stop key={i} offset={`${STOP_OFFSETS[i]}%`} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
        <rect x="7" y="25" width="50" height="32" rx="3" fill={`url(#${boxId})`} />
        <rect x="5" y="17" width="54" height="11" rx="3" fill={`url(#${boxId})`} />
        <rect x="26" y="17" width="12" height="40" fill={`url(#${ribbonId})`} />
        <rect x="5" y="19.5" width="54" height="7.5" fill={`url(#${ribbonId})`} />
        <path d="M32 17 C 23 17 18 6 27 4 C 33 3 32 13 32 17 Z" fill={`url(#${ribbonId})`} />
        <path d="M32 17 C 41 17 46 6 37 4 C 31 3 32 13 32 17 Z" fill={`url(#${ribbonId})`} />
        <circle cx="32" cy="13.5" r="4.5" fill={`url(#${ribbonId})`} />
      </svg>
    </div>
  );
}

/** Two tall boxes flank the search bar's ends -- positioned off the hero's
 *  horizontal center rather than its edges, so the bows land in roughly the
 *  same place regardless of viewport width. Everything else cascades
 *  outward and down toward the corners. Percentage-based (not the fixed-px
 *  layout from the design sample) so it holds together on a phone too. */
const GIFTS: Array<{
  box: PaletteId;
  ribbon: PaletteId;
  side: "left" | "right";
  offset: string;
  bottom: string;
  size: string;
  rotate: number;
  z: number;
}> = [
  { box: "red", ribbon: "gold", side: "left", offset: "18%", bottom: "0", size: "clamp(140px,26vw,260px)", rotate: -7, z: 4 },
  { box: "green", ribbon: "gold", side: "right", offset: "18%", bottom: "0", size: "clamp(140px,26vw,260px)", rotate: 7, z: 4 },

  { box: "green", ribbon: "red", side: "left", offset: "4%", bottom: "0", size: "clamp(90px,17vw,170px)", rotate: 10, z: 3 },
  { box: "plum", ribbon: "gold", side: "right", offset: "4%", bottom: "0", size: "clamp(90px,17vw,170px)", rotate: -9, z: 3 },

  { box: "gold", ribbon: "green", side: "left", offset: "-2%", bottom: "-2%", size: "clamp(64px,12vw,118px)", rotate: -6, z: 2 },
  { box: "silver", ribbon: "red", side: "right", offset: "-2%", bottom: "-2%", size: "clamp(64px,12vw,118px)", rotate: 5, z: 2 },

  { box: "silver", ribbon: "red", side: "left", offset: "37%", bottom: "-4%", size: "clamp(50px,9vw,92px)", rotate: 6, z: 1 },
  { box: "cream", ribbon: "gold", side: "right", offset: "37%", bottom: "-4%", size: "clamp(48px,9vw,86px)", rotate: -5, z: 1 },
];

const SPARKLE_POSITIONS: Array<[number, number, number]> = [
  [4, 10, 3], [12, 20, 2], [22, 7, 2], [34, 16, 3], [46, 9, 2],
  [58, 22, 2], [68, 6, 3], [80, 18, 2], [90, 11, 2], [96, 24, 3],
];

function SnowDrift() {
  return (
    <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
      <path
        d="M0,40 L0,22 C 20,8 40,8 60,18 C 82,30 100,6 125,14 C 150,22 165,4 190,12 C 215,20 230,2 258,10 C 286,18 302,6 330,16 C 356,25 374,10 400,20 L400,40 Z"
        fill="#f2f6fb"
      />
    </svg>
  );
}

export function ChristmasHero({ query, onQuery, category, onCategory, variant }: Props) {
  // "Alternate" means the look changes from one visit to the next rather
  // than settling on one color -- resolved once per mount, not re-rolled on
  // every render.
  const [resolvedId] = useState<ChristmasVariantId>(() =>
    variant === "alternate" ? (Math.random() < 0.5 ? "emerald" : "ruby") : variant,
  );
  const bg = CHRISTMAS_VARIANTS[resolvedId].background;

  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const t = setTimeout(() => {
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.35 }, colors: CONFETTI_COLORS });
    }, 250);
    return () => clearTimeout(t);
  }, []);

  function burst() {
    confetti({ particleCount: 60, spread: 60, origin: { y: 0.4 }, colors: CONFETTI_COLORS });
  }

  const sparkles = useMemo(() => SPARKLE_POSITIONS, []);

  return (
    <section className="relative overflow-hidden" style={{ background: bg }}>
      {/* Sky sparkles */}
      <div className="pointer-events-none absolute inset-0">
        {sparkles.map(([x, y, s], i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white shadow-[0_0_6px_1px_rgba(255,255,255,0.7)]"
            style={{ left: `${x}%`, top: `${y}%`, width: s, height: s }}
          />
        ))}
      </div>

      <div className="relative z-30 mx-auto max-w-5xl px-6 pt-10 text-center sm:pt-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-100 shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Something's always happening
        </div>
        <h1 className="text-5xl font-black leading-tight tracking-tight text-[#fbf6ee] [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] md:text-6xl">
          <span className="mr-2">🎄</span>
          Discover amazing events
          <span className="ml-2">🎄</span>
          <br />
          <span className="bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
            happening near you
          </span>
        </h1>
        <p className="mx-auto mt-2.5 max-w-xl text-lg text-stone-300">
          Browse the community calendar. Find your next adventure — no account needed.
        </p>

        <Link
          to="/tour"
          className="mt-5 inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 py-1.5 pl-1.5 pr-5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
        >
          <img
            src={thumbnail}
            alt="EventHub — keep 100% of your event revenue"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-white/70"
          />
          Running your own calendar? Keep 100% of the revenue →
        </Link>

        {/* Search */}
        <div className="mx-auto mt-4 max-w-2xl">
          <div className="group flex items-center gap-3 rounded-full border-2 border-white/50 bg-white/96 p-2 pl-6 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-shadow">
            <Search className="h-5 w-5 text-red-700" />
            <input
              type="text"
              value={query}
              onFocus={burst}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Find events, places, or vibes…"
              className="flex-1 bg-transparent py-2 text-base outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                onClick={() => onQuery("")}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2 pb-8">
          <button
            onClick={() => onCategory(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 ${
              category === null
                ? "bg-white text-slate-900 shadow-lg"
                : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            All ✨
          </button>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                onClick={() => onCategory(active ? null : c)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 ${
                  active
                    ? `bg-gradient-to-r ${PILL_COLORS[c]} text-white shadow-lg`
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Foreground gift pile -- z-20, behind the text but in front of the
          background; positioned from the bottom so it never adds page
          height of its own. */}
      <div className="relative z-20 mx-auto h-[220px] max-w-5xl sm:h-[300px]">
        <div className="absolute inset-x-0 bottom-0 z-10 h-12 sm:h-16">
          <SnowDrift />
        </div>
        {GIFTS.map((g, i) => (
          <GiftIcon
            key={i}
            box={g.box}
            ribbon={g.ribbon}
            style={{
              [g.side]: g.offset,
              bottom: g.bottom,
              width: g.size,
              height: g.size,
              transform: `rotate(${g.rotate}deg)`,
              zIndex: g.z,
            }}
          />
        ))}
      </div>
    </section>
  );
}
