import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type GeocodeHit = { label: string; latitude: number; longitude: number };

const cache = new Map<string, GeocodeHit | null>();

/** Server-side address/ZIP lookup (browsers calling the map service directly get blocked). */
export const geocodeServer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<GeocodeHit | null> => {
    const key = data.q.toLowerCase();
    if (cache.has(key)) return cache.get(key) ?? null;
    const isZip = /^\d{5}(-\d{4})?$/.test(data.q);
    const params = new URLSearchParams({ format: "json", limit: "1", countrycodes: "us" });
    if (isZip) params.set("postalcode", data.q.slice(0, 5));
    else params.set("q", data.q);
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
  });
