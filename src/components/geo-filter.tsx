import { useEffect, useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RADIUS_OPTIONS, geocodeAddress } from "@/queries/events";

export type GeoState = {
  near: string;
  lat: number | null;
  lng: number | null;
  radius: number;
};

type Props = {
  geo: GeoState;
  onChange: (next: Partial<GeoState>) => void;
  matchCount: number | null;
};

export function GeoFilter({ geo, onChange, matchCount }: Props) {
  const [input, setInput] = useState(geo.near);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setInput(geo.near), [geo.near]);

  const active = geo.lat != null && geo.lng != null;

  async function applyAddress(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q) {
      clear();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hit = await geocodeAddress(q);
      if (!hit) {
        setError("We couldn't find that place. Try a city or ZIP code.");
        return;
      }
      onChange({ near: q, lat: hit.latitude, lng: hit.longitude });
    } catch {
      setError("Location lookup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function nearMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Your device doesn't support location sharing.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({ near: "My location", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBusy(false);
        setError("We couldn't get your location. Check browser permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function clear() {
    setInput("");
    setError(null);
    onChange({ near: "", lat: null, lng: null });
  }

  return (
    <div className="mb-6 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <form onSubmit={applyAddress} className="flex flex-1 items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
            <MapPin className="h-4 w-4 shrink-0 text-fuchsia-500" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Address or ZIP code (e.g. 32202)"
              inputMode="text"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {active && (
              <button type="button" onClick={clear} aria-label="Clear location filter" className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" className="rounded-full" disabled={busy}>
            <Search className="mr-1 h-3.5 w-3.5" /> {busy ? "Searching…" : "Search"}
          </Button>
        </form>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={nearMe}
          disabled={busy}
          className="rounded-full md:w-auto"
        >
          <LocateFixed className="mr-1 h-3.5 w-3.5" /> Find events near me
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <label htmlFor="radius" className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Within {geo.radius} miles
        </label>
        <input
          id="radius"
          type="range"
          min={0}
          max={RADIUS_OPTIONS.length - 1}
          step={1}
          value={Math.max(0, RADIUS_OPTIONS.indexOf(geo.radius as (typeof RADIUS_OPTIONS)[number]))}
          onChange={(e) => onChange({ radius: RADIUS_OPTIONS[Number(e.target.value)] })}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-fuchsia-500"
        />
        <div className="flex gap-1 text-[11px] font-semibold text-slate-500">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ radius: r })}
              className={`rounded-full px-2.5 py-1 ${geo.radius === r ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
            >
              {r} mi
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
      {!error && active && (
        <p className="mt-3 text-xs text-slate-500">
          Showing {matchCount ?? 0} mapped {matchCount === 1 ? "event" : "events"} within {geo.radius} miles of{" "}
          <span className="font-semibold text-slate-700">{geo.near}</span>. Events without a pinned location are hidden
          while this filter is on.
        </p>
      )}
    </div>
  );
}