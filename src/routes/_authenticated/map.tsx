import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getMapEvents } from "@/lib/search.functions";
import { CATEGORIES, categoryLabel, categoryClasses } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
  head: () => ({ meta: [{ title: "Map — EventHub" }] }),
});

// Fix leaflet default marker icons in bundlers
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type EventMarker = Awaited<ReturnType<typeof getMapEvents>>[number];

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 12);
  }, [lat, lng, map]);
  return null;
}

function MapPage() {
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [center, setCenter] = useState<[number, number]>([30.7744, -85.2264]);

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
        <MapContainer center={center} zoom={11} className="h-full w-full">
          <Recenter lat={center[0]} lng={center[1]} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map((ev) => (
            <Marker key={ev.id} position={[ev.latitude, ev.longitude]}>
              <Popup>
                <div className="space-y-1">
                  <div className={`inline-block rounded-full px-2 py-0.5 text-[10px] capitalize ${categoryClasses(ev.category)}`}>
                    {categoryLabel(ev.category)}
                  </div>
                  <div className="font-semibold">{ev.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(ev.start_time).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  {ev.location && <div className="text-xs">{ev.location}</div>}
                  <Link
                    to="/events/$id"
                    params={{ id: ev.id }}
                    className="text-xs font-medium text-primary underline"
                  >
                    Open event →
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}