import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { getMapEvents } from "@/lib/search.functions";
import { CATEGORIES, categoryLabel, categoryClasses } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

// Client-only: leaflet accesses `window` at module load, so keep it out of the SSR graph.
const MapCanvas = lazy(() => import("@/components/map-canvas"));

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
  head: () => ({ meta: [{ title: "Map — EventHub" }] }),
});

type EventMarker = Awaited<ReturnType<typeof getMapEvents>>[number];

function MapPage() {
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [center, setCenter] = useState<[number, number]>([30.7744, -85.2264]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    getMapEvents().then(setEvents);
  }, []);

  const filtered = useMemo(
    () => (activeCats.size === 0 ? events : events.filter((e) => activeCats.has(e.category))),
    [events, activeCats],
  );

  function toggle(cat: string) {
    setActiveCats((s) => {
      const n = new Set(s);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  }

  function nearMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setCenter([pos.coords.latitude, pos.coords.longitude]);
    });
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-4 text-lg font-semibold">Map</h1>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const active = activeCats.has(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                className={`rounded-full border px-2.5 py-1 text-xs ${active ? categoryClasses(c) + " border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={nearMe}>
          <MapPin className="mr-1 h-3 w-3" /> Events near me
        </Button>
      </div>
      <div className="flex-1">
        {mounted ? (
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading map…</div>}>
            <MapCanvas center={center} events={filtered} />
          </Suspense>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading map…</div>
        )}
      </div>
    </div>
  );
}