import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SponsorSlotRow = {
  slot_id: string;
  position: number;
  slot_type: string;
  status: string;
  cost_cents: number;
  /** Null when nobody has bought this slot yet. */
  sponsor_id: string | null;
  /** Whatever was recorded at sale time; a useful default for business_name. */
  external_name: string | null;
  creative: SponsorCreative | null;
};

export type SponsorCreative = {
  business_name: string;
  logo_url: string | null;
  link_url: string | null;
  headline: string | null;
  body: string | null;
};

/**
 * Mirrors the CHECK constraints on sponsor_creatives so a coordinator gets a
 * readable message instead of a Postgres constraint violation. The database
 * remains the authority -- this is courtesy, not enforcement.
 */
const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https:\/\//i.test(v), {
    message: "Must start with https://",
  })
  .transform((v) => (v === "" ? null : v));

const creativeSchema = z.object({
  sponsor_id: z.string().uuid(),
  business_name: z.string().trim().min(1, "Required").max(120),
  logo_url: httpsUrl.nullable().default(null),
  link_url: httpsUrl.nullable().default(null),
  headline: z.string().trim().max(120).transform((v) => v || null).nullable().default(null),
  body: z.string().trim().max(400).transform((v) => v || null).nullable().default(null),
});

/**
 * Slots for one event, with whoever bought them and whatever creative they have.
 *
 * Runs on the caller's own Supabase client, so RLS decides what comes back:
 * the event's workspace members, the buyer, and admins. Anyone else gets rows
 * filtered away rather than an error, which is the correct shape for a read.
 */
export const listEventSponsors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SponsorSlotRow[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;

    const { data: slots, error } = await sb
      .from("sponsored_slots")
      .select("id, position, slot_type, status, cost_cents")
      .eq("event_id", data.eventId)
      .order("position");
    if (error) throw new Error(error.message);

    const slotIds = (slots ?? []).map((s: { id: string }) => s.id);
    if (slotIds.length === 0) return [];

    const { data: sponsors } = await sb
      .from("sponsors")
      .select("id, slot_id, external_name")
      .in("slot_id", slotIds);

    const sponsorIds = (sponsors ?? []).map((s: { id: string }) => s.id);
    const { data: creatives } = sponsorIds.length
      ? await sb
          .from("sponsor_creatives")
          .select("sponsor_id, business_name, logo_url, link_url, headline, body")
          .in("sponsor_id", sponsorIds)
      : { data: [] };

    const sponsorBySlot = new Map<string, { id: string; external_name: string | null }>();
    for (const s of sponsors ?? []) sponsorBySlot.set(s.slot_id, s);
    const creativeBySponsor = new Map<string, SponsorCreative>();
    for (const c of creatives ?? []) creativeBySponsor.set(c.sponsor_id, c);

    return (slots ?? []).map(
      (s: { id: string; position: number; slot_type: string; status: string; cost_cents: number }) => {
        const sponsor = sponsorBySlot.get(s.id) ?? null;
        return {
          slot_id: s.id,
          position: s.position,
          slot_type: s.slot_type,
          status: s.status,
          cost_cents: s.cost_cents,
          sponsor_id: sponsor?.id ?? null,
          external_name: sponsor?.external_name ?? null,
          creative: sponsor ? (creativeBySponsor.get(sponsor.id) ?? null) : null,
        };
      },
    );
  });

/**
 * Create or replace the creative for one sponsor.
 *
 * Authorization is the RLS policies on sponsor_creatives -- the advertiser who
 * bought the slot, the event's workspace, or an admin. Nothing is re-checked
 * here, so there is one place to get it wrong rather than two that can drift.
 */
export const upsertSponsorCreative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => creativeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;

    const { error } = await sb
      .from("sponsor_creatives")
      .upsert(
        {
          sponsor_id: data.sponsor_id,
          business_name: data.business_name,
          logo_url: data.logo_url,
          link_url: data.link_url,
          headline: data.headline,
          body: data.body,
        },
        { onConflict: "sponsor_id" },
      );

    if (error) {
      // An RLS denial surfaces as an empty-ish permission error; say something
      // the coordinator can act on rather than echoing Postgres.
      if (/row-level security|permission denied/i.test(error.message)) {
        throw new Error("You do not have permission to edit this sponsor's ad.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });
