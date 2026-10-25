import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

export type GeocodeHit = { label: string; latitude: number; longitude: number };

const cache = new Map<string, GeocodeHit | null>();

/**
 * Plain server-side helper (not a server function) so other server code --
 * e.g. submission approval geocoding a venue address -- can reuse it without
 * going through the RPC layer. Server-only: never import from client code.
 */
export async function geocodeAddressServer(q: string): Promise<GeocodeHit | null> {
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  const isZip = /^\d{5}(-\d{4})?$/.test(q);
  const params = new URLSearchParams({ format: "json", limit: "1", countrycodes: "us" });
  if (isZip) params.set("postalcode", q.slice(0, 5));
  else params.set("q", q);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DothanToday/1.0 (https://www.dothantoday.com)",
      Referer: "https://www.dothantoday.com",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Lookup failed [${res.status}]`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = rows[0]
    ? { label: rows[0].display_name, latitude: Number(rows[0].lat), longitude: Number(rows[0].lon) }
    : null;
  if (cache.size > 500) cache.clear();
  cache.set(key, hit);
  return hit;
}

/** Server-side address/ZIP lookup (browsers calling the map service directly get blocked). */
export const geocodeServer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<GeocodeHit | null> => geocodeAddressServer(data.q));

export type IpGeoHit = {
  label: string;
  latitude: number;
  longitude: number;
  /** "ip" = coarse IP-based guess; the UI must never present it as exact. */
  source: "ip";
};

/**
 * Approximate visitor location from the edge network's own IP geolocation
 * (Cloudflare sets request.cf; no third-party call, no consent prompt, no
 * storage). Returns null where the platform doesn't provide it (local dev),
 * and callers must treat null as "show everything, don't filter" -- never
 * fall back to 0,0.
 */
export const geolocateIpServer = createServerFn({ method: "GET" }).handler(
  async (): Promise<IpGeoHit | null> => {
    try {
      const req = getRequest() as Request & {
        cf?: { city?: string; region?: string; country?: string; latitude?: string; longitude?: string };
      };
      const cf = req.cf;
      const lat = cf?.latitude ? Number(cf.latitude) : NaN;
      const lng = cf?.longitude ? Number(cf.longitude) : NaN;
      if (!cf || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        return null;
      }
      const place = [cf.city, cf.region].filter(Boolean).join(", ");
      return {
        label: place ? `${place} area` : "your area",
        latitude: lat,
        longitude: lng,
        source: "ip",
      };
    } catch {
      return null;
    }
  },
);
