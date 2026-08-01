import { useEffect, useRef } from "react";
import { Search, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { CATEGORIES, categoryLabel } from "@/lib/categories";

type Props = {
  query: string;
  onQuery: (q: string) => void;
  category: string | null;
  onCategory: (c: string | null) => void;
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

export function PublicHero({ query, onQuery, category, onCategory }: Props) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const t = setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.35 },
        colors: ["#f472b6", "#facc15", "#38bdf8", "#4ade80", "#c084fc"],
      });
    }, 250);
    return () => clearTimeout(t);
  }, []);

  function burst() {
    confetti({
      particleCount: 60,
      spread: 60,
      origin: { y: 0.4 },
      colors: ["#f472b6", "#facc15", "#38bdf8"],
    });
  }

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-amber-100 via-pink-100 to-sky-100">
      {/* Floating decorations */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-8 top-10 animate-[float_6s_ease-in-out_infinite] text-5xl">☀️</div>
        <div className="absolute right-10 top-16 animate-[float_7s_ease-in-out_infinite] text-4xl" style={{ animationDelay: "0.5s" }}>🎈</div>
        <div className="absolute left-1/4 bottom-10 animate-[float_8s_ease-in-out_infinite] text-3xl" style={{ animationDelay: "1s" }}>😊</div>
        <div className="absolute right-1/4 bottom-16 animate-[float_9s_ease-in-out_infinite] text-3xl" style={{ animationDelay: "1.5s" }}>🎉</div>
        <div className="absolute right-16 bottom-8 animate-[float_7s_ease-in-out_infinite] text-4xl" style={{ animationDelay: "2s" }}>🎭</div>
        <div className="absolute left-16 top-1/2 animate-[float_10s_ease-in-out_infinite] text-3xl" style={{ animationDelay: "2.5s" }}>⭐</div>
      </div>

      <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-14 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-fuchsia-700 shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Something's always happening
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-tight">
          <span className="mr-2">🎉</span>
          Discover amazing events
          <span className="ml-2">🎉</span>
          <br />
          <span className="bg-gradient-to-r from-fuchsia-600 via-pink-500 to-amber-500 bg-clip-text text-transparent">
            happening near you
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-700">
          Browse the community calendar. Find your next adventure — no account needed.
        </p>

        <Link
          to="/tour"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 px-5 py-2 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
        >
          💸 Running your own calendar? Keep 100% of the revenue →
        </Link>

        {/* Search */}
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="group flex items-center gap-3 rounded-full border-2 border-white bg-white/95 p-2 pl-6 shadow-[0_10px_40px_-10px_rgba(236,72,153,0.4)] focus-within:shadow-[0_20px_50px_-10px_rgba(236,72,153,0.6)] transition-shadow">
            <Search className="h-5 w-5 text-fuchsia-500" />
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
        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
          <button
            onClick={() => onCategory(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 ${
              category === null
                ? "bg-slate-900 text-white shadow-lg"
                : "bg-white/80 text-slate-700 hover:bg-white"
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
                    : "bg-white/80 text-slate-700 hover:bg-white"
                }`}
              >
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}