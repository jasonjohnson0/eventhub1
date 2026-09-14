// Server-only: coordinator REST API key generation, verification, and rate
// limiting (spec 09). Never log the raw Bearer token -- only its prefix,
// which is also all that's ever displayed back in the UI after creation.
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "eh_live_";

/** A freshly minted key: `secret` is shown to the coordinator exactly once
 *  and never stored anywhere; `prefix` and `hash` are what persists. */
export function generateApiKey(): { secret: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const secret = `${KEY_PREFIX}${raw}`;
  const prefix = `${KEY_PREFIX}${raw.slice(0, 8)}`;
  return { secret, prefix, hash: hashApiKey(secret) };
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export type ApiAuthContext = { coordinatorId: string; keyId: string };

/** Verifies a request's Bearer token against coordinator_api_keys. Returns
 *  null for anything wrong (missing header, unknown hash, revoked key) --
 *  callers turn that into a 401, never a more specific error that would
 *  help an attacker distinguish "wrong secret" from "unknown key". */
export async function authenticateApiRequest(request: Request): Promise<ApiAuthContext | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const secret = auth.slice("Bearer ".length).trim();
  if (!secret.startsWith(KEY_PREFIX)) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = hashApiKey(secret);
  // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
  const { data: row } = await (supabaseAdmin as any)
    .from("coordinator_api_keys")
    .select("id, coordinator_id, revoked_at")
    .eq("secret_hash", hash)
    .maybeSingle();
  if (!row || row.revoked_at) return null;

  // Best-effort, fire-and-forget -- a failed last_used_at write must never
  // fail the actual request it's timestamping.
  void (supabaseAdmin as any)
    .from("coordinator_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => undefined, () => undefined);

  return { coordinatorId: row.coordinator_id, keyId: row.id };
}

const RATE_LIMIT_PER_MINUTE = 60;

/** Fixed-window rate limit, 60 req/min/key (spec's own choice over Redis --
 *  grepped first, nothing else in this codebase uses one). Returns
 *  {allowed: false} once the window's count would exceed the limit; the
 *  caller is responsible for still counting the request that got the 429,
 *  so a client hammering the endpoint doesn't get a free retry every time. */
export async function checkApiRateLimit(
  keyId: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any; // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + 60000 - now.getTime()) / 1000);

  // Upsert-and-increment: read current count, then write count+1. A tiny
  // race under real concurrency could under-count by one request at this
  // volume (60/min/key) -- not worth a stored procedure for a soft limit.
  const { data: existing } = await admin
    .from("api_rate_buckets")
    .select("count")
    .eq("key_id", keyId)
    .eq("window_start", windowStart.toISOString())
    .maybeSingle();

  const nextCount = (existing?.count ?? 0) + 1;
  await admin
    .from("api_rate_buckets")
    .upsert(
      { key_id: keyId, window_start: windowStart.toISOString(), count: nextCount },
      { onConflict: "key_id,window_start" },
    );

  return { allowed: nextCount <= RATE_LIMIT_PER_MINUTE, retryAfterSeconds };
}

export function jsonError(status: number, code: string, message: string, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

export function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Every /api/v1 route calls this first. Handles auth + rate limit +
 *  standard error shapes so no individual route reimplements them. */
export async function withApiAuth(
  request: Request,
  handler: (ctx: ApiAuthContext) => Promise<Response>,
): Promise<Response> {
  const ctx = await authenticateApiRequest(request);
  if (!ctx) return jsonError(401, "unauthorized", "Missing, invalid, or revoked API key");
  const rate = await checkApiRateLimit(ctx.keyId);
  if (!rate.allowed) {
    return jsonError(429, "rate_limited", "Too many requests", {
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }
  try {
    return await handler(ctx);
  } catch (err) {
    console.error("[api/v1] unhandled error:", err);
    return jsonError(500, "internal_error", "Something went wrong");
  }
}
