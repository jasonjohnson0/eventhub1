/** The origin this deployment is served from, without a trailing slash.
 *
 *  Canonical tags, embed links and outbound emails all need an absolute URL,
 *  and each of them used to build one inline -- including a hardcoded
 *  lovable.app fallback that would have mailed people a link to the wrong
 *  deployment once we moved to Vercel. One helper, one answer.
 *
 *  Safe to import from a route: the browser branch is taken before the
 *  process.env lookup is ever evaluated, so this never runs `process` client
 *  side. */
export function siteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

/** An absolute URL for `path` ("/c/acme"), or the path itself when the origin
 *  is unknown. A relative canonical still resolves correctly; a canonical
 *  pointing at the literal string "undefined" does not. */
export function siteUrl(path: string): string {
  const origin = siteOrigin();
  return origin ? `${origin}${path}` : path;
}
