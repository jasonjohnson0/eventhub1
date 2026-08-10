import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "@tanstack/react-router";
import { categoryClasses, categoryLabel } from "@/lib/categories";

// Fix leaflet's default marker icon URLs in bundlers
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
  return null;
}

export type MapEvent = {
  id: string;
  title: string;
  category: string;
  location: string | null;
  start_time: string;
  latitude: number;
  longitude: number;
};

export default function MapCanvas({
  center,
  events,
  radiusMiles,
}: {
  center: [number, number];
  events: MapEvent[];
  radiusMiles?: number | null;
}) {
  const zoom = radiusMiles ? (radiusMiles <= 5 ? 12 : radiusMiles <= 10 ? 11 : radiusMiles <= 25 ? 10 : 9) : 12;
  return (
    <MapContainer center={center} zoom={11} className="h-full w-full">
      <Recenter lat={center[0]} lng={center[1]} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {radiusMiles ? (
        <Circle
          center={center}
          radius={radiusMiles * 1609.34}
          pathOptions={{ color: "#d946ef", fillColor: "#f0abfc", fillOpacity: 0.12, weight: 2 }}
        />
      ) : null}
      {events.map((ev) => (
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
  );
}