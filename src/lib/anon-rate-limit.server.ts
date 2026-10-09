// Server-only: a fixed-window rate limit for actions with no API key to key
// off of (anonymous event submission, auth attempts). Same upsert-and-
// increment approach as checkApiRateLimit in api-auth.server.ts, generalized
// to an arbitrary bucket key and window length instead of a fixed 60s/key_id.
export async function checkAnonRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any; // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);

  const { data: existing } = await admin
    .from("anon_rate_buckets")
    .select("count")
    .eq("bucket_key", bucketKey)
    .eq("window_start", windowStart.toISOString())
    .maybeSingle();

  const nextCount = (existing?.count ?? 0) + 1;
  await admin
    .from("anon_rate_buckets")
    .upsert(
      { bucket_key: bucketKey, window_start: windowStart.toISOString(), count: nextCount },
      { onConflict: "bucket_key,window_start" },
    );

  return { allowed: nextCount <= limit, retryAfterSeconds };
}

/** Best guess at the client address, trusting the proxy chain we run behind.
 *  Same logic as ad-tracking.server.ts's clientAddress -- duplicated rather
 *  than imported since that file is scoped to ad tracking and this is a
 *  generic concern several server functions need. */
export function clientAddress(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}
