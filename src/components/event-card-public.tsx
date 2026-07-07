import { Link } from "@tanstack/react-router";
import { Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { categoryClasses, categoryLabel } from "@/lib/categories";

export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  category: string | null;
  image_url: string | null;
  going_count: number;
  event_format?: string | null;
};

const FALLBACK_GRADIENTS = [
  "from-fuchsia-400 via-pink-400 to-amber-300",
  "from-sky-400 via-cyan-400 to-emerald-300",
  "from-violet-500 via-fuchsia-400 to-pink-400",
  "from-orange-400 via-rose-400 to-fuchsia-400",
  "from-lime-400 via-emerald-400 to-sky-400",
  "from-amber-400 via-orange-400 to-rose-400",
];

const EMOJI_BY_CATEGORY: Record<string, string> = {
  sports: "⚽",
  networking: "🤝",
  education: "📚",
  social: "🎉",
  fundraiser: "❤️",
  workshop: "🛠️",
  other: "✨",
};

export function EventCardPublic({ event, index = 0 }: { event: PublicEvent; index?: number }) {
  const date = new Date(event.start_time);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
  const emoji = EMOJI_BY_CATEGORY[event.category ?? "other"] ?? "✨";
  const trending = event.going_count >= 10;

  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      className="card-pop group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(236,72,153,0.35)]"
      style={{ animationDelay: `${(index % 12) * 40}ms` }}
    >
      {/* Image / gradient */}
      <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${gradient}`}>
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-7xl drop-shadow-lg">
            {emoji}
          </div>
        )}
        {trending && (
          <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-rose-600 shadow-md">
            🔥 Trending
          </div>
        )}
        <div className="absolute right-3 top-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur ${categoryClasses(event.category)}`}
          >
            {categoryLabel(event.category ?? "other")}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-lg font-bold text-slate-900 group-hover:text-fuchsia-600 transition-colors">
          {event.title}
        </h3>

        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-fuchsia-500" />
            <span>{dateLabel} · {timeLabel}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-sky-500" />
              <span className="line-clamp-1">{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              {event.going_count > 0 ? `${event.going_count} going 🎊` : "Be the first to join"}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Free to browse
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-fuchsia-600 group-hover:gap-2 transition-all">
            View event <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}