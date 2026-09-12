/**
 * Counting sponsor ad views and clicks, including for visitors who are not
 * signed in and are not even on our domain.
 *
 * Server-only: it holds the hashing secret and writes through the service role.
 * Never import this from a component.
 */
import { createHmac } from "node:crypto";

export type AdSurface = "embed" | "site";
export type AdKind = "impression" | "click";

/** A 1x1 transparent GIF: 42 bytes, understood by everything, and smaller than
 *  the equivalent PNG. This ships on every ad render on every embed, so the
 *  pedantry pays for itself. */
export const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** Never cached anywhere. A cached pixel is an uncounted view, and a cached
 *  redirect sends a later visitor to a campaign that has since ended. */
export const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
} as const;

/**
 * Requests we decline to count.
 *
 * Crawlers fetch every URL on a page, prefetchers fetch pages nobody opened,
 * and link unfurlers fetch a page each time it is pasted into a chat. Counting
 * any of them means handing an advertiser a number with machines in it, which
 * is worse than a smaller honest number: the first advertiser who cross-checks
 * against their own analytics stops trusting everything else we report.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|scrape|fetch|curl|wget|python-requests|http-client|headless|phantom|puppeteer|playwright|lighthouse|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|quora link|vkshare|skypeuripreview|bitlybot|applebot|yandex|baidu|duckduck|semrush|ahrefs|mj12|dotbot/i;

export function isCountableAgent(headers: Headers): boolean {
  const ua = headers.get("user-agent") ?? "";
  // A browser always sends one. No user agent is a script, and a script is not
  // an impression.
  if (ua.trim().length < 8) return false;
  if (BOT_UA.test(ua)) return false;

  // Chrome and Firefox announce speculative loads. A page the visitor never
  // opened is not a view of an ad they never saw.
  const purpose = (
    headers.get("sec-purpose") ??
    headers.get("purpose") ??
    headers.get("x-purpose") ??
    ""
  ).toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender")) return false;

  return true;
}

/** Best guess at the client address, trusting the proxy chain we run behind. */
function clientAddress(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}

/**
 * A per-day fingerprint, so two visitors can be told apart without knowing who
 * either of them is.
 *
 * The address is never stored -- only this HMAC, which cannot be reversed
 * without the key. The current date is part of the input, so the same person
 * hashes differently tomorrow and the rows cannot be stitched into a history of
 * anyone's browsing. That also means no cookie, no local storage and nothing
 * that needs a consent banner on a customer's website, which matters when the
 * whole proposition is that embedding our calendar makes their site simpler
 * rather than more encumbered.
 */
export function visitorHash(headers: Headers): string {
  // Rotating the key daily is what bounds correlation; the secret only has to
  // be stable and server-side. AD_STATS_SALT allows rotating it deliberately,
  // and the service key is a sane default because the feature should not
  // silently stop counting just because one more variable went unset.
  const secret =
    process.env.AD_STATS_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eventhub-ad-stats";
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", `${secret}:${day}`)
    .update(`${clientAddress(headers)}|${headers.get("user-agent") ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Records one view or click. Returns whether it counted.
 *
 * Never throws. A failure here must not break the page an advertiser paid to
 * appear on, nor delay the visitor's redirect: the point of the statistic is
 * the advertiser's confidence, and an outage that also took down their traffic
 * would cost far more than a missing row.
 */
export async function recordAdEvent(
  slotId: string,
  kind: AdKind,
  surface: AdSurface,
  headers: Headers,
): Promise<boolean> {
  if (!isCountableAgent(headers)) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data, error } = await (supabaseAdmin as any).rpc("record_ad_event", {
      p_slot_id: slotId,
      p_kind: kind,
      p_surface: surface,
      p_visitor_hash: visitorHash(headers),
    });
    if (error) {
      console.error("record_ad_event failed", error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error("record_ad_event threw", err);
    return false;
  }
}

/** The destination for a click, straight from the database. The request never
 *  gets a say -- see get_ad_destination in the migration for why. */
export async function adDestination(slotId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data, error } = await (supabaseAdmin as any).rpc("get_ad_destination", {
      p_slot_id: slotId,
    });
    if (error || typeof data !== "string") return null;
    // The column has an https CHECK on it, but this string is about to become a
    // Location header, so it is re-checked rather than assumed.
    return /^https:\/\//i.test(data) ? data : null;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export function surfaceOf(url: URL): AdSurface {
  return url.searchParams.get("s") === "embed" ? "embed" : "site";
}
