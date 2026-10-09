import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { checkAnonRateLimit, clientAddress } from "@/lib/anon-rate-limit.server";

// auth.tsx calls Supabase Auth directly from the browser (signUp,
// signInWithPassword, resetPasswordForEmail) -- there's no server function
// in front of any of it to rate-limit by IP the way submitEvent now is.
// Proxying the whole auth call through our server is a bigger change than
// this warrants; this is the smaller fix that still closes the actual gap:
// call this first and bail out before ever reaching Supabase once a kind's
// limit is hit per IP. A client that skips this call just talks straight to
// Supabase, same as today -- this is about throttling our own UI's retry
// loop, not a hard security boundary.
const KIND_LIMITS = {
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  signin: { limit: 10, windowMs: 5 * 60 * 1000 },
  reset: { limit: 3, windowMs: 60 * 60 * 1000 },
} as const;

export const checkAuthAttempt = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ kind: z.enum(["signup", "signin", "reset"]) }).parse(d))
  .handler(async ({ data }) => {
    const ip = clientAddress(getRequest().headers);
    const { limit, windowMs } = KIND_LIMITS[data.kind];
    const rate = await checkAnonRateLimit(`auth:${data.kind}:ip:${ip}`, limit, windowMs);
    if (!rate.allowed) {
      throw new Error("Too many attempts. Please try again later.");
    }
    return { ok: true };
  });
